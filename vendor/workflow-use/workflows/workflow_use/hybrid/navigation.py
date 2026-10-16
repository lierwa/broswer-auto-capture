"""Action-owned tab convergence through the existing public Browser API."""
import asyncio
from urllib.parse import parse_qs, urlsplit

from browser_use.browser.events import SwitchTabEvent
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, stop_before_delay, wait_fixed

from .context_bindings import native_live_pages, legal_owned_pages


NAVIGATION_ACTIONS = frozenset({'click', 'send_keys'})


def navigation_destination_matches(expected, actual):
    """Allow server-added query keys without relaxing the requested destination."""
    if not isinstance(expected, str) or not isinstance(actual, str):
        return False
    try:
        before, after = urlsplit(expected), urlsplit(actual)
        if before.scheme not in {'http', 'https'} or before.scheme != after.scheme:
            return False
        if (before.netloc.lower(), before.path or '/', before.fragment) != \
                (after.netloc.lower(), after.path or '/', after.fragment):
            return False
        requested, landed = parse_qs(before.query, keep_blank_values=True), parse_qs(after.query, keep_blank_values=True)
        # WHY：新增跟踪/展示参数可以接受；已指定的查询词、多值、路径和站点绝不能被重定向替换。
        return all(landed.get(name) == values for name, values in requested.items())
    except ValueError:
        return False


class NavigationTabPending(ValueError):
    pass


async def navigation_tab_ids(browser):
    return {str(tab.target_id) for tab in await browser.get_tabs()
            if isinstance(getattr(tab, 'target_id', None), str) and tab.target_id}


async def reconcile_closed_tab(browser, closed_id, owned_before):
    pages = await native_live_pages(browser)
    if closed_id in pages:
        # WHY：原生close可能吞错误；真实目标未消失时不重派，也不以返回文字伪造成功。
        raise ValueError('native_close_unconfirmed')
    remaining = legal_owned_pages(browser, owned_before - {closed_id}, pages)
    focus = getattr(browser, 'agent_focus_target_id', None)
    if focus in remaining:
        return
    if focus is not None and focus not in owned_before:
        raise ValueError('native_close_focus_owner_changed')
    if len(remaining) != 1:
        raise ValueError('native_close_post_observation_target_ambiguous')
    # WHY：SDK关当前页后会选启动空白页；仅复用唯一既有授权页，不开页、不接管、不重放业务动作。
    target_id = next(iter(remaining))
    # 原生detach也可清空focus；公开session池API核活页并恢复focus，再走原生切换/缓存失效。
    await browser.get_or_create_cdp_session(target_id=target_id, focus=True)
    await browser.on_SwitchTabEvent(SwitchTabEvent(target_id=target_id))
    if str(browser.agent_focus_target_id) != target_id:
        raise ValueError('native_close_post_observation_focus_changed')


async def reconcile_new_navigation_tab(browser, prior_tabs, *, attempts=100, interval=0.3, max_ms=30000,
                                       original_target_id=None):
    """Adopt only one action-created tab, then read its live URL within a bounded budget.

    This is navigation convergence, not DOM readiness. The ordinary postconditions still
    own their consumer checks and never repeat the browser action.
    """
    selected = None
    empty_samples = 0

    async def sample():
        nonlocal selected, empty_samples
        added = await navigation_tab_ids(browser) - prior_tabs
        if len(added) > 1:
            raise ValueError('ambiguous_new_navigation_tab')
        if not added:
            if selected is not None:
                raise ValueError('new_navigation_tab_disappeared')
            if original_target_id is not None and str(browser.agent_focus_target_id) != original_target_id:
                raise ValueError('navigation_tab_focus_changed')
            empty_samples += 1
            if empty_samples < min(2, attempts):
                raise NavigationTabPending('navigation_tab_discovery_pending')
            return None
        target_id = next(iter(added))
        if selected is not None and target_id != selected:
            raise ValueError('new_navigation_tab_identity_changed')
        if selected is None:
            selected = target_id
            # WHY：get_tabs 读取 Target 缓存，空 URL 不证明页面仍空白；先绑定本动作
            # 唯一新增 tab，再通过公开 Page.get_url 核验实时导航，不猜最近标签页。
            await browser.on_SwitchTabEvent(SwitchTabEvent(target_id=target_id))
        if str(browser.agent_focus_target_id) != target_id:
            raise ValueError('navigation_tab_focus_changed')
        page = await browser.get_current_page()
        if page is None:
            raise NavigationTabPending('new_navigation_tab_not_ready')
        url = await page.get_url()
        if not isinstance(url, str) or not url.strip() or url.strip().lower() == 'about:blank':
            raise NavigationTabPending('new_navigation_tab_not_ready')
        return target_id

    budget = min(max_ms / 1000, max(attempts * max(interval, 0.01), 0.1))
    try:
        async with asyncio.timeout(budget):
            return await AsyncRetrying(
                stop=stop_after_attempt(attempts) | stop_before_delay(budget),
                wait=wait_fixed(interval), retry=retry_if_exception_type(NavigationTabPending),
                reraise=True)(sample)
    except (NavigationTabPending, TimeoutError) as error:
        if selected is None and isinstance(error, NavigationTabPending):
            return None
        raise ValueError('new_navigation_tab_not_ready') from error


def navigation_action_owner(browser, prior_tabs):
    session_id = getattr(browser, 'id', None)
    target_id = getattr(browser, 'agent_focus_target_id', None)
    if (not isinstance(session_id, str) or not session_id or not isinstance(target_id, str)
            or target_id not in prior_tabs):
        raise ValueError('navigation_action_owner_unavailable')
    return {'sessionId': session_id, 'targetId': target_id}


def assert_navigation_owner(browser, owner):
    if (getattr(browser, 'id', None) != owner['sessionId']
            or getattr(browser, 'agent_focus_target_id', None) != owner['targetId']):
        raise ValueError('navigation_action_owner_changed')


async def reconcile_captured_navigation(collector, results):
    prior_tabs = collector.pending.get('navigationTabs')
    if prior_tabs is None or len(results) != 1 or results[0].error:
        return
    await reconcile_new_navigation_tab(collector.browser, prior_tabs)


def cross_tab_navigation_allowed(action, pre, post):
    if pre.tabId == post.tabId:
        return True
    if action.name == 'switch':
        before, after = _observed_tabs(pre), _observed_tabs(post)
        return (before is not None and after is not None and post.tabId in before & after
                and action.args.get('tab_id') == post.tabId[-4:])
    if action.name == 'close':
        before, after = _observed_tabs(pre), _observed_tabs(post)
        closed = [item for item in before or () if item.endswith(action.args.get('tab_id', ''))]
        return (before is not None and after is not None and len(closed) == 1
                and before - after == set(closed) and post.tabId in after)
    if action.name not in NAVIGATION_ACTIONS and not (
            action.name == 'navigate' and action.args.get('new_tab') is True):
        return False
    before, after = _observed_tabs(pre), _observed_tabs(post)
    return before is not None and after is not None and after - before == {post.tabId}


def _observed_tabs(observation):
    facts = [fact for fact in observation.facts if fact.kind == 'browser_context'
             and isinstance(fact.value, dict)]
    if len(facts) != 1:
        return None
    return {tab['targetId'] for tab in facts[0].value.get('tabs', [])
            if isinstance(tab, dict) and isinstance(tab.get('targetId'), str)}
