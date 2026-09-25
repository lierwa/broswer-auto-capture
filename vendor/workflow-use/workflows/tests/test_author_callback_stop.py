"""A failed host observation stops native exploration without losing its source facts."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from browser_use import Agent

from workflow_use.hybrid.author import _business_result
from workflow_use.hybrid.author_callbacks import AuthorCaptureCallbacks, AuthorCaptureStopped
from workflow_use.hybrid.dom_evidence import CollectionReadRequired


def setup_callbacks():
    collector = SimpleNamespace(pending={'actionId': 'a-0001'}, source_gaps=[],
        dispatch_audit=SimpleNamespace(close=Mock()), before_action=AsyncMock(), after_step=AsyncMock())
    agent = SimpleNamespace(state=SimpleNamespace(stopped=False), logger=Mock(),
        _external_pause_event=asyncio.Event(), history=object())
    agent.stop = Mock(side_effect=lambda: Agent.stop(agent))
    events = []
    callbacks = AuthorCaptureCallbacks(collector, lambda: SimpleNamespace(names=['send_keys']),
        diagnostic=events.append, normalize_action=lambda action: None,
        action_outcomes={}, reject_navigation_scope=lambda current: None)
    callbacks.bind(agent)
    model_output = SimpleNamespace(action=[SimpleNamespace(
        model_dump=lambda **kwargs: {'send_keys': {'keys': 'Enter'}})])
    return collector, agent, callbacks, model_output, events


class AuthorCallbackStopTests(unittest.IsolatedAsyncioTestCase):
    async def test_before_observation_failure_stops_public_agent_and_prevents_later_capture(self):
        collector, agent, callbacks, model_output, events = setup_callbacks()
        collector.before_action.side_effect = ValueError('observation_url_changed')

        with self.assertRaisesRegex(AuthorCaptureStopped, 'observation_url_changed'):
            await callbacks.before_action(object(), model_output, 1)
        with self.assertRaisesRegex(AuthorCaptureStopped, 'observation_url_changed'):
            await callbacks.after_step(agent)

        self.assertTrue(agent.state.stopped)
        self.assertTrue(agent._external_pause_event.is_set())
        agent.stop.assert_called_once()
        collector.after_step.assert_not_awaited()
        self.assertEqual(len(collector.source_gaps), 1)
        self.assertEqual(collector.source_gaps[0].actionRefs, ['a-0001'])
        self.assertEqual([event['status'] for event in events], ['started', 'failed'])

    async def test_after_navigation_failure_preserves_pending_and_never_accepts_native_done(self):
        collector, agent, callbacks, model_output, events = setup_callbacks()
        await callbacks.before_action(object(), model_output, 1)
        collector.after_step.side_effect = ValueError('new_navigation_tab_not_ready')

        with self.assertRaisesRegex(AuthorCaptureStopped, 'new_navigation_tab_not_ready'):
            await callbacks.after_step(agent)

        self.assertEqual(collector.pending, {'actionId': 'a-0001'})
        self.assertEqual(collector.source_gaps[0].reason, 'new_navigation_tab_not_ready')
        self.assertTrue(agent.state.stopped)
        history = SimpleNamespace(is_done=lambda: True, is_successful=lambda: True)
        completed, output, gaps = _business_result(history, callbacks.failed, None, None, {'type': 'null'})
        self.assertFalse(completed)
        self.assertIsNone(output)
        self.assertIn('native_agent_run_failed', [item.reason for item in gaps])

    async def test_native_action_failure_with_valid_capture_does_not_stop_exploration(self):
        collector, agent, callbacks, model_output, events = setup_callbacks()
        agent.history = SimpleNamespace(history=[SimpleNamespace(result=[SimpleNamespace(error='read failed')])])

        await callbacks.before_action(object(), model_output, 1)
        await callbacks.after_step(agent)

        self.assertFalse(callbacks.failed)
        agent.stop.assert_not_called()
        self.assertEqual(collector.source_gaps, [])
        self.assertEqual([event['status'] for event in events], ['started', 'completed', 'started', 'completed'])

    async def test_unread_collection_click_is_withheld_but_agent_can_continue(self):
        collector, agent, callbacks, model_output, events = setup_callbacks()
        collector.before_action.side_effect = CollectionReadRequired()
        agent.history = SimpleNamespace(history=[SimpleNamespace(result=[SimpleNamespace(error='read candidates first')])])

        with self.assertRaises(CollectionReadRequired):
            await callbacks.before_action(object(), model_output, 1)
        await callbacks.after_step(agent)

        self.assertFalse(callbacks.failed)
        agent.stop.assert_not_called()
        self.assertEqual(collector.source_gaps, [])
        collector.after_step.assert_awaited_once()

    async def test_cancellation_is_not_reclassified_as_a_capture_failure(self):
        collector, agent, callbacks, model_output, events = setup_callbacks()
        collector.after_step.side_effect = asyncio.CancelledError()

        with self.assertRaises(asyncio.CancelledError):
            await callbacks.after_step(agent)

        self.assertFalse(callbacks.failed)
        self.assertEqual(collector.source_gaps, [])
        agent.stop.assert_not_called()
        self.assertEqual(events[-1]['status'], 'cancelled')

    async def test_unknown_callback_error_records_only_a_fixed_reason(self):
        collector, agent, callbacks, model_output, events = setup_callbacks()
        collector.after_step.side_effect = ValueError('private-page-content')

        with self.assertRaisesRegex(AuthorCaptureStopped, '^author_after_step_capture_failed$'):
            await callbacks.after_step(agent)

        self.assertEqual(collector.source_gaps[0].reason, 'author_after_step_capture_failed')
        self.assertNotIn('private-page-content', str(collector.source_gaps))


if __name__ == '__main__':
    unittest.main()
