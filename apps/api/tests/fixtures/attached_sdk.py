"""Existing SDK connection fixture shared by the focused ownership tests."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
from browser_use import Browser, BrowserProfile
from browser_use.browser.session_manager import SessionManager
from cdp_use import CDPClient
from websockets.protocol import State


class SDKFixture:
    def __init__(self):
        self.endpoint = 'ws://127.0.0.1:12345/devtools/browser/controlled'
        self.browser = Browser(browser_profile=BrowserProfile(cdp_url=self.endpoint,
            is_local=False, keep_alive=True, no_viewport=True, enable_default_extensions=False))
        self.browser._aboutblank_watchdog = SimpleNamespace(_stopping=False)
        self.targets = {'personal': {'targetId': 'personal', 'type': 'page', 'url': 'about:blank'}}
        self.created, self.activated, self.connects, self.stops, self.attach_count = [], [], 0, 0, 0
        self.fail_activate = False
        self.fail_close, self.cancel_create, self.early_attach_rejected = False, False, False
        self.client = CDPClient(self.endpoint)
        self.client.ws = SimpleNamespace(state=State.OPEN)
        self.client.send = SimpleNamespace(Browser=SimpleNamespace(getVersion=AsyncMock(return_value={'product': 'Chrome/Extension-Bridge'})),
            Target=SimpleNamespace(createTarget=self.create,
            closeTarget=self.close_target, getTargets=self.get_targets, setAutoAttach=AsyncMock(),
            attachToTarget=self.attach, activateTarget=self.activate), Runtime=SimpleNamespace(runIfWaitingForDebugger=AsyncMock()),
            Network=SimpleNamespace(enable=AsyncMock()))
        self.response_callback = None
        self.client.register = SimpleNamespace(Target=SimpleNamespace(attachedToTarget=lambda _f: None,
            detachedFromTarget=lambda _f: None), Page=SimpleNamespace(javascriptDialogOpening=lambda _f: None),
            Network=SimpleNamespace(responseReceived=self.register_response))
        object.__setattr__(self.browser, 'start', self.start)
        object.__setattr__(self.browser, 'stop', self.stop)

    def register_response(self, callback):
        self.response_callback = callback

    def event(self, target_id, session_id):
        return {'sessionId': session_id, 'targetInfo': self.targets[target_id], 'waitingForDebugger': False}

    async def create(self, params=None, **_kwargs):
        target_id = f'task-{len(self.created) + 1}'
        self.created.append(target_id)
        self.targets[target_id] = {'targetId': target_id, 'type': 'page', 'url': 'about:blank'}
        if self.cancel_create:
            raise asyncio.CancelledError()
        if self.connects > 1 or len(self.created) > 1:
            manager = self.browser.session_manager
            await manager._handle_target_attached(self.event(target_id, f'early-{target_id}'))
            self.early_attach_rejected = manager.get_target(target_id) is None
            await manager._handle_target_attached(self.event('personal', 'private-session'))
        return {'targetId': target_id}

    async def get_targets(self, *args, **kwargs):
        return {'targetInfos': list(self.targets.values())}

    async def activate(self, params):
        target_id = params['targetId']
        if target_id == 'personal' or target_id not in self.created:
            raise AssertionError('activation_outside_task_ownership')
        if self.fail_activate:
            raise RuntimeError('controlled_activation_failure')
        self.activated.append(target_id)

    async def attach(self, params):
        self.attach_count += 1
        session_id = f'session-{self.attach_count}'
        await self.browser.session_manager._handle_target_attached(self.event(params['targetId'], session_id))
        return {'sessionId': session_id}

    async def close_target(self, params=None, **kwargs):
        if self.fail_close:
            raise RuntimeError('controlled_close_failure')
        target_id = (params or kwargs)['targetId']
        self.targets.pop(target_id, None)
        manager = self.browser.session_manager
        for session in list(manager.get_all_sessions_for_target(target_id)):
            await manager._handle_target_detached({'targetId': target_id, 'sessionId': session.session_id})
        return {'success': True}

    async def start(self):
        if self.browser._cdp_client_root is not None:
            return
        self.connects += 1
        self.browser._cdp_client_root = self.client
        self.browser.session_manager = SessionManager(self.browser)
        self.browser.session_manager._enable_page_monitoring = AsyncMock()
        await self.browser.session_manager.start_monitoring()

    async def monitor(self, manager):
        for info in (await self.client.send.Target.getTargets())['targetInfos']:
            await self.attach({'targetId': info['targetId'], 'flatten': True})

    async def stop(self):
        self.stops += 1
        self.client.ws.state = State.CLOSED
        self.browser._cdp_client_root = None
        self.browser.session_manager = None
        await self.browser.event_bus.stop(clear=True, timeout=0)
