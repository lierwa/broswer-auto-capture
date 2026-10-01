"""Real boundaries: no automatic reconnect, no headless handoff, no foreign process close."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from browser_use_runner.connection_policy import disconnected_handler
from browser_use_runner.managed_window import ManagedWindow
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
        lease = SimpleNamespace(status='handoff')
        with patch.object(self.window, '_load', return_value=lease), \
                patch('browser_use_runner.managed_window._owner_process', side_effect=ValueError('foreign owner')), \
                patch('browser_use_runner.attached_window._client') as client, \
                patch.object(self.window, 'end') as end:
            with self.assertRaisesRegex(ValueError, 'foreign owner'):
                asyncio.run(self.window.end_gracefully(self.window.owner_id))
        client.assert_not_called(); end.assert_not_called()


if __name__ == '__main__':
    unittest.main()
