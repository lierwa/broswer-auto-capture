"""Protect policy errors while tolerating an already-gone native interception, without retry."""
import unittest
from unittest.mock import AsyncMock, patch
from browser_use_runner.task_access import Admission

GONE = {'code': -32602, 'message': 'Invalid InterceptionId.'}


def event(identity):
    return {'requestId': identity, 'resourceType': 'Document', 'request': {'url': 'https://owned.invalid/'}}


class Delivery(unittest.IsolatedAsyncioTestCase):
    async def test_gone_native_interception_does_not_poison_next_request_or_retry(self):
        send = AsyncMock(side_effect=[RuntimeError(GONE), {}])
        gate = Admission(send)
        with patch('browser_use_runner.task_access.acquire', return_value='admitted') as acquire:
            await gate.decide(event('gone'), 'owned')
            self.assertIsNone(gate.failure)
            await gate.decide(event('next'), 'owned')
        self.assertEqual(acquire.call_count, 2)
        self.assertEqual(send.await_count, 2)
        self.assertEqual([args.args[1]['requestId'] for args in send.await_args_list], ['gone', 'next'])
        self.assertEqual(gate.counts['interception-gone:Document'], 1)

    async def test_other_native_protocol_error_still_closes_gate(self):
        for error in [RuntimeError({'code': -32602, 'message': 'Invalid parameters'}),
                      RuntimeError({'code': -32000, 'message': 'Invalid InterceptionId.'}),
                      RuntimeError('Invalid InterceptionId.')]:
            send = AsyncMock(side_effect=[error, {}])
            gate = Admission(send)
            with patch('browser_use_runner.task_access.acquire', return_value='admitted'):
                await gate.decide(event('bad'), 'owned')
            self.assertEqual(gate.failure, 'capture_access_state_unavailable')
            self.assertEqual(send.await_args_list[-1].args[0], 'failRequest')

    async def test_same_error_from_policy_is_not_a_delivery_exception(self):
        send = AsyncMock()
        gate = Admission(send)
        with patch('browser_use_runner.task_access.acquire', side_effect=RuntimeError(GONE)):
            await gate.decide(event('policy'), 'owned')
        self.assertEqual(gate.failure, 'capture_access_state_unavailable')
        self.assertEqual(send.await_args_list[0].args[0], 'failRequest')

    async def test_policy_limit_keeps_request_blocked(self):
        send = AsyncMock()
        gate = Admission(send)
        with patch('browser_use_runner.task_access.acquire', side_effect=RuntimeError('capture_rate_limited')):
            await gate.decide(event('limited'), 'owned')
        self.assertEqual(gate.counts['limited:Document'], 1)
        self.assertEqual(send.await_args_list[0].args[0], 'failRequest')
        self.assertNotIn('interception-gone:Document', gate.counts)


if __name__ == '__main__': unittest.main()
