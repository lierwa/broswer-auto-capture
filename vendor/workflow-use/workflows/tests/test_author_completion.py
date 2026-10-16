"""Native done ends the Agent; host output never changes that completion."""
import unittest
from types import SimpleNamespace
from tempfile import TemporaryDirectory

from browser_use import Agent, Tools
from browser_use_runner.ai_connect import AIConnectModel
from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import _business_result
from workflow_use.hybrid.author_tools import AuthorTools
from workflow_use.hybrid.registry import ActionRegistry
from test_method_read_evidence import fixture, SCHEMA


def history(success=True, done=True):
    return SimpleNamespace(is_done=lambda: done, is_successful=lambda: success)


class AuthorCompletionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.model, self.unwrap = output_model_for({'type': 'null'}, 'CompletionOutput')
        self.tools = AuthorTools()

    def test_done_uses_exact_native_schema_without_host_technical_fields(self):
        native = Tools(output_model=None)
        self.assertEqual(self.tools.registry.registry.actions['done'].param_model.model_json_schema(),
                         native.registry.registry.actions['done'].param_model.model_json_schema())
        self.assertIsNone(self.tools.get_output_model())
        params = self.tools.registry.registry.actions['done'].param_model.model_validate({'text': 'Finished.'})
        self.assertTrue(params.success)
        self.assertEqual(params.files_to_display, [])
        self.assertNotIn('readRefs', params.model_dump())
        self.assertNotIn('methodOutcome', params.model_dump())

    def test_real_agent_does_not_request_a_business_output_model(self):
        with TemporaryDirectory(prefix='bat-author-schema-') as directory:
            agent = Agent(task='Read the confirmed report.', tools=self.tools,
                llm=AIConnectModel(model='fixture', endpoint='http://127.0.0.1:1', token='fixture', purpose='agent'),
                file_system_path=directory, enable_signal_handler=False, use_vision=True, use_judge=False)
            self.assertEqual(agent.task, 'Read the confirmed report.')
            self.assertIsNone(agent.output_model_schema)
            self.assertIsNone(self.tools.get_output_model())
            self.assertIn('text', self.tools.registry.registry.actions['done'].param_model.model_json_schema()['required'])

    async def test_native_failure_retains_text_and_ends_without_business_output(self):
        result = await self.tools.registry.execute_action('done',
            {'success': False, 'text': 'The observed target was unavailable.'},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        self.assertTrue(result.is_done)
        self.assertIs(result.success, False)
        self.assertEqual(result.extracted_content, 'The observed target was unavailable.')
        completed, output, gaps = _business_result(history(False), False, {'type': 'null'})
        self.assertFalse(completed)
        self.assertIsNone(output)
        self.assertEqual(gaps, [])

    async def test_host_missing_or_conflicting_output_does_not_reopen_native_done(self):
        result = await self.tools.registry.execute_action('done', {'success': True, 'text': 'Report read.'},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        self.assertTrue(result.is_done)
        case = fixture()
        second = case['records'].records[0].model_copy(deep=True); second.readRef = 'r2'
        case['records'].records.append(second)
        model, unwrap = output_model_for(SCHEMA, 'ReportOutput')
        completed, output, gaps = _business_result(history(), False, SCHEMA, case['records'])
        self.assertTrue(completed)
        self.assertIsNone(output)
        self.assertEqual([g.reason for g in gaps], ['completion_read_path_conflict'])
        completed, output, gaps = _business_result(history(), False, SCHEMA)
        self.assertTrue(completed)
        self.assertIsNone(output)
        self.assertTrue(gaps)
        self.assertTrue(result.is_done)

    def test_host_uses_real_read_receipts_and_execution_null(self):
        case = fixture(); model, unwrap = output_model_for(SCHEMA, 'ReportOutput')
        completed, output, gaps = _business_result(history(), False, SCHEMA, case['records'])
        self.assertTrue(completed)
        self.assertEqual(gaps, [])
        self.assertEqual(output, case['records'].records[0].sample.output)
        self.assertEqual(case['records'].selected_refs, ('r1',))
        self.assertEqual(_business_result(history(), False, {'type': 'null'}), (True, None, []))

    def test_native_run_failure_retains_its_own_failure_layer(self):
        completed, output, gaps = _business_result(history(), True, {'type': 'null'})
        self.assertFalse(completed)
        self.assertIsNone(output)
        self.assertEqual([g.reason for g in gaps], ['native_agent_run_failed'])


if __name__ == '__main__':
    unittest.main()
