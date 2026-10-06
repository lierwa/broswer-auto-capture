"""Protocol failures retain fixed call locations without retrying or leaking messages."""
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use_runner.author_request_loop import AuthorRequestLoop
from browser_use_runner.diagnostic_channel import DiagnosticChannel
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.runtime_diagnostics import command_failure


class RuntimeCommandDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_timeout_is_not_redispatched_and_keeps_safe_source_locations(self):
        runner = Runner()
        runner.browser = object()
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


if __name__ == '__main__':
    unittest.main()
