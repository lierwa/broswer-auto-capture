"""Borrow the original owner window through the compatible account driver."""
import asyncio
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from patchright.async_api import async_playwright
from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.managed_window import ManagedWindow, _cdp_json
from browser_use_runner.access_cooldown import guard, remember
from browser_use_runner.task_access import borrow as borrow_admission, configured as admission_configured


def accepts(url, origins):
    parts = urlsplit(url)
    return f'{parts.scheme}://{parts.netloc}' in origins


async def navigate(page, url, **kwargs):
    # WHY：打开账号页、检查、存储准备共用站点冷却；保留原Playwright等待/Response语义。
    guard(url)
    response = await page.goto(url, **kwargs)
    if response is not None and not (isinstance(page, AccountPage) and page.response_admission):
        remember(url, response.status, response.headers)
    return response


@asynccontextmanager
async def borrow_window(profile_path, owner_id, lease_id, kind):
    window = (AttachedWindow(profile_path, owner_id) if kind == 'daily'
              else ManagedWindow(profile_path, owner_id))
    lease = window._load(lease_id)
    if lease.status != 'handoff':
        raise ValueError('account_window_not_released')
    state = (await window.inspect(lease_id) if kind == 'daily' else window.inspect(lease_id))
    if not state['active']:
        raise ValueError('account_window_owner_unavailable')
    endpoint = (lease.cdpUrl if kind == 'daily' else
                _cdp_json(lease.cdpPort, '/json/version')['webSocketDebuggerUrl'])
    playwright = await async_playwright().start()
    session, admission, network_session = None, None, None
    try:
        # WHY：借用既有页面不应开启焦点仿真/改下载；兼容驱动保留原no_defaults语义。
        browser = await playwright.chromium.connect_over_cdp(endpoint, timeout=15000, no_defaults=True)
        owned = None
        for context in browser.contexts:
            for page in context.pages:
                candidate = await context.new_cdp_session(page)
                info = await candidate.send('Target.getTargetInfo')
                if info['targetInfo']['targetId'] == lease.targetId:
                    owned, session = page, candidate
                    break
                await candidate.detach()
            if owned:
                break
        if owned is None:
            raise ValueError('account_owned_page_unavailable')
        # WHY：handoff保留的SW不属于page Fetch；原浏览器级入口只用于已核验专属进程。
        if kind != 'daily' and admission_configured():
            network_session = await browser.new_browser_cdp_session()
        admission = await borrow_admission(network_session or session, observe_responses=network_session is not None)
        yield Borrowed(owned, session, response_admission=network_session is not None)
    finally:
        try:
            if admission is not None: await admission.close()
            if network_session is not None: await asyncio.wait_for(network_session.detach(), 5)
            if session is not None:
                await asyncio.wait_for(session.detach(), 5)
        finally:
            # WHY：Browser.close 会退出真实 Chrome；stop 只释放本次 Playwright driver/连接。
            await asyncio.wait_for(playwright.stop(), 5)


class AccountPage:
    """Preserve Playwright main-world evaluation while reusing its locator APIs."""
    def __init__(self, page, *, response_admission=False):
        self.native = page
        self.response_admission = response_admission

    def __getattr__(self, name):
        return getattr(self.native, name)

    async def evaluate(self, expression, arg=None):
        # WHY：账号Fetch/存储沿页面原CSP、全局对象及原生网络语义；不能悄悄切到隔离世界。
        return await self.native.evaluate(expression, arg, isolated_context=False)


class Borrowed:
    def __init__(self, page, cdp, *, response_admission=False):
        self.page, self.cdp = AccountPage(page, response_admission=response_admission), cdp
        self.response_admission = response_admission

    async def cookies(self, urls):
        if not urls:
            raise ValueError('account_cookie_scope_required')
        result = await asyncio.wait_for(self.cdp.send('Network.getCookies', {'urls': urls}), 15)
        return result.get('cookies', [])

    async def put_cookies(self, cookies):
        for cookie in cookies:
            supported = {key: value for key, value in cookie.items() if key in (
                'name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'sameSite',
                'expires', 'priority', 'sameParty', 'sourceScheme', 'sourcePort', 'partitionKey')}
            if supported.get('expires', -1) <= 0:
                supported.pop('expires', None)
            result = await asyncio.wait_for(self.cdp.send('Network.setCookie', supported), 15)
            if result.get('success') is False:
                raise ValueError('account_cookie_write_rejected')

    async def remove_cookie(self, cookie):
        key = {name: cookie[name] for name in ('name', 'domain', 'path')}
        if 'partitionKey' in cookie:
            key['partitionKey'] = cookie['partitionKey']
        await asyncio.wait_for(self.cdp.send('Network.deleteCookies', key), 15)


