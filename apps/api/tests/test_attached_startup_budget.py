"""One SDK handshake can await native confirmation without widening other connections."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from browser_use import Browser, BrowserProfile
from browser_use.browser import session as session_module
from browser_use.browser.events import BrowserStartEvent
from browser_use.browser.session_manager import SessionManager
from cdp_use import CDPClient
from cdp_use import client as client_module
from websockets.protocol import State

from browser_use_runner.attached_window import AttachedWindow


class DelegatingModule:
    def __init__(self, original, **overrides):
        self.original, self.overrides = original, overrides

    def __getattr__(self, name):
        return self.overrides[name] if name in self.overrides else getattr(self.original, name)


class StartupFixture:
    def __init__(self):
        self.endpoint = 'ws://127.0.0.1:12345/devtools/browser/controlled'
        # Prime generated SDK types outside the deliberately scaled startup timer; no connection.
        self.bootstrap_client = CDPClient(self.endpoint)
        self.browser = Browser(browser_profile=BrowserProfile(cdp_url=self.endpoint, is_local=False,
            keep_alive=True, no_viewport=True, enable_default_extensions=False), is_local=False)
        object.__setattr__(self.browser, 'attach_all_watchdogs', AsyncMock())
        self.handshakes, self.waits, self.events, self.clients = [], [], [], []
        self.entered, self.allow = asyncio.Event(), None
        self.targets = {'personal': {'targetId': 'personal', 'type': 'page', 'url': 'about:blank'}}
        self.original_dispatch = self.browser.event_bus.dispatch

        def dispatch(event):
            if isinstance(event, BrowserStartEvent):
                self.events.append(event.event_timeout)
            return self.original_dispatch(event)

        object.__setattr__(self.browser.event_bus, 'dispatch', dispatch)

    async def handshake(self, endpoint, *, open_timeout=10, **kwargs):
        self.handshakes.append((endpoint, open_timeout))
        self.entered.set()
        # Scaling retains the real 10/15/60/65 budget relationships without a minute-long test.
        await asyncio.wait_for(self.allow.wait() if self.allow is not None else asyncio.sleep(0.025),
                               timeout=open_timeout / 1000)
        socket = SimpleNamespace(state=State.OPEN)

        async def receive():
            await asyncio.Future()

        async def close():
            socket.state = State.CLOSED

        socket.recv, socket.close = receive, close
        return socket

    async def wait_for(self, future, timeout):
        self.waits.append(timeout)
        connect = getattr(future, 'cr_code', None) is Browser.connect.__code__
        return await asyncio.wait_for(future, timeout / 1000 if connect else timeout)

    def client(self, endpoint, **kwargs):
        fixture = self

        class SDKClient(CDPClient):
            def __init__(self):
                super().__init__(endpoint, **kwargs)
                self.send = SimpleNamespace(Target=SimpleNamespace(createTarget=self.create,
                    getTargets=self.targets, attachToTarget=self.attach, closeTarget=self.close_target,
                    setAutoAttach=AsyncMock()), Runtime=SimpleNamespace(runIfWaitingForDebugger=AsyncMock()))
                self.register = SimpleNamespace(Page=SimpleNamespace(javascriptDialogOpening=lambda _f: None))

            async def create(self, params):
                fixture.targets['owned'] = {'targetId': 'owned', 'type': 'page', 'url': 'about:blank'}
                return {'targetId': 'owned'}

            async def targets(self, *args, **kwargs):
                return {'targetInfos': list(fixture.targets.values())}

            async def attach(self, params):
                await fixture.browser.session_manager._handle_target_attached({'sessionId': 'owned-session',
                    'targetInfo': fixture.targets[params['targetId']], 'waitingForDebugger': False})
                return {'sessionId': 'owned-session'}

            async def close_target(self, params):
                fixture.targets.pop(params['targetId'], None)
                await fixture.browser.session_manager._handle_target_detached(
                    {'targetId': params['targetId'], 'sessionId': 'owned-session'})
                return {'success': True}

        result = SDKClient()
        self.clients.append(result)
        return result

    async def monitor(self, manager):
        manager._enable_page_monitoring = AsyncMock()
        for info in (await manager.browser_session.cdp_client.send.Target.getTargets())['targetInfos']:
            await manager.browser_session.cdp_client.send.Target.attachToTarget(
                params={'targetId': info['targetId'], 'flatten': True})


class AttachedStartupBudgetTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='bat-startup-budget-')
        self.addCleanup(directory.cleanup)
        self.fixture = StartupFixture()
        self.window = AttachedWindow(Path(directory.name) / 'profile', uuid4(), self.fixture.endpoint)
        self.asyncio_proxy = DelegatingModule(asyncio, wait_for=self.fixture.wait_for)
        self.websockets_proxy = DelegatingModule(client_module.websockets, connect=self.fixture.handshake)

        async def monitor(manager):
            await self.fixture.monitor(manager)

        for replacement in (patch.object(self.window, '_browser', return_value=self.fixture.browser),
                patch.object(session_module, 'TimeoutWrappedCDPClient', side_effect=self.fixture.client),
                patch.object(session_module, 'asyncio', self.asyncio_proxy),
                patch.object(client_module, 'websockets', self.websockets_proxy),
                patch.object(SessionManager, 'start_monitoring', monitor)):
            replacement.start()
            self.addCleanup(replacement.stop)

    async def asyncTearDown(self):
        await self.window.close(self.fixture.browser)
        await self.fixture.browser.event_bus.stop(clear=True, timeout=0)

    async def test_first_sdk_start_waits_one_handshake_past_legacy_budget_and_restores(self):
        result = await self.window.start(resume=False, allowed_domains=None, retain_connection=True)
        self.assertIs(result, self.fixture.browser)
        self.assertEqual(self.fixture.handshakes, [(self.fixture.endpoint, 60)])
        self.assertIn(65, self.fixture.waits)
        self.assertEqual(self.fixture.events, [70])
        self.assertIs(session_module.asyncio, self.asyncio_proxy)
        self.assertIs(client_module.websockets, self.websockets_proxy)

    async def test_unrelated_wait_endpoint_client_and_event_keep_original_budgets(self):
        from browser_use_runner.attached_startup_budget import AttachedStartupBudget
        budget = AttachedStartupBudget(self.fixture.browser, self.fixture.endpoint)
        with budget:
            self.assertTrue(await session_module.asyncio.wait_for(asyncio.sleep(0, result=True), 15))
            self.assertEqual(self.fixture.waits[-1], 15)
            other_endpoint = 'ws://127.0.0.1:12345/devtools/browser/other'
            other = CDPClient(other_endpoint)
            with self.assertRaises(TimeoutError):
                await other.start()
            self.assertEqual(self.fixture.handshakes[-1], (other_endpoint, 10))
            same_endpoint_foreign_client = CDPClient(self.fixture.endpoint)
            with self.assertRaises(TimeoutError):
                await same_endpoint_foreign_client.start()
            self.assertEqual(self.fixture.handshakes[-1], (self.fixture.endpoint, 10))
            unrelated = Browser(browser_profile=BrowserProfile(cdp_url=other_endpoint, is_local=False))
            self.assertEqual(BrowserStartEvent().event_timeout, 30)
            await unrelated.event_bus.stop(clear=True, timeout=0)
        self.assertIs(session_module.asyncio, self.asyncio_proxy)
        self.assertIs(client_module.websockets, self.websockets_proxy)

    async def test_other_browser_connect_coroutine_and_replaced_event_bus_are_not_widened(self):
        from browser_use_runner.attached_startup_budget import AttachedStartupBudget
        other = Browser(browser_profile=BrowserProfile(cdp_url=self.fixture.endpoint, is_local=False))
        captured, original_bus = [], self.fixture.browser.event_bus
        dispatch_before = original_bus.dispatch

        async def record_only(future, timeout):
            captured.append(timeout)
            future.close()

        with patch.object(self.asyncio_proxy, 'overrides', {'wait_for': record_only}):
            with AttachedStartupBudget(self.fixture.browser, self.fixture.endpoint):
                await session_module.asyncio.wait_for(fut=other.connect(cdp_url=self.fixture.endpoint), timeout=15)
                self.assertEqual(captured, [15])
                replacement = type(original_bus)()
                self.fixture.browser.event_bus = replacement
                self.assertEqual(BrowserStartEvent().event_timeout, 30)
            self.assertIs(original_bus.dispatch, dispatch_before)
        self.fixture.browser.event_bus = original_bus
        await replacement.stop(clear=True, timeout=0)
        await other.event_bus.stop(clear=True, timeout=0)

    async def test_cancellation_cleans_partial_client_and_restores_all_adapters(self):
        self.fixture.allow = asyncio.Event()
        task = asyncio.create_task(self.window.start(resume=False, allowed_domains=None, retain_connection=True))
        await self.fixture.entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(self.fixture.handshakes, [(self.fixture.endpoint, 60)])
        self.assertIs(session_module.asyncio, self.asyncio_proxy)
        self.assertIs(client_module.websockets, self.websockets_proxy)
        self.assertIsNone(self.fixture.browser._cdp_client_root)

    def test_version_drift_refuses_before_any_override(self):
        from browser_use_runner.attached_startup_budget import AttachedStartupBudget
        with patch('browser_use_runner.attached_startup_budget.version', return_value='0.0.0'):
            with self.assertRaisesRegex(ValueError, 'startup_budget_sdk_mismatch'):
                with AttachedStartupBudget(self.fixture.browser, self.fixture.endpoint):
                    self.fail('version drift must not install')
        self.assertIs(session_module.asyncio, self.asyncio_proxy)
        self.assertIs(client_module.websockets, self.websockets_proxy)


if __name__ == '__main__':
    unittest.main()
