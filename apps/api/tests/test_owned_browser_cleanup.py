"""Owned browser cleanup must verify the dedicated profile process actually exited."""
import asyncio
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from browser_use_runner.browser_cleanup import close_stage


class OwnedBrowserCleanupTests(unittest.TestCase):
    def test_successful_kill_return_does_not_confirm_a_live_profile_process(self):
        browser = unittest.mock.Mock()
        browser.kill = AsyncMock()
        profile_path = Path('/tmp/bat-owned-profile').resolve()

        with patch('browser_use_runner.browser_cleanup._profile_process_present', return_value=True), \
                patch('browser_use_runner.browser_cleanup.asyncio.sleep', new=AsyncMock()):
            result = asyncio.run(close_stage('browser_close', browser,
                'cleanup_browser_close_failed', profile_path=profile_path))

        browser.kill.assert_awaited_once()
        self.assertEqual(result, {'stage': 'browser_close', 'status': 'unconfirmed',
                                  'code': 'cleanup_browser_close_failed'})


if __name__ == '__main__':
    unittest.main()
