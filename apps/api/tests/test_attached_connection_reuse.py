"""Task-scoped borrowing preserves one SDK connection, not another browser controller."""
import asyncio
import io
import json
import tempfile
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from browser_use.browser.session_manager import SessionManager

from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.author_request_loop import AuthorRequestLoop
from browser_use_runner.target_scope import TargetScope


from fixtures.attached_sdk import SDKFixture


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

    async def test_explicit_new_page_owns_only_its_creation_receipt_with_early_attach(self):
        await self.runner.start(self.config(self.owner_a))
        browser = self.sdk.browser
        target = await browser._cdp_create_new_page()
        scope = self.runner.managed_window.scope
        self.assertEqual(target, 'task-2')
        self.assertIn(target, scope.owned)
        self.assertIn(target, self.runner.managed_window._load(self.owner_a).ownedTargets)
        self.assertIsNotNone(browser.session_manager.get_target(target))
        self.assertIsNone(browser.session_manager.get_target('personal'))
        self.assertEqual(scope.pending_page_attaches, [])
        await self.release()
        self.assertEqual(set(self.sdk.targets), {'personal'})

    async def test_explicit_new_page_lost_creation_receipt_keeps_cleanup_unconfirmed(self):
        await self.runner.start(self.config(self.owner_a))
        self.sdk.cancel_create = True
        with self.assertRaises(asyncio.CancelledError):
            await self.sdk.browser._cdp_create_new_page()
        self.assertTrue(self.runner.managed_window._load(self.owner_a).targetCreationPending)
        result = await self.release()
        self.assertFalse(result['closed'])
        self.assertIn('personal', self.sdk.targets)

    async def test_native_focus_recovery_uses_owned_list_page_without_creating_fallback(self):
        await self.runner.start(self.config(self.owner_a))
        browser, manager = self.sdk.browser, self.sdk.browser.session_manager
        # 模拟原生已清session但尚留target：最后插入的失效详情不能遮住有效列表页。
        manager._targets['stale-detail'] = SimpleNamespace(target_id='stale-detail', target_type='page')
        self.runner.managed_window.scope.owned.add('stale-detail')
        browser.agent_focus_target_id = None
        await manager._recover_agent_focus('closed-popup')
        self.assertEqual(browser.agent_focus_target_id, 'task-1')
        self.assertEqual(self.sdk.created, ['task-1'])
        self.assertEqual(self.sdk.activated, ['task-1', 'task-1'])
        self.assertNotIn('personal', [item.target_id for item in manager.get_all_page_targets()])
        manager._targets.pop('stale-detail')
        self.runner.managed_window.scope.owned.remove('stale-detail')

    async def test_offline_end_requires_host_exit_proof_and_only_closes_original_owner(self):
        from browser_use_runner.hybrid_commands import ManagedWindowRequest
        from browser_use_runner.window_control import control_window
        await self.runner.start(self.config(self.owner_a))
        request = ManagedWindowRequest(id=uuid4(), type='hybrid_managed_window', action='end',
            profilePath=str(self.profile), ownerId=self.owner_a, leaseId=self.owner_a,
            browserMode='daily', cdpUrl=self.sdk.endpoint)

        @asynccontextmanager
        async def connected(_endpoint):
            yield self.sdk.client

        with patch('browser_use_runner.attached_window._client', connected):
            with self.assertRaisesRegex(ValueError, 'hybrid_managed_window_controlled'):
                await control_window(request)
            with self.assertRaisesRegex(ValueError, 'hybrid_attached_window_owner_mismatch'):
                await control_window(request.model_copy(update={'leaseId': self.owner_b, 'controllerReleased': True}))
            self.assertIn('task-1', self.sdk.targets)
            result = await control_window(request.model_copy(update={'controllerReleased': True}))
        self.assertFalse(result['active'])
        self.assertEqual(set(self.sdk.targets), {'personal'})
        self.assertEqual(self.runner.managed_window._load(self.owner_a).status, 'ended')

    async def test_detached_target_is_closed_even_when_debugger_enumeration_is_empty(self):
        # 不变量：debugger目标消失不是物理页面已关闭，仍清理原租约目标且不触碰个人页。
        await self.runner.start(self.config(self.owner_a))
        window = self.runner.managed_window
        target = window._load(self.owner_a).targetId
        with patch.object(self.sdk.client.send.Target, 'getTargets', AsyncMock(return_value={'targetInfos': []})):
            result = await self.release()
        self.assertTrue(result['closed'])
        self.assertNotIn(target, self.sdk.targets)
        self.assertIn('personal', self.sdk.targets)
        self.assertEqual(window._load(self.owner_a).status, 'ended')

    async def test_empty_enumeration_and_unconfirmed_close_preserves_cleanup_required(self):
        await self.runner.start(self.config(self.owner_a))
        window = self.runner.managed_window
        target = window._load(self.owner_a).targetId
        close = AsyncMock(return_value={'success': False})
        with patch.object(self.sdk.client.send.Target, 'getTargets', AsyncMock(return_value={'targetInfos': []})), \
             patch.object(self.sdk.client.send.Target, 'closeTarget', close):
            result = await self.release()
        close.assert_awaited_once_with({'targetId': target})
        self.assertFalse(result['closed'])
        self.assertNotEqual(window._load(self.owner_a).status, 'ended')
        self.assertIn(target, self.sdk.targets)

    async def test_native_cdp_closed_target_keeps_native_enumeration_proof(self):
        # 不变量：原生CDP真实关闭不需要再次发送会报NoTarget的close；不能套用扩展的枚举缺口。
        await self.runner.start(self.config(self.owner_a))
        window = self.runner.managed_window
        target = window._load(self.owner_a).targetId
        await self.sdk.close_target({'targetId': target})
        close = AsyncMock(side_effect=ValueError('No target with given id found'))
        with patch.object(self.sdk.client.send.Browser, 'getVersion', AsyncMock(return_value={'product': 'Chrome/140.0'})), \
             patch.object(self.sdk.client.send.Target, 'closeTarget', close):
            result = await self.release()
        close.assert_not_awaited()
        self.assertTrue(result['closed'])
        self.assertEqual(window._load(self.owner_a).status, 'ended')

    async def test_empty_bridge_enumeration_cannot_confirm_inspect_or_verify_closed(self):
        await self.runner.start(self.config(self.owner_a))
        window = self.runner.managed_window
        lease = window._load(self.owner_a)
        lease.status = 'handoff'
        window._save(lease)
        @asynccontextmanager
        async def client(_endpoint):
            yield self.sdk.client
        with patch('browser_use_runner.attached_window._client', client), \
             patch.object(self.sdk.client.send.Target, 'getTargets', AsyncMock(return_value={'targetInfos': []})):
            for operation in (window.inspect, window.verify_closed):
                with self.assertRaisesRegex(ValueError, 'hybrid_attached_window_end_unconfirmed'):
                    await operation(self.owner_a)
                self.assertEqual(window._load(self.owner_a).status, 'handoff')

    async def test_popup_registered_during_close_requires_its_own_ack(self):
        # 不变量：旧目标ACK不能替代异步登记的新popup的关闭证据，即便新popup已失去debugger。
        await self.runner.start(self.config(self.owner_a))
        window = self.runner.managed_window
        target = window._load(self.owner_a).targetId
        original = self.sdk.close_target
        async def close_with_popup(params):
            result = await original(params)
            info = {'targetId': 'owned-popup', 'type': 'page', 'url': 'about:blank', 'openerId': target}
            self.sdk.targets['owned-popup'] = info
            self.assertTrue(window.scope.accepts(info))
            return result
        with patch.object(self.sdk.client.send.Target, 'getTargets', AsyncMock(return_value={'targetInfos': []})), \
             patch.object(self.sdk.client.send.Target, 'closeTarget', close_with_popup):
            result = await self.release()
        self.assertFalse(result['closed'])
        lease = window._load(self.owner_a)
        self.assertNotEqual(lease.status, 'ended')
        self.assertIn('owned-popup', lease.ownedTargets)
        self.assertIn('owned-popup', self.sdk.targets)

    async def test_native_recovery_without_task_pages_rejects_personal_or_emergency_page(self):
        await self.runner.start(self.config(self.owner_a))
        browser, manager = self.sdk.browser, self.sdk.browser.session_manager
        await self.release()
        browser.agent_focus_target_id = None
        with self.assertRaisesRegex(ValueError, 'attached_window_target_missing'):
            await manager._recover_agent_focus('task-1')
        self.assertEqual(self.sdk.created, ['task-1'])
        self.assertIn('personal', self.sdk.targets)

    # WHY：SDK logical focus 不保证真实页面 visible；新/复用连接均须激活各自已登记的任务目标。
    async def test_new_and_reused_connection_activate_only_the_current_owned_task_target(self):
        await self.runner.start(self.config(self.owner_a))
        target_a = self.runner.managed_window._load(self.owner_a).targetId
        self.assertEqual(self.sdk.activated, [target_a])
        self.assertTrue((await self.release())['closed'])
        await self.runner.start(self.config(self.owner_b))
        target_b = self.runner.managed_window._load(self.owner_b).targetId
        self.assertEqual(self.sdk.activated, [target_a, target_b])
        self.assertEqual(self.sdk.connects, 1)
        self.assertTrue((await self.release())['closed'])
        self.assertIn('personal', self.sdk.targets)

    # WHY：实际激活可失败；目标已经属于本 operation，原关闭合同必须回收它而保留个人页。
    async def test_activation_failure_preserves_original_error_and_owned_target_cleanup(self):
        self.sdk.fail_activate = True
        with self.assertRaisesRegex(RuntimeError, '^controlled_activation_failure$'):
            await self.runner.start(self.config(self.owner_a))
        lease = self.runner.connection.last_window._load(self.owner_a)
        self.assertEqual(lease.status, 'ended')
        self.assertNotIn(lease.targetId, self.sdk.targets)
        self.assertIn('personal', self.sdk.targets)
        self.assertTrue((await self.runner.close())['closed'])

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