class CheckPage:
    """Only the borrowed owner page may navigate; source functions remain unchanged."""
    def __init__(self, borrowed, origins, observations):
        self.borrowed, self.origins, self.observations = borrowed, set(origins), observations

    @property
    def url(self):
        return self.borrowed.page.url

    async def goto(self, url, **kwargs):
        if not accepts(url, self.origins):
            raise ValueError('account_navigation_scope_denied')
        if self.observations.get('observe'):
            # WHY：来源的导航要求只记事实；用户正在输入的 owned 页面不可被检查导航。
            self.observations['navigationSuppressed'] = True
            return None
        try:
            response = await navigate(self.borrowed.page, url, timeout=15000, wait_until='domcontentloaded')
            if response and response.status >= 400:
                self.observations['errors'].append('http_error')
            if not accepts(self.url, self.origins):
                self.observations['redirectOutsideScope'] = True
            return response
        except Exception:
            self.observations['errors'].append('navigation_error')
            raise

    async def wait_for_timeout(self, timeout):
        await self.borrowed.page.wait_for_timeout(min(timeout, 250 if self.observations.get('observe') else 2500))

    async def wait_for_load_state(self, state='load', **kwargs):
        if self.observations.get('observe'):
            return None
        try:
            await self.borrowed.page.wait_for_load_state('domcontentloaded', timeout=15000)
        except Exception:
            self.observations['errors'].append('load_error')
            raise

    async def wait_for_url(self, url, **kwargs):
        await self.borrowed.page.wait_for_url(url, timeout=min(kwargs.get('timeout', 15000), 1000 if self.observations.get('observe') else 15000))

    def __getattr__(self, name):
        if name not in ('locator', 'get_by_text', 'get_by_role', 'query_selector_all', 'frame_locator', 'frames'):
            raise ValueError('account_read_only_page_required')
        native = getattr(self.borrowed.page, name)
        if not self.observations.get('observe'):
            return native
        if name == 'frames':
            return [ReadFrame(frame) for frame in native]
        if name == 'query_selector_all':
            async def read_elements(*args, **kwargs):
                return [ReadLocator(element) for element in await native(*args, **kwargs)]
            return read_elements
        return lambda *args, **kwargs: ReadLocator(native(*args, **kwargs))


class ReadLocator:
    """Public Playwright locator reads only; no click/fill/focus in login observation."""
    def __init__(self, locator):
        self.locator = locator

    @property
    def first(self):
        return ReadLocator(self.locator.first)

    def __getattr__(self, name):
        if name in ('locator', 'get_by_text', 'get_by_role', 'nth', 'frame_locator'):
            return lambda *args, **kwargs: ReadLocator(getattr(self.locator, name)(*args, **kwargs))
        if name == 'wait_for':
            return lambda **kwargs: self.locator.wait_for(**{**kwargs, 'timeout': min(kwargs.get('timeout', 1000), 1000)})
        if name not in ('count', 'is_visible', 'text_content', 'inner_text', 'get_attribute'):
            raise ValueError('account_observe_mutation_denied')
        return getattr(self.locator, name)


class ReadFrame:
    def __init__(self, frame):
        self.frame = frame

    @property
    def url(self):
        return self.frame.url

    def __getattr__(self, name):
        if name not in ('locator', 'get_by_text', 'get_by_role'):
            raise ValueError('account_observe_frame_mutation_denied')
        return lambda *args, **kwargs: ReadLocator(getattr(self.frame, name)(*args, **kwargs))
