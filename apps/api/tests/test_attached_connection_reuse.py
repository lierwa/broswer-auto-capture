"""Task-scoped borrowing preserves one SDK connection, not another browser controller."""
import asyncio
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from browser_use import Browser, BrowserProfile
from browser_use.browser.session_manager import SessionManager
from cdp_use import CDPClient
from websockets.protocol import State

from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.author_request_loop import AuthorRequestLoop
from browser_use_runner.target_scope import TargetScope


class SDKFixture:
    def __init__(self):
        self.endpoint = 'ws://127.0.0.1:12345/devtools/browser/controlled'
        self.browser = Browser(browser_profile=BrowserProfile(cdp_url=self.endpoint,
            is_local=False, keep_alive=True, no_viewport=True, enable_default_extensions=False))
        self.browser._aboutblank_watchdog = SimpleNamespace(_stopping=False)
        self.targets = {'personal': {'targetId': 'personal', 'type': 'page', 'url': 'about:blank'}}
        self.created, self.connects, self.stops, self.attach_count = [], 0, 0, 0
        self.fail_close, self.cancel_create, self.early_attach_rejected = False, False, False
        self.client = CDPClient(self.endpoint)
        self.client.ws = SimpleNamespace(state=State.OPEN)
        self.client.send = SimpleNamespace(Target=SimpleNamespace(createTarget=self.create,
            closeTarget=self.close_target, getTargets=self.get_targets, setAutoAttach=AsyncMock(),
            attachToTarget=self.attach), Runtime=SimpleNamespace(runIfWaitingForDebugger=AsyncMock()),
            Network=SimpleNamespace(enable=AsyncMock()))
        self.response_callback = None
        self.client.register = SimpleNamespace(Page=SimpleNamespace(javascriptDialogOpening=lambda _f: None),
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


class AttachedConnectionReuseTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='bat-connection-reuse-')
        self.addCleanup(directory.cleanup)
        self.profile = Path(directory.name) / 'profile'
        self.parent, self.owner_a, self.owner_b = uuid4(), uuid4(), uuid4()
        self.sdk = SDKFixture()
        self.runner = Runner()
        self.capabilities = []

        def capability(_browser):
            result = SimpleNamespace(close=AsyncMock())
            self.capabilities.append(result)
            return result

        async def monitor(manager):
            await self.sdk.monitor(manager)

        for replacement in (patch('browser_use_runner.hybrid_main.assert_runtime'),
                patch('browser_use_runner.hybrid_main.OrdinaryCapability', side_effect=capability),
                patch.object(AttachedWindow, '_browser', return_value=self.sdk.browser),
                patch.object(SessionManager, 'start_monitoring', monitor)):
            replacement.start()
            self.addCleanup(replacement.stop)

    async def asyncTearDown(self):
        await self.runner.ensure_closed()
        await self.sdk.browser.event_bus.stop(clear=True, timeout=0)

    def config(self, owner, **changes):
        return {'headless': False, 'profilePath': str(self.profile),
            'allowedOrigins': ['https://example.invalid'],
            'allowedSites': [{'scheme': 'https', 'domain': 'example.invalid', 'port': None,
                              'includeSubdomains': False}],
            'existingBrowser': {'ownerId': owner, 'resume': False, 'cdpUrl': self.sdk.endpoint},
            'connectionOwnerId': self.parent, **changes}

    async def release(self, owner=None):
        return await self.runner.handle({'id': str(uuid4()), 'type': 'hybrid_release',
                                         'connectionOwnerId': str(owner or self.parent)})

    async def test_two_operation_owners_release_pages_but_connect_once_and_stop_only_finally(self):
        await self.runner.start(self.config(self.owner_a))
        window_a, scope = self.runner.managed_window, self.runner.managed_window.scope
        target_a = window_a._load(self.owner_a).targetId
        self.sdk.browser._downloaded_files.append('/controlled/previous-download')
        self.sdk.browser._cached_browser_state_summary = object()
        self.runner.commands, self.runner.document_status = 5, {'https://example.invalid': 403}
        report = await self.release()
        self.assertTrue(report['closed'])
        self.assertEqual(report['retainedConnectionOwnerId'], str(self.parent))
        self.assertEqual(window_a._load(self.owner_a).status, 'ended')
        self.assertNotIn(target_a, self.sdk.targets)
        self.assertEqual(self.sdk.stops, 0)
        await self.runner.start(self.config(self.owner_b))
        self.assertIs(self.runner.managed_window.scope, scope)
        self.assertEqual(self.sdk.connects, 1)
        self.assertEqual(self.runner.commands, 0)
        self.assertEqual(self.runner.document_status, {})
        self.assertEqual(self.sdk.browser._downloaded_files, [])
        self.assertIsNone(self.sdk.browser._cached_browser_state_summary)
        self.assertTrue(self.sdk.early_attach_rejected)
        self.assertEqual(set(self.sdk.browser.session_manager.get_all_target_ids()), {'task-2'})
        self.assertEqual(scope.require_focus(), 'task-2')
        self.assertTrue((await self.release())['closed'])
        self.assertEqual(self.sdk.stops, 0)
        final = await self.runner.close()
        self.assertTrue(final['closed'])
        self.assertEqual(final['stages'][1]['status'], 'confirmed')
        self.assertEqual(self.sdk.stops, 1)
        self.assertIn('personal', self.sdk.targets)

    async def test_idle_owner_endpoint_profile_and_site_drift_reject_before_new_page(self):
        await self.runner.start(self.config(self.owner_a))
        await self.release()
        changes = [({'connectionOwnerId': uuid4()}, 'connection_owner_mismatch'),
            ({'existingBrowser': {'ownerId': self.owner_b, 'resume': False,
             'cdpUrl': 'ws://127.0.0.1:54321/devtools/browser/other'}}, 'connection_endpoint_changed'),
            ({'profilePath': str(self.profile.parent / 'other')}, 'connection_profile_changed'),
            ({'allowedOrigins': ['https://other.invalid']}, 'connection_settings_changed')]
        for change, code in changes:
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, code):
                await self.runner.start(self.config(self.owner_b, **change))
        self.assertEqual(self.sdk.created, ['task-1'])
        self.assertEqual(self.sdk.connects, 1)

    async def test_wrong_release_parent_preserves_active_owner(self):
        await self.runner.start(self.config(self.owner_a))
        with self.assertRaisesRegex(ValueError, 'connection_owner_mismatch'):
            await self.release(uuid4())
        self.assertIn('task-1', self.sdk.targets)
        self.assertEqual(self.sdk.stops, 0)

    async def test_page_close_failure_does_not_retain_or_permit_next_owner(self):
        await self.runner.start(self.config(self.owner_a))
        self.sdk.fail_close = True
        report = await self.release()
        self.assertFalse(report['closed'])
        self.assertIsNone(report['retainedConnectionOwnerId'])
        self.assertIn('task-1', self.sdk.targets)
        with self.assertRaisesRegex(ValueError, 'session_already_started|connection_cleanup_required'):
            await self.runner.start(self.config(self.owner_b))
        self.sdk.fail_close = False
        self.assertTrue((await self.runner.close())['closed'])
        self.assertEqual(self.sdk.stops, 1)

    async def test_cancelled_create_without_owner_receipt_cannot_claim_cleanup(self):
        await self.runner.start(self.config(self.owner_a))
        await self.release()
        self.sdk.cancel_create = True
        with self.assertRaises(asyncio.CancelledError):
            await self.runner.start(self.config(self.owner_b))
        report = await self.release()
        self.assertFalse(report['closed'])
        self.assertIsNone(report['retainedConnectionOwnerId'])
        self.assertEqual(self.sdk.stops, 0)

    async def test_capability_close_failure_blocks_connection_reuse_even_if_page_closed(self):
        await self.runner.start(self.config(self.owner_a))
        self.capabilities[-1].close.side_effect = RuntimeError('controlled_capability_close_failure')
        report = await self.release()
        self.assertFalse(report['closed'])
        self.assertIsNone(report['retainedConnectionOwnerId'])
        with self.assertRaisesRegex(ValueError, 'session_already_started|connection_cleanup_required'):
            await self.runner.start(self.config(self.owner_b))
        self.capabilities[-1].close.side_effect = None

    async def test_connection_drop_does_not_invoke_sdk_reconnect_or_create_next_page(self):
        await self.runner.start(self.config(self.owner_a))
        await self.release()
        self.sdk.client.ws.state = State.CLOSED
        with patch.object(Browser, 'reconnect', AsyncMock()) as reconnect:
            await self.sdk.browser._auto_reconnect()
            reconnect.assert_not_awaited()
        with self.assertRaisesRegex(ValueError, 'connection_lost'):
            await self.runner.start(self.config(self.owner_b))
        self.assertEqual(self.sdk.created, ['task-1'])

    async def test_exclusive_close_without_connection_owner_still_stops_its_browser(self):
        config = self.config(self.owner_a)
        config.pop('connectionOwnerId')
        await self.runner.start(config)
        report = await self.runner.close()
        self.assertTrue(report['closed'])
        self.assertEqual(self.sdk.connects, 1)
        self.assertEqual(self.sdk.stops, 1)
        self.assertNotIn('retainedConnectionOwnerId', report)
        self.assertIn('personal', self.sdk.targets)

    async def test_handoff_detaches_group_without_closing_or_reborrowing_delivered_target(self):
        await self.runner.start(self.config(self.owner_a))
        window = self.runner.managed_window
        delivered = await self.runner.handoff()
        self.assertTrue(delivered['active'])
        self.assertEqual(window._load(self.owner_a).status, 'handoff')
        self.assertIn('task-1', self.sdk.targets)
        self.assertEqual(self.sdk.stops, 1)
        released = await self.release()
        self.assertTrue(released['closed'])
        self.assertIsNone(released['retainedConnectionOwnerId'])
        with self.assertRaisesRegex(ValueError, 'connection_lost'):
            await self.runner.start(self.config(self.owner_b))
        self.assertTrue((await self.runner.close())['closed'])
        self.assertEqual(self.sdk.stops, 1)
        self.assertIn('task-1', self.sdk.targets)
        self.assertIn('personal', self.sdk.targets)

    async def test_cancelled_release_caller_does_not_cancel_cleanup_or_disconnect(self):
        await self.runner.start(self.config(self.owner_a))
        entered, finish = asyncio.Event(), asyncio.Event()

        async def close_capability():
            entered.set()
            await finish.wait()

        self.capabilities[-1].close.side_effect = close_capability
        task = asyncio.create_task(self.release())
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        finish.set()
        report = await self.release()
        self.assertTrue(report['closed'])
        self.assertEqual(report['retainedConnectionOwnerId'], str(self.parent))
        self.assertEqual(self.capabilities[-1].close.await_count, 1)
        self.assertEqual(self.sdk.stops, 0)

    async def test_old_response_callback_cannot_pollute_next_operation(self):
        await self.runner.start(self.config(self.owner_a))
        old_session = self.sdk.browser.session_manager.get_all_sessions_for_target('task-1')[0].session_id
        callback = self.sdk.response_callback
        await self.release()
        await self.runner.start(self.config(self.owner_b))
        callback({'type': 'Document', 'response': {'url': 'https://example.invalid', 'status': 403}}, old_session)
        self.assertEqual(self.runner.document_status, {})

    async def test_final_stop_without_detach_is_unconfirmed_and_keeps_target_guard(self):
        await self.runner.start(self.config(self.owner_a))
        await self.release()
        scope = self.runner.connection.scope
        stop = self.sdk.stop
        object.__setattr__(self.sdk.browser, 'stop', AsyncMock())
        report = await self.runner.close()
        self.assertFalse(report['closed'])
        self.assertEqual(report['stages'][1]['status'], 'unconfirmed')
        self.assertIs(TargetScope._active, scope)
        object.__setattr__(self.sdk.browser, 'stop', stop)
        await self.runner.connection.last_window._stop(self.sdk.browser)

    async def test_author_release_validates_parent_before_cancel_and_keeps_transport_running(self):
        transport_runner, cancelled, starts = Runner(), [], []

        def require_owner(owner):
            if owner != self.parent:
                raise ValueError('hybrid_attached_window_connection_owner_mismatch')

        transport_runner.connection = SimpleNamespace(require_owner=require_owner)

        async def handle(request):
            if request['type'] == 'hybrid_author':
                try:
                    await asyncio.Future()
                finally:
                    cancelled.append(True)
            if request['type'] == 'hybrid_release':
                transport_runner.validate_release(request)
                return {'closed': True, 'stages': [], 'retainedConnectionOwnerId': str(self.parent)}
            starts.append(request['type'])
            return {'closed': True}

        transport_runner.handle = handle
        requests = [{'id': str(uuid4()), 'type': 'hybrid_author'},
            {'id': str(uuid4()), 'type': 'hybrid_release', 'connectionOwnerId': str(uuid4())},
            {'id': str(uuid4()), 'type': 'hybrid_release', 'connectionOwnerId': str(self.parent)},
            {'id': str(uuid4()), 'type': 'hybrid_start'}, {'id': str(uuid4()), 'type': 'close'}]
        channel = io.StringIO()
        loop = AuthorRequestLoop(transport_runner, channel, SimpleNamespace(emit=lambda _event: None), str)
        with patch('browser_use_runner.author_request_loop.sys.stdin', io.StringIO(
                '\n'.join(map(json.dumps, requests)) + '\n')):
            await loop.run()
        responses = list(map(json.loads, channel.getvalue().splitlines()))
        self.assertEqual(len(cancelled), 1)
        self.assertEqual(starts, ['hybrid_start', 'close'])
        self.assertFalse(responses[0]['ok'])
        self.assertTrue(responses[1]['ok'])


if __name__ == '__main__':
    unittest.main()
