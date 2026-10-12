"""Protocol failures retain fixed call locations without retrying or leaking messages."""
import io
import json
import asyncio
import logging
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use_runner.author_request_loop import AuthorRequestLoop
from browser_use_runner.diagnostic_channel import DiagnosticChannel
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.runtime_diagnostics import command_failure, native_action_failure
from browser_use_runner.task_pointer import adapt_pointer
from browser_use.tools.service import Tools
from browser_use.tools.views import NavigateAction
from workflow_use.hybrid.target_preparation import verify_event_target


class RuntimeCommandDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_tools_swallowed_error_preserves_cause_without_message(self):
        native = TimeoutError('private URL Cookie page body')
        logger = logging.getLogger('browser_use.diagnostic-test')
        logger.propagate = True
        class CompletedEvent:
            def __await__(self): return asyncio.sleep(0).__await__()
            async def event_result(self, **_kwargs): return None
        browser = SimpleNamespace(logger=logger,
            event_bus=SimpleNamespace(dispatch=lambda _: CompletedEvent()),
            get_browser_state_summary=AsyncMock(side_effect=native))
        navigate = Tools().registry.registry.actions['navigate'].function
        handlers = list(logging.getLogger('browser_use').handlers)
        with self.assertRaises(RuntimeError) as failure:
            with native_action_failure():
                # Exercise the pinned native catch and a child task, not a hand-built diagnostic object.
                result = await asyncio.wait_for(navigate(params=NavigateAction(url='https://owned.invalid'),
                    browser_session=browser), timeout=2)
                self.assertTrue(result.error)
                raise RuntimeError('ordinary_action_failed')
        self.assertIs(failure.exception.__cause__, native)
        self.assertEqual(logging.getLogger('browser_use').handlers, handlers)
        event = command_failure({'type': 'hybrid_execute', 'actionRef': 'a-0001'}, failure.exception)
        self.assertEqual(event['causes'][1]['errorKind'], 'timeout_error')
        self.assertIn('sdk_tools', [location['source'] for location in event['causes'][1]['locations']])
        self.assertNotIn('private', json.dumps(event))
        self.assertNotIn('Cookie', json.dumps(event))
        with self.assertRaises(RuntimeError) as later:
            with native_action_failure():
                try: raise ValueError('unrelated private')
                except ValueError: logger.error('unrelated source')
                raise RuntimeError('ordinary_action_failed')
        self.assertIsNone(later.exception.__cause__)

    async def test_native_timeout_is_not_redispatched_and_keeps_safe_source_locations(self):
        runner = Runner()
        runner.browser = SimpleNamespace(get_current_page=AsyncMock(return_value=
            SimpleNamespace(get_url=AsyncMock(return_value='https://owned.invalid/'))))
        runner.assert_page_scope = AsyncMock()
        error = TimeoutError('private URL Cookie page body')
        runner.capability = SimpleNamespace(execute_checked=AsyncMock(side_effect=error))
        channel, diagnostics = io.StringIO(), DiagnosticChannel()
        diagnostics.channel = io.StringIO()
        loop = AuthorRequestLoop(runner, channel, diagnostics, lambda _error: None)
        request = {'id': '9af1530f-8b25-4b11-8b62-c34fa9db8329', 'type': 'hybrid_execute', 'actionRef': 'a-0002',
                   'command': {'name': 'browser.workflow-step', 'version': 2,
                               'actionName': 'wait', 'args': {'seconds': 1},
                               'target': None, 'postconditions': []}}
        # WHY：原 execute 与错误应答一起验证，不能只测手造诊断对象。
        await loop.respond(request)
        runner.capability.execute_checked.assert_awaited_once()
        self.assertEqual(json.loads(channel.getvalue())['reason'], 'TimeoutError')
        event = json.loads(diagnostics.channel.getvalue())
        self.assertEqual(event['phase'], 'runtime_command_failure')
        self.assertEqual(event['causes'][0]['errorKind'], 'timeout_error')
        self.assertIn('bat_runner', [item['source'] for item in event['causes'][0]['locations']])
        self.assertNotIn('private', diagnostics.channel.getvalue())
        diagnostics.emit({**event, 'message': 'private'})
        diagnostics.emit({**event, 'causes': [{**event['causes'][0],
            'locations': [{'source': 'private', 'line': 1}]}]})
        self.assertEqual(len(diagnostics.channel.getvalue().splitlines()), 1)
        self.assertIsNone(command_failure({**request, 'actionRef': 'private/url'}, error))

    async def test_input_acknowledgements_remain_distinct_from_missing_dom_events(self):
        native = AsyncMock(return_value={})
        client = SimpleNamespace(send=SimpleNamespace(Input=SimpleNamespace(dispatchMouseEvent=native)))
        adapt_pointer(client)
        runner = Runner()
        runner.browser = SimpleNamespace(_cdp_client_root=client, get_current_page=AsyncMock(return_value=
            SimpleNamespace(get_url=AsyncMock(return_value='https://owned.invalid/'))))
        runner.assert_page_scope = AsyncMock()
        async def fail(*_args):
            for kind in ['mouseMoved', 'mousePressed', 'mouseReleased']:
                await client.send.Input.dispatchMouseEvent({'type': kind, 'x': 1, 'y': 1}, session_id='owned')
            verify_event_target({'status': 'missing', 'events': [], 'limitations': ['private URL node text']})
        runner.capability = SimpleNamespace(execute_checked=AsyncMock(side_effect=fail))
        output, diagnostics = io.StringIO(), DiagnosticChannel()
        diagnostics.channel = io.StringIO()
        request = {'id': '9af1530f-8b25-4b11-8b62-c34fa9db8329', 'type': 'hybrid_execute', 'actionRef': 'a-0002',
            'command': {'name': 'browser.workflow-step', 'version': 2, 'actionName': 'wait',
                        'args': {'seconds': 1}, 'target': None, 'postconditions': []}}
        await AuthorRequestLoop(runner, output, diagnostics, lambda _: None).respond(request)
        event = json.loads(diagnostics.channel.getvalue())
        self.assertEqual(event['eventCapture'], {'status': 'missing', 'events': 0, 'limitations': 1,
            'inputAcknowledgements': {'mouseMoved': 1, 'mousePressed': 1, 'mouseReleased': 1},
            'inputDispatch': {kind: {'attempted': 1, 'cancelled': 0, 'failed': 0}
                              for kind in ('mouseMoved', 'mousePressed', 'mouseReleased')}})
        self.assertFalse(json.loads(output.getvalue())['ok'])
        self.assertEqual(json.loads(output.getvalue())['reason'], 'RuntimeError')
        runner.capability.execute_checked.assert_awaited_once()
        self.assertEqual(native.await_count, 3)
        self.assertNotIn('private', diagnostics.channel.getvalue())
        diagnostics.emit({**event, 'eventCapture': {**event['eventCapture'], 'url': 'private'}})
        diagnostics.emit({**event, 'eventCapture': {**event['eventCapture'], 'inputAcknowledgements': None}})
        diagnostics.emit({**event, 'eventCapture': {**event['eventCapture'], 'inputDispatch': None}})
        diagnostics.emit({**event, 'eventCapture': {**event['eventCapture'], 'inputDispatch': {
            **event['eventCapture']['inputDispatch'], 'mousePressed': {'attempted': 1, 'cancelled': 0,
                'failed': 0, 'text': 'private'}}}})
        self.assertEqual(len(diagnostics.channel.getvalue().splitlines()), 1)


if __name__ == '__main__':
    unittest.main()
