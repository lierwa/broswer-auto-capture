"""Foreground denial must not invent focus or destroy an already handed-off owner."""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from browser_use_runner.managed_window import ManagedWindow, WindowLease


class ManagedWindowFocusTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='bat-owned-focus-')
        self.addCleanup(directory.cleanup)
        self.owner_id = uuid4()
        self.window = ManagedWindow(Path(directory.name) / 'profile', self.owner_id)
        self.lease = WindowLease(leaseId=self.owner_id, ownerId=self.owner_id,
            profilePath=str(self.window.profile_path), browserPid=1234, creatorPid=os.getpid(),
            status='handoff', cdpPort=12345, targetId='owned-target', sessionId='owned-session')
        self.window._save(self.lease)
        verification = patch.object(self.window, '_verify', return_value=(True, None))
        verification.start()
        self.addCleanup(verification.stop)

    def api(self, accepted, foreground):
        api = Mock()
        api.EnumWindows.side_effect = lambda callback, _unused: [callback(hwnd, 0) for hwnd in [501, 502, 503, 504]]
        api.GetWindowThreadProcessId.side_effect = lambda hwnd, pointer: setattr(pointer._obj, 'value',
            9876 if hwnd == 501 else self.lease.browserPid)
        api.IsWindowVisible.side_effect = lambda hwnd: hwnd != 504
        api.GetWindow.side_effect = lambda hwnd, _flag: 503 if hwnd == 502 else 0
        api.IsIconic.return_value = False
        api.SetForegroundWindow.return_value = accepted
        api.GetForegroundWindow.return_value = foreground
        return api

    def focus(self, api):
        with patch('browser_use_runner.managed_window.sys.platform', 'win32'), \
                patch('browser_use_runner.managed_window._window_api', return_value=(api, lambda value: value)), \
                patch('browser_use_runner.managed_window.urllib.request.urlopen'):
            return self.window.focus(self.owner_id)

    def test_denial_preserves_owner_and_never_focuses_other_or_auxiliary_windows(self):
        original = self.window.path.read_bytes()
        api = self.api(False, 501)
        with self.assertRaisesRegex(ValueError, '^hybrid_managed_window_foreground_denied$'):
            self.focus(api)
        self.assertEqual(self.window.path.read_bytes(), original)
        api.SetForegroundWindow.assert_called_once_with(503)
        api.ShowWindow.assert_not_called()

    def test_success_requires_observed_owned_foreground_not_only_request_ack(self):
        api = self.api(True, 501)
        with self.assertRaisesRegex(ValueError, '^hybrid_managed_window_foreground_denied$'):
            self.focus(api)
        api.GetForegroundWindow.return_value = 503
        result = self.focus(api)
        self.assertTrue(result['active'])
        self.assertIsNone(result['reason'])
        self.assertEqual(result['ownerId'], str(self.owner_id))

    def test_missing_visible_main_window_is_not_foreground_denial(self):
        api = self.api(True, 503)
        api.IsWindowVisible.return_value = False
        api.IsWindowVisible.side_effect = None
        with self.assertRaisesRegex(ValueError, '^hybrid_managed_window_not_visible$'):
            self.focus(api)
        api.SetForegroundWindow.assert_not_called()

    def test_handoff_preserves_live_lease_without_requiring_os_focus(self):
        self.lease.status = 'running'
        self.window._save(self.lease)
        browser = Mock(id=self.lease.sessionId, agent_focus_target_id=self.lease.targetId)
        browser.stop = AsyncMock()
        with patch.object(self.window, 'focus', side_effect=ValueError('hybrid_managed_window_foreground_denied')) as focus:
            result = asyncio.run(self.window.handoff(browser))
        focus.assert_not_called()
        browser.stop.assert_awaited_once()
        self.assertTrue(result['active'])
        self.assertEqual(self.window._load(self.owner_id).status, 'handoff')
        self.assertTrue(self.window.transferred)


if __name__ == '__main__':
    unittest.main()
