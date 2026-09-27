"""Capture failures emit only fixed read stages while preserving original errors locally."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.author_callbacks import AuthorCaptureCallbacks
from workflow_use.hybrid.capture_observation import ObservationCapture
from workflow_use.hybrid.observation_scope import LiveDocumentReadError, SourceObservationScope


class AuthorObservationDetailTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_document_timeout_keeps_cause_and_emits_fixed_stage(self):
        page = SimpleNamespace(get_target_info=AsyncMock(side_effect=TimeoutError('private URL')))
        browser = SimpleNamespace(agent_focus_target_id='tab', get_current_page=AsyncMock(return_value=page),
                                  get_browser_state_summary=AsyncMock())
        events = []
        callbacks = AuthorCaptureCallbacks(SimpleNamespace(pending=None), lambda: None,
            diagnostic=events.append, normalize_action=lambda _: None, action_outcomes={},
            reject_navigation_scope=lambda _: None)
        callbacks.agent = SimpleNamespace(state=SimpleNamespace(n_steps=13))
        callbacks.before_action_active = True
        callbacks.current_action = {'actionName': 'wait', 'stepNumber': 13}
        scope = SourceObservationScope(browser, SimpleNamespace(pending=None), callbacks)

        with self.assertRaises(LiveDocumentReadError) as raised:
            await scope.verify_before_action(SimpleNamespace(url='private URL'), 13, action_name='wait')

        self.assertIsInstance(raised.exception.__context__, TimeoutError)
        self.assertEqual(events, [{'phase': 'before_action_detail', 'status': 'failed',
            'actionName': 'wait', 'stepNumber': 13, 'stage': 'live_target_before',
            'errorKind': 'timeout_error'}])
        self.assertNotIn('private URL', str(events))

    async def test_observation_title_and_url_identify_only_failed_read(self):
        for values, expected in ((TimeoutError('private title'), 'observation_title'),
                                 (['title', TimeoutError('private URL')], 'observation_url')):
            with self.subTest(stage=expected):
                events = []
                callbacks = AuthorCaptureCallbacks(SimpleNamespace(), lambda: None,
                    diagnostic=events.append, normalize_action=lambda _: None, action_outcomes={},
                    reject_navigation_scope=lambda _: None)
                callbacks.before_action_active = True
                callbacks.current_action = {'actionName': 'wait', 'stepNumber': 13}
                capture = ObservationCapture()
                capture.browser = SimpleNamespace(agent_focus_target_id='tab')
                capture.observation_scope = SimpleNamespace(callbacks=callbacks)
                summary = SimpleNamespace(tabs=[SimpleNamespace(target_id='tab')])
                with patch('workflow_use.hybrid.capture_observation.read_fact',
                           AsyncMock(side_effect=values)):
                    with self.assertRaises(TimeoutError):
                        await capture.observe(summary, [])
                self.assertEqual(events[0]['stage'], expected)
                self.assertEqual(events[0]['errorKind'], 'timeout_error')
                self.assertNotIn('private', str(events))

    async def test_outside_before_action_detail_is_not_emitted(self):
        events = []
        callbacks = AuthorCaptureCallbacks(SimpleNamespace(), lambda: None,
            diagnostic=events.append, normalize_action=lambda _: None, action_outcomes={},
            reject_navigation_scope=lambda _: None)
        callbacks.current_action = {'actionName': 'wait', 'stepNumber': 13}
        callbacks.record_before_action_detail('observation_title', TimeoutError('private'))
        self.assertEqual(events, [])
        callbacks.before_action_active = True
        callbacks.current_action = {'actionName': 'find_elements', 'stepNumber': 13,
                                    'selector': 'private selector'}
        callbacks.record_before_action_detail('observation_title', TimeoutError('private'))
        self.assertEqual(events[0]['actionName'], 'find_elements')
        self.assertNotIn('selector', events[0])


if __name__ == '__main__':
    unittest.main()
