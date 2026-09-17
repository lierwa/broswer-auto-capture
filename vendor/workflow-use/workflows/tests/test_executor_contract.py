"""Fork regressions at the actual execute_step entrypoint; no Browser or model is started."""
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, call, patch

from browser_use.agent.views import ActionResult
from workflow_use.schema.views import ClickStep, ExtractStep, WorkflowDefinitionSchema
from workflow_use.workflow import semantic_executor
from workflow_use.workflow.semantic_executor import SemanticWorkflowExecutor


class ExecutorContractTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        expected = Path(__file__).resolve().parents[1] / 'workflow_use/workflow/semantic_executor.py'
        self.assertEqual(Path(semantic_executor.__file__).resolve(), expected)
        self.page = SimpleNamespace(evaluate=AsyncMock(side_effect=AssertionError('unexpected_page_action')))
        self.browser = SimpleNamespace(get_current_page=AsyncMock(return_value=self.page))
        self.executor = SemanticWorkflowExecutor(self.browser)
        self.executor._refresh_semantic_mapping = AsyncMock()

    async def test_schema_extraction_variants_reuse_handler_without_losing_goal_or_metadata(self):
        for kind, goal_key in [('extract_page_content', 'goal'), ('extract', 'extractionGoal')]:
            with self.subTest(kind=kind):
                definition = WorkflowDefinitionSchema.model_validate({
                    'name': 'fixture', 'description': 'fixture', 'version': '1.0',
                    'steps': [{'type': kind, goal_key: 'Return the requested field', 'output': 'result',
                               'description': 'bounded read', 'wait_time': 0.25,
                               'verification_checks': [{'name': 'output_present'}]}],
                    'input_schema': [],
                })
                step = definition.steps[0]
                expected = ActionResult(extracted_content='fixture extraction')
                self.executor.execute_extract_step = AsyncMock(return_value=expected)
                self.assertIs(await self.executor.execute_step(step), expected)
                delegated = self.executor.execute_extract_step.await_args.args[0]
                self.assertIsInstance(delegated, ExtractStep)
                self.assertEqual(delegated.extractionGoal, 'Return the requested field')
                self.assertEqual(delegated.output, 'result')
                self.assertEqual(delegated.wait_time, 0.25)
                self.assertEqual(delegated.verification_checks, [{'name': 'output_present'}])
                self.assertEqual(step.type, kind)

    def test_explicit_missing_or_invalid_position_never_defaults_to_first(self):
        for position in ['2', '0', '-1', 'second', '999', '²']:
            with self.subTest(position=position):
                self.assertIsNone(self.executor._select_element_by_position([('item', {'id': 'first'}, 1)], position, None))

    def test_valid_positions_preserve_existing_priority_order(self):
        items = [('first', {'id': 'first'}, 1), ('second', {'id': 'second'}, 1), ('other', {'id': 'other'}, 2)]
        for position, expected in [(None, 'first'), ('first', 'first'), ('1', 'first'), ('2', 'second'), ('last', 'second')]:
            with self.subTest(position=position):
                self.assertEqual(self.executor._select_element_by_position(list(items), position, None)['id'], expected)
        self.assertIsNone(self.executor._select_element_by_position(list(items), '3', None))

    async def test_missing_position_fails_before_any_selector_or_click_fallback(self):
        self.executor.current_mapping = {'AB123': {'element_type': 'a', 'selectors': '#first'}}
        self.executor._try_direct_selector = AsyncMock(return_value='#first')
        self.executor._wait_for_element = AsyncMock(side_effect=AssertionError('unexpected_wait'))
        self.executor._click_element_intelligently = AsyncMock(side_effect=AssertionError('unexpected_click'))
        step = ClickStep(type='click', target_text='AB123', position_hint='2', cssSelector='#first',
                         selectorStrategies=[{'type': 'xpath', 'value': '//*', 'priority': 1}])
        with patch('workflow_use.workflow.element_finder.ElementFinder.find_element_with_strategies',
                   new_callable=AsyncMock) as finder:
            finder.side_effect = AssertionError('unexpected_selector_strategy')
            result = await self.executor.execute_step(step)
            self.assertEqual(result.error, 'target_position_unavailable')
            finder.assert_not_awaited()
        self.executor._try_direct_selector.assert_not_awaited()
        self.executor._wait_for_element.assert_not_awaited()
        self.executor._click_element_intelligently.assert_not_awaited()
        self.page.evaluate.assert_not_awaited()

    async def test_positional_selector_must_resolve_to_one_element_at_click_time(self):
        self.executor.current_mapping = {'AB123': {'element_type': 'a', 'selectors': '#selected'}}
        self.executor._wait_for_element = AsyncMock(return_value=(True, '#selected'))
        element = SimpleNamespace(click=AsyncMock())

        async def execute_once(execute, step, verify):
            return await execute()

        self.executor._execute_with_verification_and_retry = execute_once
        for elements in [[], [element, element]]:
            with self.subTest(count=len(elements)):
                self.executor._get_elements_by_selector = AsyncMock(return_value=elements)
                with self.assertRaisesRegex(ValueError, 'target_position_unavailable'):
                    await self.executor.execute_step(ClickStep(type='click', target_text='entry', position_hint='1'))
        element.click.assert_not_awaited()

    async def test_valid_position_uses_selected_element_instead_of_direct_or_explicit_selector(self):
        self.executor.current_mapping = {
            'AB123': {'element_type': 'a', 'selectors': '#first'},
            'AB456': {'element_type': 'a', 'selectors': '#second'},
        }
        self.executor._try_direct_selector = AsyncMock(return_value='#first')
        self.executor._click_element_intelligently = AsyncMock(side_effect=AssertionError('unexpected_fuzzy_click'))
        selected_element = SimpleNamespace(click=AsyncMock())

        async def select(selector):
            self.assertEqual(selector, '#second')
            return [selected_element]

        self.page.get_elements_by_css_selector = AsyncMock(side_effect=select)
        self.executor._verify_click_action = AsyncMock(return_value=True)

        async def execute_and_verify(execute, step, verify):
            result = await execute()
            self.assertTrue(await verify())
            return result

        self.executor._execute_with_verification_and_retry = execute_and_verify
        step = ClickStep(type='click', target_text='entry', position_hint='2', cssSelector='#first',
                         selectorStrategies=[{'type': 'xpath', 'value': '//*', 'priority': 1}])
        with patch('workflow_use.workflow.element_finder.ElementFinder.find_element_with_strategies',
                   new_callable=AsyncMock) as finder:
            finder.side_effect = AssertionError('unexpected_selector_strategy')
            result = await self.executor.execute_step(step)
            self.assertIsNone(result.error)
            finder.assert_not_awaited()
        self.executor._try_direct_selector.assert_not_awaited()
        self.executor._click_element_intelligently.assert_not_awaited()
        self.assertEqual(self.page.get_elements_by_css_selector.await_args_list, [call('#second'), call('#second')])
        selected_element.click.assert_awaited_once()
        self.page.evaluate.assert_not_awaited()

    async def test_no_position_preserves_upstream_direct_selector_and_click_strategy(self):
        self.executor._try_direct_selector = AsyncMock(return_value='#existing')
        self.executor._wait_for_element = AsyncMock(return_value=(True, '#existing'))
        self.executor._click_element_intelligently = AsyncMock(return_value=True)

        async def execute_once(execute, step, verify):
            return await execute()

        self.executor._execute_with_verification_and_retry = execute_once
        result = await self.executor.execute_step(ClickStep(type='click', target_text='existing'))
        self.assertIsNone(result.error)
        self.executor._try_direct_selector.assert_awaited_once_with('existing')
        self.executor._click_element_intelligently.assert_awaited_once_with('#existing', 'existing', None)


if __name__ == '__main__':
    unittest.main()
