"""Protect transparent SDK forwarding and bounded, non-sensitive diagnostics."""
import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from browser_use_runner.target_events import TargetEvents


class TargetEventTests(unittest.TestCase):
    def test_native_result_exception_and_bounded_metadata(self):
        browser = SimpleNamespace(agent_focus_target_id='owned-target')
        def lookup(_target):
            browser.agent_focus_target_id = None
            return None
        manager = SimpleNamespace(_get_session_for_target=lookup, _sessions={},
            get_all_page_targets=lambda: [], get_target_id_from_session_id=lambda _: 'owned-target',
            _handle_target_detached=AsyncMock(side_effect=ValueError('native_error')))
        recorder = TargetEvents(browser)
        self.assertIsNone(recorder.session_lookup(manager)(target_id='owned-target'))
        self.assertEqual(recorder.events[-1]['kind'], 'session_lookup_cleared_focus')
        with self.assertRaisesRegex(ValueError, '^native_error$'):
            asyncio.run(recorder.detached(manager)({'sessionId': 'owned-session'}))
        manager._handle_target_detached.assert_awaited_once_with({'sessionId': 'owned-session'})
        for _ in range(30):
            recorder.record(manager, 'detach_received', 'owned-target', 'owned-session')
        self.assertEqual(len(recorder.events), 16)
        self.assertNotIn('owned-target', str(recorder.events))
        self.assertNotIn('owned-session', str(recorder.events))


if __name__ == '__main__':
    unittest.main()
