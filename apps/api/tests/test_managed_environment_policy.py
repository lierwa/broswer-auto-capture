"""Real boundaries: no automatic reconnect, no headless handoff, no foreign process close."""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from browser_use_runner.connection_policy import disconnected_handler
from browser_use_runner.managed_window import ManagedWindow, WindowLease
from browser_use_runner.hybrid_main import Runner


class ManagedEnvironmentPolicyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='bat-managed-policy-')
        self.addCleanup(self.directory.cleanup)
        self.window = ManagedWindow(Path(self.directory.name) / 'profile', uuid4(), headless=True)

    def test_existing_disconnect_policy_records_loss_without_reconnect(self):
        lost = Mock()
        asyncio.run(disconnected_handler(lost)())
        lost.assert_called_once_with()

    def test_lost_connection_rejects_before_command_validation_or_capability(self):
        self.window.connection_lost = True
        runner = Runner()
        runner.browser, runner.managed_window = Mock(), self.window
        runner.capability = Mock()
        with self.assertRaisesRegex(ValueError, '^hybrid_managed_window_connection_lost$'):
            asyncio.run(runner.execute({}))
        runner.capability.execute.assert_not_called()

    def test_headless_handoff_fails_before_touching_resources(self):
        browser = Mock(stop=AsyncMock())
        with self.assertRaisesRegex(ValueError, '^hybrid_managed_window_headless_handoff_unsupported$'):
            asyncio.run(self.window.handoff(browser))
        browser.stop.assert_not_called()

    def test_foreign_owner_refuses_before_any_browser_close_or_end(self):
        lease = SimpleNamespace(status='handoff', retainedProcess=False)
        with patch.object(self.window, '_load', return_value=lease), \
                patch('browser_use_runner.managed_window._owner_process', side_effect=ValueError('foreign owner')), \
                patch('browser_use_runner.attached_window._client') as client, \
                patch.object(self.window, 'end') as end:
            with self.assertRaisesRegex(ValueError, 'foreign owner'):
                asyncio.run(self.window.end_gracefully(self.window.owner_id))
        client.assert_not_called(); end.assert_not_called()

    def test_late_profile_child_keeps_lease_and_close_unconfirmed(self):
        # WHY：主进程已退不等于Profile已释放；租约是后续cleanup_required恢复的依据。
        lease = WindowLease(leaseId=self.window.owner_id, ownerId=self.window.owner_id,
            profilePath=str(self.window.profile_path), creatorPid=42, status='running')
        self.window._save(lease)
        self.window.acquired = True
        with patch('browser_use_runner.managed_window._owner_process', return_value=None), \
                patch('browser_use_runner.managed_window._profile_process_present', return_value=True):
            result = asyncio.run(self.window.close(None))
        self.assertEqual(result['status'], 'unconfirmed')
        self.assertTrue(self.window.path.exists())
        self.assertTrue(self.window.acquired)
        with patch('browser_use_runner.managed_window._owner_process', return_value=None), \
                patch('browser_use_runner.managed_window._profile_process_present', return_value=False):
            result = asyncio.run(self.window.close(None))
        self.assertEqual(result['status'], 'confirmed')
        self.assertFalse(self.window.path.exists())

    def test_graceful_close_waits_for_previously_owned_children(self):
        owner, child = Mock(), Mock()
        owner.children.return_value = [child]
        lease = SimpleNamespace(status='running', retainedProcess=False, cdpPort=12, browserId='owned')
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def client(*args, **kwargs):
            yield SimpleNamespace(send=SimpleNamespace(Browser=SimpleNamespace(close=AsyncMock())))

        with patch.object(self.window, '_load', return_value=lease), \
                patch.object(self.window, '_verify', return_value=(True, None)), \
                patch.object(self.window, 'end', return_value={}), \
                patch('browser_use_runner.attached_window._client', client), \
                patch('browser_use_runner.managed_window._owner_process', return_value=owner), \
                patch('browser_use_runner.managed_window.psutil.wait_procs') as wait:
            asyncio.run(self.window.end_gracefully(self.window.owner_id, allow_controlled=True))
        wait.assert_called_once_with([child, owner], timeout=5)

    def test_launch_never_queries_a_port_not_listened_by_its_owner(self):
        # WHY：非零端口分配与 Chrome 监听间有竞争窗口，不能把别的服务认作本次浏览器。
        process = Mock(create_time=Mock(return_value=123), net_connections=Mock(return_value=[]))
        spawned = Mock(pid=42, poll=Mock(return_value=None))
        lease = SimpleNamespace(browserPid=None, browserStarted=None, browserExe=None, cdpPort=None,
            profilePath=str(self.window.profile_path))
        module = 'browser_use_runner.managed_window.'
        with patch(module + 'LocalBrowserWatchdog._find_installed_browser_path', return_value=Path('fixture.exe')), \
                patch(module + 'LocalBrowserWatchdog._find_free_port', return_value=12345), \
                patch(module + 'psutil.process_iter', return_value=[]), \
                patch(module + 'subprocess.Popen', return_value=spawned), \
                patch(module + 'psutil.Process', return_value=process), \
                patch(module + '_owner_process', return_value=process), \
                patch(module + '_browser_id') as endpoint, \
                patch(module + 'asyncio.sleep', new=AsyncMock()), patch.object(self.window, '_save'), \
                patch.dict(os.environ, {'BAT_BROWSER_TEMP_ROOT': self.directory.name}):
            with self.assertRaisesRegex(ValueError, '^hybrid_managed_window_cdp_unavailable$'):
                asyncio.run(self.window._launch(lease))
        endpoint.assert_not_called()
        self.assertIsNone(lease.cdpPort)


if __name__ == '__main__':
    unittest.main()
