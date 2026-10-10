"""Preserve completed capture on real capability failures without changing dispatch or cancellation."""
import asyncio
import io
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from browser_use_runner.author_request_loop import AuthorRequestLoop
from browser_use_runner.diagnostic_channel import DiagnosticChannel
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.task_pointer import adapt_pointer
from workflow_use.hybrid.capability import OrdinaryCapability


class ActionFailureCaptureTests(unittest.IsolatedAsyncioTestCase):
    def capability(self, capture=None):
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.event_capture = SimpleNamespace(arm=AsyncMock(), complete=AsyncMock(return_value=
            capture or {'status': 'missing', 'events': [], 'limitations': ['private page detail']}))
        return capability

    async def test_original_timeout_and_native_dispatch_counts_reach_protocol(self):
        failure = TimeoutError('private request URL')
        async def native(_params, session_id=None):
            raise failure
        client = SimpleNamespace(send=SimpleNamespace(Input=SimpleNamespace(dispatchMouseEvent=native)))
        adapt_pointer(client)
        capability = self.capability()
        async def dispatch():
            await client.send.Input.dispatchMouseEvent({'type': 'mousePressed', 'x': 1, 'y': 1}, 'owned')
        async def execute(*_args):
            return await capability._dispatch_captured('click', dispatch)
        runner = Runner()
        runner.browser = SimpleNamespace(_cdp_client_root=client, get_current_page=AsyncMock(return_value=
            SimpleNamespace(get_url=AsyncMock(return_value='https://owned.invalid/'))))
        runner.assert_page_scope = AsyncMock()
        runner.capability = SimpleNamespace(execute_checked=execute)
        output, diagnostics = io.StringIO(), DiagnosticChannel()
        diagnostics.channel = io.StringIO()
        request = {'id': '9af1530f-8b25-4b11-8b62-c34fa9db8329', 'type': 'hybrid_execute', 'actionRef': 'a-0002',
            'command': {'name': 'browser.workflow-step', 'version': 2, 'actionName': 'wait',
                        'args': {'seconds': 1}, 'target': None, 'postconditions': []}}
        await AuthorRequestLoop(runner, output, diagnostics, lambda _: None).respond(request)
        event = json.loads(diagnostics.channel.getvalue())
        self.assertEqual(json.loads(output.getvalue())['reason'], 'TimeoutError')
        self.assertEqual(event['eventCapture']['status'], 'missing')
        self.assertEqual(event['eventCapture']['events'], 0)
        self.assertEqual(event['eventCapture']['limitations'], 1)
        self.assertEqual(event['eventCapture']['inputDispatch']['mousePressed'],
                         {'attempted': 1, 'cancelled': 0, 'failed': 1})
        self.assertEqual(sum(event['eventCapture']['inputAcknowledgements'].values()), 0)
        self.assertNotIn('private', diagnostics.channel.getvalue())
        capability.event_capture.arm.assert_awaited_once()
        capability.event_capture.complete.assert_awaited_once()

    async def test_cancel_is_same_exception_with_completed_capture(self):
        capability = self.capability({'status': 'captured', 'events': [{'private': 'body'}], 'limitations': []})
        failure = asyncio.CancelledError()
        async def dispatch(): raise failure
        with self.assertRaises(asyncio.CancelledError) as caught:
            await capability._dispatch_captured('click', dispatch)
        self.assertIs(caught.exception, failure)
        self.assertEqual(failure.event_capture, {'status': 'captured', 'events': 1, 'limitations': 0})
        capability.event_capture.complete.assert_awaited_once()

    async def test_capture_failure_preserves_original_error_and_prior_evidence(self):
        capability = self.capability()
        failure = RuntimeError('original action failure')
        failure.event_capture = {'status': 'captured', 'events': 2, 'limitations': 1}
        capability.event_capture.complete.side_effect = ValueError('secondary capture failure')
        async def dispatch(): raise failure
        with self.assertRaises(RuntimeError) as caught:
            await capability._dispatch_captured('click', dispatch)
        self.assertIs(caught.exception, failure)
        self.assertEqual(failure.event_capture, {'status': 'captured', 'events': 2, 'limitations': 1})

    async def test_action_result_error_keeps_capture_for_target_and_focus_actions(self):
        for action in ['click', 'send_keys']:
            with self.subTest(action=action):
                capability = self.capability()
                capability.registry = SimpleNamespace(validate_action=lambda *_args: object())
                capability._act = AsyncMock(return_value=SimpleNamespace(error='private failure', metadata={}))
                prepared = SimpleNamespace(index=1, target_id='owned', frame_id=None, session_id='owned', element=object())
                with self.assertRaisesRegex(RuntimeError, '^ordinary_action_failed$') as caught:
                    await capability.execute(action, {}, {'strategy': 'css', 'value': '#send'} if action == 'click' else None,
                                             _prepared=prepared if action == 'click' else None)
                self.assertEqual(caught.exception.event_capture, {'status': 'missing', 'events': 0, 'limitations': 1})
                capability._act.assert_awaited_once()
                capability.event_capture.complete.assert_awaited_once()


if __name__ == '__main__':
    unittest.main()
