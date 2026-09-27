"""A same-document URL change must withhold a stale click and allow a new Agent observation."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.author_callbacks import AuthorCaptureCallbacks
from workflow_use.hybrid.observation_scope import ObservationRefreshRequired, SourceObservationScope


class ObservationRefreshTests(unittest.IsolatedAsyncioTestCase):
    def scope(self):
        summary = SimpleNamespace(url='https://fixture.invalid/page-1',
                                  dom_state=SimpleNamespace(selector_map={83: object()}))
        baseline = {'url': summary.url, 'targetId': 'tab-1', 'documentDigest': 'document-1',
                    'stable': True, 'monotonicMs': 1}
        scope = SourceObservationScope.__new__(SourceObservationScope)
        scope.browser = object()
        scope.callbacks = SimpleNamespace(agent=None)
        scope.stamps = [(summary, baseline)]
        scope.diagnostics = []
        return scope, summary, baseline

    async def test_same_document_new_url_withholds_indexed_action_and_allows_reobservation(self):
        scope, summary, baseline = self.scope()
        current = {**baseline, 'url': 'https://fixture.invalid/page-2', 'monotonicMs': 2}
        with patch('workflow_use.hybrid.observation_scope.live_document_sample',
                   AsyncMock(return_value=current)):
            with self.assertRaises(ObservationRefreshRequired):
                await scope.verify_before_action(summary, 9, 83, 'click')
        self.assertEqual(scope.diagnostics[-1]['outcome'], 'changed_after_capture')

        callbacks = AuthorCaptureCallbacks(SimpleNamespace(), lambda: None,
                                           normalize_action=lambda action: action,
                                           action_outcomes={}, reject_navigation_scope=lambda agent: None)
        with self.assertRaises(ObservationRefreshRequired):
            await callbacks.observe('before_action', AsyncMock(side_effect=ObservationRefreshRequired()), {})
        self.assertFalse(callbacks.failed)

    async def test_changed_document_remains_fatal(self):
        scope, summary, baseline = self.scope()
        current = {**baseline, 'url': 'https://fixture.invalid/page-2',
                   'documentDigest': 'document-2', 'monotonicMs': 2}
        with patch('workflow_use.hybrid.observation_scope.live_document_sample',
                   AsyncMock(return_value=current)):
            with self.assertRaisesRegex(ValueError, 'observation_changed_after_capture'):
                await scope.verify_before_action(summary, 9, 83, 'click')
