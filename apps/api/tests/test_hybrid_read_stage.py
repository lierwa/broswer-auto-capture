"""Replay read failures identify the stage without exposing dependency messages."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use_runner.hybrid_main import Runner, safe_runtime_error_code


READ_COMMAND = {
    'name': 'browser.read-fields', 'version': 2,
    'specification': {'container': '.items', 'fields': {'text': {'selector': ':scope'}},
                      'maxItems': 1, 'outputSchema': {'type': 'array'}},
}


def runner_on_page():
    page = SimpleNamespace(get_url=AsyncMock(return_value='https://fixture.invalid/'))
    runner = Runner()
    runner.browser = SimpleNamespace(get_current_page=AsyncMock(return_value=page))
    runner.allowed_sites = [{'scheme': 'https', 'domain': 'fixture.invalid',
                             'port': None, 'includeSubdomains': False}]
    return runner


class HybridReadStageTests(unittest.IsolatedAsyncioTestCase):
    async def test_collection_failure_has_safe_stage_and_keeps_original_cause_local(self):
        runner = runner_on_page()
        cause = RuntimeError('private page text and dependency details')
        with patch('browser_use_runner.hybrid_main.read_fields', AsyncMock(side_effect=cause)) as read:
            with self.assertRaises(RuntimeError) as raised:
                await runner.execute(READ_COMMAND)

        self.assertEqual(str(raised.exception), 'hybrid_read_collection_failed')
        self.assertEqual(safe_runtime_error_code(raised.exception), 'hybrid_read_collection_failed')
        self.assertIs(raised.exception.__cause__, cause)
        self.assertNotIn(str(cause), str(raised.exception))
        self.assertEqual(read.await_count, 1)
        self.assertEqual(runner.commands, 1)

    async def test_observation_failure_after_read_has_distinct_stage_and_no_second_read(self):
        runner = runner_on_page()
        cause = RuntimeError('private observation payload')
        runner.observe = AsyncMock(side_effect=cause)
        with patch('browser_use_runner.hybrid_main.read_fields', AsyncMock(return_value=[])) as read:
            with self.assertRaises(RuntimeError) as raised:
                await runner.execute(READ_COMMAND)

        self.assertEqual(str(raised.exception), 'hybrid_read_observation_failed')
        self.assertEqual(safe_runtime_error_code(raised.exception), 'hybrid_read_observation_failed')
        self.assertIs(raised.exception.__cause__, cause)
        self.assertNotIn(str(cause), str(raised.exception))
        self.assertEqual(read.await_count, 1)
        self.assertEqual(runner.observe.await_count, 1)
        self.assertEqual(runner.commands, 1)


if __name__ == '__main__':
    unittest.main()
