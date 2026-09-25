"""Action-owned tab convergence through the existing public Browser API."""
import asyncio

from browser_use.browser.events import SwitchTabEvent
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, stop_before_delay, wait_fixed


NAVIGATION_ACTIONS = frozenset({'click', 'send_keys'})


class NavigationTabPending(ValueError):
    pass


async def navigation_tab_ids(browser):
    return {str(tab.target_id) for tab in await browser.get_tabs()
            if isinstance(getattr(tab, 'target_id', None), str) and tab.target_id}


async def reconcile_new_navigation_tab(browser, prior_tabs, *, attempts=100, interval=0.3, max_ms=30000):
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


async def reconcile_captured_navigation(collector, results):
    prior_tabs = collector.pending.get('navigationTabs')
    if prior_tabs is None or len(results) != 1 or results[0].error:
        return
    await reconcile_new_navigation_tab(collector.browser, prior_tabs)


def cross_tab_navigation_allowed(action, pre, post):
    if pre.tabId == post.tabId:
        return True
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
