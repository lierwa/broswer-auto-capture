"""Profile recovery must verify identities before using the existing window owner."""
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4
import psutil
from browser_use_runner.profile_owner import (
    RunnerOwnership, current_profile_owner, recover_profile_owner, verify_profile_runner_closed,
)


class ProfileOwnerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='bat-hybrid-owner-')
        self.verifier = tempfile.TemporaryDirectory(prefix='bat-hybrid-owner-')
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.verifier.cleanup)
        env = patch.dict(os.environ, TMPDIR=self.verifier.name)
        env.start()
        self.addCleanup(env.stop)
        self.owner = RunnerOwnership(ownerId=uuid4(), pid=1234, started=456.0,
            executable='python.exe', temporaryDirectory=str(Path(self.directory.name).resolve()),
            launcher={'pid': 1234, 'started': 456.0, 'executable': 'python.exe'})
        self.record = Path(self.directory.name) / 'runner-owner.json'
        self.record.write_text(self.owner.model_dump_json(), encoding='utf-8')

    def test_persist_current_runner_before_browser(self):
        process = Mock(pid=5678)
        process.create_time.return_value = 99.0
        process.exe.return_value = 'python.exe'
        with patch('browser_use_runner.profile_owner.psutil.Process', return_value=process):
            value = current_profile_owner(self.owner.ownerId, 5678)
        persisted = RunnerOwnership.model_validate_json(
            (Path(self.verifier.name) / 'runner-owner.json').read_text(encoding='utf-8'))
        self.assertEqual(persisted.pid, 5678)
        self.assertEqual(persisted.ownerId, self.owner.ownerId)
        self.assertEqual(value, persisted.model_dump(mode='json'))

    def test_original_runner_alive_refuses_without_window_operation(self):
        process = Mock()
        process.create_time.return_value = self.owner.started
        process.exe.return_value = self.owner.executable
        with patch('browser_use_runner.profile_owner.psutil.Process', return_value=process), \
                patch('browser_use_runner.profile_owner.ManagedWindow') as window:
            with self.assertRaisesRegex(ValueError, '^hybrid_profile_runner_active$'):
                recover_profile_owner('profile', self.owner.ownerId, self.owner.ownerId, self.owner)
        window.assert_not_called()
        process.kill.assert_not_called()
        process.terminate.assert_not_called()

    def test_reused_pid_or_absent_runner_never_killed(self):
        process = Mock()
        process.create_time.return_value = self.owner.started + 2
        with patch('browser_use_runner.profile_owner.psutil.Process', return_value=process):
            verify_profile_runner_closed(self.owner)
        process.exe.assert_not_called()
        process.kill.assert_not_called()
        with patch('browser_use_runner.profile_owner.psutil.Process', side_effect=psutil.NoSuchProcess(1234)):
            verify_profile_runner_closed(self.owner)

    def test_unavailable_or_changed_identity_refuses(self):
        process = Mock()
        process.create_time.return_value = self.owner.started
        process.exe.return_value = 'other.exe'
        with patch('browser_use_runner.profile_owner.psutil.Process', return_value=process):
            with self.assertRaisesRegex(ValueError, 'owner_mismatch'):
                verify_profile_runner_closed(self.owner)
        with patch('browser_use_runner.profile_owner.psutil.Process', side_effect=psutil.AccessDenied(1234)):
            with self.assertRaises(psutil.AccessDenied):
                verify_profile_runner_closed(self.owner)

    def test_live_windows_launcher_also_blocks_recovery(self):
        self.owner.launcher.pid = 5678
        self.record.write_text(self.owner.model_dump_json(), encoding='utf-8')
        launcher = Mock()
        launcher.create_time.return_value = self.owner.launcher.started
        launcher.exe.return_value = self.owner.launcher.executable
        def process(pid):
            if pid == self.owner.pid:
                raise psutil.NoSuchProcess(pid)
            return launcher
        with patch('browser_use_runner.profile_owner.psutil.Process', side_effect=process):
            with self.assertRaisesRegex(ValueError, '^hybrid_profile_runner_active$'):
                verify_profile_runner_closed(self.owner)
        launcher.terminate.assert_not_called()

    def test_unrelated_launcher_cannot_claim_controller(self):
        process = Mock(pid=1234)
        process.ppid.return_value = 4567
        with patch('browser_use_runner.profile_owner.psutil.Process', return_value=process):
            with self.assertRaisesRegex(ValueError, 'owner_mismatch'):
                current_profile_owner(self.owner.ownerId, 9999)
        self.assertFalse((Path(self.verifier.name) / 'runner-owner.json').exists())

    def test_directory_escape_or_foreign_token_refuses_before_process_lookup(self):
        invalid = self.owner.model_copy(update={'temporaryDirectory': str(Path(self.directory.name).parent)})
        with patch('browser_use_runner.profile_owner.psutil.Process') as process:
            with self.assertRaisesRegex(ValueError, 'directory_invalid'):
                verify_profile_runner_closed(invalid)
            changed = self.owner.model_copy(update={'ownerId': uuid4()})
            self.record.write_text(changed.model_dump_json(), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'owner_mismatch'):
                verify_profile_runner_closed(self.owner)
        process.assert_not_called()

    def test_recovery_requires_matching_creator_after_runner_absence(self):
        window = Mock()
        window._load.return_value = SimpleNamespace(creatorPid=self.owner.pid)
        window.inspect.return_value = {'active': False}
        with patch('browser_use_runner.profile_owner.psutil.Process', side_effect=psutil.NoSuchProcess(1234)), \
                patch('browser_use_runner.profile_owner.ManagedWindow', return_value=window):
            self.assertEqual(recover_profile_owner('profile', self.owner.ownerId, self.owner.ownerId, self.owner), {'active': False})
            window.end.assert_called_once_with(self.owner.ownerId, allow_controlled=True)
            window.reset_mock()
            window._load.return_value = SimpleNamespace(creatorPid=self.owner.pid + 1)
            with self.assertRaisesRegex(ValueError, 'owner_mismatch'):
                recover_profile_owner('profile', self.owner.ownerId, self.owner.ownerId, self.owner)
            window.end.assert_not_called()

    def test_missing_lease_still_inspects_profile_absence(self):
        window = Mock()
        window._load.side_effect = ValueError('hybrid_managed_window_lease_missing')
        window.inspect.return_value = {'active': True}
        with patch('browser_use_runner.profile_owner.psutil.Process', side_effect=psutil.NoSuchProcess(1234)), \
                patch('browser_use_runner.profile_owner.ManagedWindow', return_value=window):
            self.assertTrue(recover_profile_owner('profile', self.owner.ownerId, self.owner.ownerId, self.owner)['active'])
        window.end.assert_not_called()


class ProfileHandoffTests(unittest.IsolatedAsyncioTestCase):
    async def test_profile_handoff_without_automation_capability(self):
        from browser_use_runner.hybrid_main import Runner
        runner = Runner()
        browser = object()
        runner.browser = browser
        runner.managed_window = Mock(handoff=AsyncMock(return_value={'active': True}))
        self.assertIsNone(runner.capability)
        result = await runner.handoff()
        self.assertEqual(result, {'active': True})
        runner.managed_window.handoff.assert_awaited_once_with(browser)
        self.assertIsNone(runner.browser)


if __name__ == '__main__':
    unittest.main()
