"""Borrow the original owner window; Playwright owns only its connection."""
import asyncio
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from playwright.async_api import async_playwright
from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.managed_window import ManagedWindow, _cdp_json


def accepts(url, origins):
    parts = urlsplit(url)
    return f'{parts.scheme}://{parts.netloc}' in origins


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
    session = None
    try:
        browser = await playwright.chromium.connect_over_cdp(endpoint, timeout=15000)
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
        yield Borrowed(owned, session)
    finally:
        try:
            if session is not None:
                await asyncio.wait_for(session.detach(), 5)
        finally:
            # WHY：Browser.close 会退出真实 Chrome；stop 只释放本次 Playwright driver/连接。
            await asyncio.wait_for(playwright.stop(), 5)


class Borrowed:
    def __init__(self, page, cdp):
        self.page, self.cdp = page, cdp

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
            response = await self.borrowed.page.goto(url, timeout=15000, wait_until='domcontentloaded')
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
