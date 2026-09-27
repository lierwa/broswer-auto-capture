"""Replay read failures identify the stage without exposing dependency messages."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use_runner.hybrid_main import Runner, safe_runtime_error_code
from workflow_use.hybrid.rendered_field_text import FieldReadError


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
    async def test_bounded_read_code_survives_without_field_or_page_details(self):
        for code in ('read_collection_limit', 'ambiguous_or_missing_read_field'):
            with self.subTest(code=code):
                runner = runner_on_page()
                cause = FieldReadError(code, field_name='private field', match_count=101,
                                       reason='private page text')
                with patch('browser_use_runner.hybrid_main.read_fields', AsyncMock(side_effect=cause)) as read:
                    with self.assertRaises(RuntimeError) as raised:
                        await runner.execute(READ_COMMAND)

                self.assertEqual(str(raised.exception), code)
                self.assertEqual(safe_runtime_error_code(raised.exception), code)
                self.assertIs(raised.exception.__cause__, cause)
                self.assertNotIn('private', str(raised.exception))
                self.assertEqual(read.await_count, 1)

    async def test_collection_failure_has_safe_stage_and_keeps_original_cause_local(self):
        runner = runner_on_page()
        cause = RuntimeError('private page text and dependency details')
        with patch('browser_use_runner.hybrid_main.read_fields', AsyncMock(side_effect=cause)) as read:
            with self.assertRaises(RuntimeError) as raised:
                await runner.execute(READ_COMMAND)

        self.assertEqual(str(raised.exception), 'hybrid_read_fields_runtime_error')
        self.assertEqual(safe_runtime_error_code(raised.exception), 'hybrid_read_fields_runtime_error')
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

        self.assertEqual(str(raised.exception), 'hybrid_read_observation_runtime_error')
        self.assertEqual(safe_runtime_error_code(raised.exception), 'hybrid_read_observation_runtime_error')
        self.assertIs(raised.exception.__cause__, cause)
        self.assertNotIn(str(cause), str(raised.exception))
        self.assertEqual(read.await_count, 1)
        self.assertEqual(runner.observe.await_count, 1)
        self.assertEqual(runner.commands, 1)

    async def test_public_collection_query_marks_original_error_and_reports_safe_stage(self):
        runner = runner_on_page()
        page = await runner.browser.get_current_page()
        cause = RuntimeError('private selector and page details')
        page.get_elements_by_css_selector = AsyncMock(side_effect=cause)

        with self.assertRaises(RuntimeError) as raised:
            await runner.execute(READ_COMMAND)

        self.assertEqual(str(raised.exception), 'hybrid_read_target_query_runtime_error')
        self.assertEqual(safe_runtime_error_code(raised.exception), str(raised.exception))
        self.assertIs(raised.exception.__cause__, cause)
        self.assertEqual(cause.__notes__, ['bat_read_collection_query'])
        self.assertNotIn('private', str(raised.exception))
        self.assertEqual(page.get_elements_by_css_selector.await_count, 1)

    async def test_inner_scope_checks_are_not_misreported_as_field_projection(self):
        command = {**READ_COMMAND, 'scope': {'url': 'https://fixture.invalid/'}}
        for stage, results, collection_calls in (
                ('inner_pre_scope', [RuntimeError('private initial scope')], 0),
                ('inner_post_scope', ['tab', RuntimeError('private final scope')], 1)):
            with self.subTest(stage=stage):
                runner = runner_on_page()
                cause = results[-1]
                resolver = SimpleNamespace(assert_scope=AsyncMock(side_effect=results),
                                           resolve_collection=AsyncMock(return_value=[]))
                with patch('workflow_use.hybrid.read.TargetResolver', return_value=resolver):
                    with self.assertRaises(RuntimeError) as raised:
                        await runner.execute(command)
                self.assertEqual(str(raised.exception), f'hybrid_read_{stage}_runtime_error')
                self.assertEqual(safe_runtime_error_code(raised.exception), str(raised.exception))
                self.assertIs(raised.exception.__cause__, cause)
                self.assertNotIn('private', str(raised.exception))
                self.assertEqual(resolver.resolve_collection.await_count, collection_calls)
                self.assertEqual(runner.commands, 1)

    async def test_collection_snapshot_failure_precedes_css_query(self):
        runner = runner_on_page()
        page = await runner.browser.get_current_page()
        cause = RuntimeError('DOM Error while querying private snapshot and page details')
        page.get_target_info = AsyncMock(side_effect=[{'targetId': 'tab'}, {'targetId': 'tab'}, cause])
        page.get_elements_by_css_selector = AsyncMock(return_value=[])
        command = {**READ_COMMAND, 'scope': {'url': 'https://fixture.invalid/'}}

        with self.assertRaises(RuntimeError) as raised:
            await runner.execute(command)

        self.assertEqual(str(raised.exception), 'hybrid_read_target_snapshot_runtime_error')
        self.assertEqual(safe_runtime_error_code(raised.exception), str(raised.exception))
        self.assertIs(raised.exception.__cause__, cause)
        self.assertIn('bat_read_collection_snapshot', cause.__notes__)
        self.assertNotIn('private', str(raised.exception))
        self.assertEqual(page.get_elements_by_css_selector.await_count, 0)
        self.assertEqual(runner.commands, 1)

    async def test_scope_stages_keep_origin_denial_and_hide_dependency_errors(self):
        for stage, pages, commands in (
                ('pre_scope', [RuntimeError('private pre-scope URL')], 0),
                ('post_scope', [SimpleNamespace(get_url=AsyncMock(return_value='https://fixture.invalid/')),
                                RuntimeError('private post-scope URL')], 1)):
            with self.subTest(stage=stage):
                runner = runner_on_page()
                runner.browser.get_current_page = AsyncMock(side_effect=pages)
                with patch('browser_use_runner.hybrid_main.read_fields', AsyncMock(return_value=[])):
                    with self.assertRaises(RuntimeError) as raised:
                        await runner.execute(READ_COMMAND)
                self.assertEqual(str(raised.exception), f'hybrid_read_{stage}_runtime_error')
                self.assertIs(raised.exception.__cause__, pages[-1])
                self.assertEqual(runner.commands, commands)

        runner = runner_on_page()
        page = await runner.browser.get_current_page()
        page.get_url = AsyncMock(return_value='https://elsewhere.invalid/')
        with self.assertRaisesRegex(ValueError, '^hybrid_origin_denied$'):
            await runner.execute(READ_COMMAND)
        self.assertEqual(runner.commands, 0)

    async def test_document_access_stage_hides_unexpected_error(self):
        runner = runner_on_page()
        runner.observe = AsyncMock(return_value={'url': 'https://fixture.invalid/'})
        cause = RuntimeError('private document details')
        runner.assert_document_access = lambda _url: (_ for _ in ()).throw(cause)
        with patch('browser_use_runner.hybrid_main.read_fields', AsyncMock(return_value=[])) as read:
            with self.assertRaises(RuntimeError) as raised:
                await runner.execute(READ_COMMAND)
        self.assertEqual(str(raised.exception), 'hybrid_read_document_access_runtime_error')
        self.assertIs(raised.exception.__cause__, cause)
        self.assertNotIn('private', str(raised.exception))
        self.assertEqual(read.await_count, 1)


if __name__ == '__main__':
    unittest.main()
