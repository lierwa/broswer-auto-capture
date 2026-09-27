"""An unencodable author result still yields a safe fd3 failure envelope."""
import io
import json
import unittest

from browser_use_runner.author_transport import write_author_result
from browser_use_runner.diagnostic_channel import DiagnosticChannel


class Events:
    def __init__(self):
        self.events = []

    def emit(self, event):
        self.events.append(event)


class AuthorTransportTests(unittest.TestCase):
    def test_normal_result_preserves_payload_and_records_write(self):
        channel, events = io.StringIO(), Events()
        response = {'id': 'request-id', 'ok': True, 'result': {'sourceSuccess': False}}

        write_author_result(channel, 'request-id', response, events)

        self.assertEqual(json.loads(channel.getvalue()), response)
        self.assertEqual([event['code'] for event in events.events],
                         ['serialize_started', 'serialize_completed', 'write_started', 'write_completed'])

    def test_unencodable_result_returns_fixed_failure_without_private_value(self):
        channel, events = io.StringIO(), Events()
        response = {'id': 'request-id', 'ok': True, 'result': object()}

        write_author_result(channel, 'request-id', response, events)

        self.assertEqual(json.loads(channel.getvalue()), {'id': 'request-id', 'ok': False,
            'code': 'hybrid_runner_failed', 'reason': 'RuntimeError:author_result_serialization_failed'})
        self.assertEqual([event['code'] for event in events.events],
                         ['serialize_started', 'serialize_failed', 'write_started', 'write_completed'])
        self.assertNotIn('object', channel.getvalue())

    def test_fd3_write_failure_records_stage_and_keeps_original_error(self):
        class FailingChannel:
            def write(self, _payload):
                raise OSError('private pipe detail')

        events = Events()
        with self.assertRaisesRegex(OSError, 'private pipe detail'):
            write_author_result(FailingChannel(), 'request-id', {'id': 'request-id', 'ok': True,
                'result': None}, events)
        self.assertEqual(events.events[-1], {'phase': 'author_transport', 'status': 'failed',
                                             'code': 'write_failed'})

    def test_diagnostic_channel_rejects_nonfixed_metadata(self):
        diagnostics = DiagnosticChannel()
        diagnostics.channel = io.StringIO()
        diagnostics.emit({'phase': 'author_transport', 'status': 'failed',
                          'code': 'serialize_failed', 'raw': 'private page text'})
        diagnostics.emit({'phase': 'before_action_detail', 'status': 'failed',
                          'actionName': 'wait', 'stepNumber': 13, 'stage': 'observation_title',
                          'errorKind': 'timeout_error'})
        self.assertEqual([item['stage'] for item in map(json.loads,
                         diagnostics.channel.getvalue().splitlines())], ['observation_title'])


if __name__ == '__main__':
    unittest.main()
