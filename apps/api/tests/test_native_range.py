"""Protect native UIA dispatch ownership, cancellation and uncertain completion."""
import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from browser_use_runner import native_range
from browser_use_runner.managed_targets import ManagedTargets


class NativeRangeTests(unittest.IsolatedAsyncioTestCase):
    def process(self, second=b'{"status":"dispatched"}\n'):
        return SimpleNamespace(stdin=SimpleNamespace(write=Mock(), drain=AsyncMock()),
            stdout=SimpleNamespace(readline=AsyncMock(side_effect=[b'{"status":"ready"}\n', second])),
            returncode=None, kill=Mock(), wait=AsyncMock())

    async def run_apply(self, process, focused=True, owner=None):
        evidence = {'pid': 123, 'started': 10}
        with patch.object(native_range.asyncio, 'create_subprocess_exec', AsyncMock(return_value=process)), \
                patch.object(native_range, '_focused', AsyncMock(return_value=focused)):
            return await native_range._apply(SimpleNamespace(_target_id='owned'), 'object',
                owner or (lambda _: evidence), {'owner': evidence, 'id': '', 'name': 'range', 'value': '.12345'})

    async def test_owner_or_focus_change_never_dispatches_or_falls_back(self):
        for focused, owner, reason in [(False, None, 'target_changed'),
                (True, lambda _: {'pid': 456, 'started': 20}, 'owner_changed')]:
            process = self.process()
            with self.assertRaisesRegex(RuntimeError, reason):
                await self.run_apply(process, focused, owner)
            self.assertNotIn(unittest.mock.call(b'apply\n'), process.stdin.write.call_args_list)
            process.kill.assert_called_once()
            process.wait.assert_awaited_once()

    async def test_cancel_before_dispatch_closes_helper_and_preserves_cancel(self):
        process = self.process()
        with patch.object(native_range, '_focused', AsyncMock(side_effect=asyncio.CancelledError)), \
                patch.object(native_range.asyncio, 'create_subprocess_exec', AsyncMock(return_value=process)):
            with self.assertRaises(asyncio.CancelledError):
                await native_range._apply(SimpleNamespace(_target_id='owned'), 'object', lambda _: {}, {'owner': {}})
        self.assertNotIn(unittest.mock.call(b'apply\n'), process.stdin.write.call_args_list)
        process.kill.assert_called_once()
        process.wait.assert_awaited_once()

    async def test_uncertain_ack_after_dispatch_is_error_not_compatibility_retry(self):
        process = self.process(b'{"status":"unavailable"}\n')
        with self.assertRaisesRegex(RuntimeError, 'action_unconfirmed'):
            await self.run_apply(process)
        self.assertEqual(process.stdin.write.call_args_list.count(unittest.mock.call(b'apply\n')), 1)

    async def test_known_unavailable_before_dispatch_allows_existing_compatibility_path(self):
        process = self.process()
        process.stdout.readline = AsyncMock(return_value=b'{"status":"unavailable"}\n')
        self.assertFalse(await self.run_apply(process))
        self.assertNotIn(unittest.mock.call(b'apply\n'), process.stdin.write.call_args_list)

    def test_owner_callback_rejects_unowned_or_released_targets_before_process_access(self):
        lease = SimpleNamespace(headless=False, ownedTargets=['owned'], status='running')
        window = SimpleNamespace(owner_id='owner', _load=Mock(return_value=lease), scope=None)
        with patch('browser_use_runner.managed_window._owner_process') as process:
            with self.assertRaisesRegex(ValueError, 'target_not_owned'):
                ManagedTargets(window).native_range_owner('other')
            lease.status = 'handoff'
            with self.assertRaisesRegex(ValueError, 'target_not_owned'):
                ManagedTargets(window).native_range_owner('owned')
            process.assert_not_called()

    def test_frames_reuse_existing_scope_proof_and_headless_has_no_native_capability(self):
        lease = SimpleNamespace(headless=False, ownedTargets=['owned'], status='running', browserPid=123, browserStarted=10)
        scope = SimpleNamespace(accepts=Mock(return_value=True))
        window = SimpleNamespace(owner_id='owner', _load=Mock(return_value=lease), scope=scope)
        with patch('browser_use_runner.managed_window._owner_process', return_value=object()) as process:
            self.assertEqual(ManagedTargets(window).native_range_owner('frame'), {'pid': 123, 'started': 10})
            scope.accepts.assert_called_once_with({'type': 'iframe', 'targetId': 'frame'})
            process.assert_called_once_with(lease)
            lease.headless = True
            self.assertIsNone(ManagedTargets(window).native_range_owner('owned'))
            process.assert_called_once()


if __name__ == '__main__': unittest.main()
