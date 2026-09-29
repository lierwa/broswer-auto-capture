"""ACK identity, cancellation and timeout never dispatch/replay a browser action."""
import asyncio
import json
import unittest
from uuid import uuid4
from unittest.mock import patch

from browser_use_runner.compilation_control import CompilationAck, CompilationControl, confirmation_budget


class CompilationControlTests(unittest.IsolatedAsyncioTestCase):
    def control(self):
        events = []
        return CompilationControl(uuid4(), events.append), events

    def ack(self, event, **changes):
        return CompilationAck.model_validate_json(json.dumps({'id': str(uuid4()), 'type': 'hybrid_compilation_ack',
            'authorRequestId': event['id'], 'sequence': event['sequence'], 'digest': event['digest'],
            'accepted': True, **changes}))

    async def test_matching_ack_is_required_and_duplicate_is_idempotent(self):
        control, events = self.control()
        task = asyncio.create_task(control.exchange('{}', {'segments': []}))
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        for changes in ({'authorRequestId': str(uuid4())}, {'sequence': 2}, {'digest': '0' * 64}):
            with self.assertRaises(ValueError):
                control.acknowledge(self.ack(events[0], **changes))
            self.assertFalse(task.done())
        ack = self.ack(events[0])
        control.acknowledge(ack)
        self.assertEqual(control.acknowledge(ack), {'accepted': True})
        await task
        self.assertIsNone(control.pending)

    async def test_rejection_and_cancel_release_wait_without_retry(self):
        control, events = self.control()
        task = asyncio.create_task(control.exchange('{}', {'segments': []}))
        await asyncio.sleep(0)
        control.acknowledge(self.ack(events[0], accepted=False))
        with self.assertRaisesRegex(ValueError, 'host_rejected'):
            await task
        task = asyncio.create_task(control.exchange('{}', {'segments': []}))
        await asyncio.sleep(0)
        control.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(len(events), 2)
        self.assertIsNone(control.pending)
        with self.assertRaisesRegex(ValueError, 'ack_conflict'):
            control.acknowledge(self.ack(events[-1]))

    async def test_timeout_has_no_resend_and_releases_pending(self):
        control, events = self.control()
        with patch('browser_use_runner.compilation_control.confirmation_budget', return_value=0.001):
            with self.assertRaisesRegex(ValueError, 'ack_timeout'):
                await control.exchange('{}', {'segments': []})
        self.assertEqual(len(events), 1)
        self.assertIsNone(control.pending)

    def test_budget_counts_only_executed_examples(self):
        self.assertEqual(confirmation_budget({'segments': [
            {'kind': 'function', 'draft': {'examples': [{}, {}, {}]}},
            {'kind': 'function', 'draft': {'examples': [{}, {}, {}, {}]}}, {'kind': 'deterministic'}]}), 17)


if __name__ == '__main__':
    unittest.main()
