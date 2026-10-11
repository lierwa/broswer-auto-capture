"""A fresh native security rejection must survive subsequent DOM capture failure."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, Mock

from workflow_use.hybrid.author_callbacks import AuthorCaptureCallbacks, AuthorCaptureStopped
from workflow_use.hybrid.observation_scope import SourceObservationScope


class ScopeDenialTests(unittest.IsolatedAsyncioTestCase):
    def make_scope(self):
        browser = SimpleNamespace(id='browser', agent_focus_target_id='tab',
            get_browser_state_summary=AsyncMock(), event_bus=SimpleNamespace(event_history={}))
        collector = SimpleNamespace(pending=None, source_gaps=[], dispatch_audit=None)
        callbacks = AuthorCaptureCallbacks(collector, lambda: None, normalize_action=lambda x: x,
            action_outcomes={}, reject_navigation_scope=lambda x: None)
        callbacks.bind(SimpleNamespace(stop=Mock()))
        return SourceObservationScope(browser, collector, callbacks)

    async def test_redirect_denial_is_not_replaced_by_document_error(self):
        scope = self.make_scope()
        scope.browser.event_bus.event_history['fresh'] = SimpleNamespace(error_type='NavigationBlocked')
        with patch('workflow_use.hybrid.observation_scope.live_document_sample',
                   AsyncMock(side_effect=ValueError('document_read_failed'))):
            with self.assertRaisesRegex(AuthorCaptureStopped, 'hybrid_navigation_outside_authorized_scope'):
                await scope.capture()
        scope.callbacks.agent.stop.assert_called_once()
        self.assertEqual(scope.collector.source_gaps[0].reason, 'hybrid_navigation_outside_authorized_scope')

    async def test_denial_during_summary_wins_over_a_refresh(self):
        scope = self.make_scope()
        async def summary(**kwargs):
            scope.browser.event_bus.event_history['fresh'] = SimpleNamespace(error_type='NavigationBlocked')
            raise ValueError('observation_changed_during_capture')
        scope.original = summary
        with patch('workflow_use.hybrid.observation_scope.live_document_sample', AsyncMock(return_value={} )):
            with self.assertRaisesRegex(AuthorCaptureStopped, 'hybrid_navigation_outside_authorized_scope'):
                await scope.capture()

    async def test_prior_run_denial_does_not_poison_new_scope(self):
        scope = self.make_scope()
        scope.browser.event_bus.event_history['old'] = SimpleNamespace(error_type='NavigationBlocked')
        scope = SourceObservationScope(scope.browser, scope.collector, scope.callbacks)
        with patch('workflow_use.hybrid.observation_scope.live_document_sample',
                   AsyncMock(side_effect=ValueError('document_read_failed'))):
            with self.assertRaisesRegex(AuthorCaptureStopped, 'author_observation_capture_failed'):
                await scope.capture()
