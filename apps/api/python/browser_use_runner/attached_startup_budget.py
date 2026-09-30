"""Bounded native-confirmation budget around one pinned SDK startup, never a retry loop."""
import inspect
from importlib.metadata import version

from browser_use.browser import session as session_module
from browser_use.browser.events import BrowserStartEvent
from cdp_use import client as client_module
from cdp_use import CDPClient


class _ModuleView:
    def __init__(self, original, **overrides):
        self.original, self.overrides = original, overrides

    def __getattr__(self, name):
        return self.overrides[name] if name in self.overrides else getattr(self.original, name)


class AttachedStartupBudget:
    _active = None

    def __init__(self, browser, endpoint):
        self.browser, self.endpoint, self.active = browser, endpoint, False
        self.event_bus = browser.event_bus
        self.connect_code = session_module.BrowserSession.connect.__code__
        self.asyncio_original, self.websockets_original = None, None
        self.asyncio_view, self.websockets_view = None, None
        self.dispatch_original, self.dispatch_wrapper = None, None
        self.dispatch_had_instance_value = False

    def _verify(self):
        handler = inspect.unwrap(session_module.BrowserSession.on_BrowserStartEvent)
        if (version('browser-use') != '0.13.8' or version('cdp-use') != '1.4.5'
                or not isinstance(self.browser, session_module.BrowserSession)
                or getattr(self.browser.connect, '__func__', None) is not session_module.BrowserSession.connect
                or self.browser.cdp_url != self.endpoint or self.browser._cdp_client_root is not None
                or self.browser.event_bus is not self.event_bus
                or 15.0 not in handler.__code__.co_consts or 'wait_for' not in handler.__code__.co_names
                or 'open_timeout' in CDPClient.start.__code__.co_consts
                or not {'websockets', 'connect'}.issubset(CDPClient.start.__code__.co_names)):
            raise ValueError('hybrid_attached_window_startup_budget_sdk_mismatch')

    def _wait_for(self, fut, timeout):
        future = fut
        frame = getattr(future, 'cr_frame', None)
        matches = (self.active and timeout == 15.0 and getattr(future, 'cr_code', None) is self.connect_code
                   and frame is not None and frame.f_locals.get('self') is self.browser
                   and frame.f_locals.get('cdp_url') == self.endpoint)
        # WHY：SDK 的 connect 15s 小于原生人工确认时间；只改这一 Browser 的这一 connect await。
        return self.asyncio_original.wait_for(future, timeout=65.0 if matches else timeout)

    def _connect(self, endpoint, *args, **kwargs):
        frame = inspect.currentframe()
        caller = frame.f_back if frame is not None else None
        parent = caller.f_back if caller is not None else None
        try:
            matches = (self.active and endpoint == self.endpoint and caller is not None
                       and caller.f_code is CDPClient.start.__code__
                       and caller.f_locals.get('self') is self.browser._cdp_client_root
                       and parent is not None and parent.f_code is self.connect_code
                       and parent.f_locals.get('self') is self.browser
                       and parent.f_locals.get('cdp_url') == self.endpoint)
        finally:
            del frame, caller, parent
        if matches:
            # WHY：仍由原 cdp-use/websockets 开唯一连接；不同 client/endpoint 不获得此预算。
            kwargs = {**kwargs, 'open_timeout': 60.0}
        return self.websockets_original.connect(endpoint, *args, **kwargs)

    def __enter__(self):
        if AttachedStartupBudget._active is not None:
            raise ValueError('hybrid_attached_window_startup_budget_busy')
        self._verify()
        self.asyncio_original, self.websockets_original = session_module.asyncio, client_module.websockets
        self.dispatch_original = self.event_bus.dispatch
        self.dispatch_had_instance_value = 'dispatch' in self.event_bus.__dict__

        def dispatch(event):
            if self.active and isinstance(event, BrowserStartEvent):
                # Public per-event timeout, scoped to this Browser's event bus rather than process ENV.
                event.event_timeout = 70.0
            return self.dispatch_original(event)

        self.dispatch_wrapper = dispatch
        self.asyncio_view = _ModuleView(self.asyncio_original, wait_for=self._wait_for)
        self.websockets_view = _ModuleView(self.websockets_original, connect=self._connect)
        self.active, AttachedStartupBudget._active = True, self
        try:
            session_module.asyncio, client_module.websockets = self.asyncio_view, self.websockets_view
            object.__setattr__(self.event_bus, 'dispatch', self.dispatch_wrapper)
        except BaseException:
            self._restore()
            raise
        return self

    def _restore(self):
        self.active = False
        if session_module.asyncio is self.asyncio_view:
            session_module.asyncio = self.asyncio_original
        if client_module.websockets is self.websockets_view:
            client_module.websockets = self.websockets_original
        if self.event_bus.dispatch is self.dispatch_wrapper:
            if self.dispatch_had_instance_value:
                object.__setattr__(self.event_bus, 'dispatch', self.dispatch_original)
            else:
                object.__delattr__(self.event_bus, 'dispatch')
        if AttachedStartupBudget._active is self:
            AttachedStartupBudget._active = None

    def __exit__(self, _kind, _error, _traceback):
        self._restore()
        return False
