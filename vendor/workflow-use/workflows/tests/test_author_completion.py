"""Protect explicit completion declarations across Browser-Use public registration."""
import json
import unittest
from types import SimpleNamespace
from tempfile import TemporaryDirectory

from browser_use import Agent
from browser_use_runner.ai_connect import AIConnectModel

from pydantic import ValidationError

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import _business_result, author_tools_for_result_spec
from workflow_use.hybrid.author_tools import AuthorTools
from workflow_use.hybrid.evidence import EvidenceRef, NormalizedObservation, TraceSource, digest
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.registry import ActionRegistry


class AuthorCompletionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.output_model, self.unwrap = output_model_for({'type': 'null'}, 'CompletionOutput')
        self.tools = AuthorTools(output_model=self.output_model)

    def test_initial_and_agent_public_reregistration_have_identical_schema(self):
        initial = ActionRegistry.from_tools(self.tools)
        # Agent.__init__ uses this public hook before creating its action models.
        self.tools.use_structured_output_action(self.output_model)
        rebuilt = ActionRegistry.from_tools(self.tools)
        self.assertEqual(initial.schemaDigest, rebuilt.schemaDigest)
        self.assertIsNone(self.tools.get_output_model())

    def test_native_agent_does_not_ask_model_to_copy_host_owned_output(self):
        # WHY：真实 Agent 构造会自动注入工具输出 schema；读取回执协议不能同时要求抄写业务值。
        model, _ = output_model_for({'type': 'object', 'properties': {'content': {'type': 'string'}},
                                    'required': ['content'], 'additionalProperties': False}, 'CapturedOutput')
        tools = AuthorTools(output_model=model)
        with TemporaryDirectory() as directory:
            agent = Agent(task='Capture the requested region.', tools=tools,
                llm=AIConnectModel(model='fixture', endpoint='http://127.0.0.1:1', token='fixture', purpose='agent'),
                file_system_path=directory, enable_signal_handler=False, use_vision=True, use_judge=False)
            self.assertEqual(agent.task, 'Capture the requested region.')
            self.assertIsNone(agent.output_model_schema)
            properties = tools.registry.registry.actions['done'].param_model.model_json_schema()['properties']
        self.assertEqual(set(properties), {'success', 'reason'})

    def test_native_done_root_json_values_are_plain_json_values(self):
        class History:
            def __init__(self, value): self.value = value
            def is_done(self): return True
            def is_successful(self): return True
            def get_structured_output(self, model):
                return model.model_validate_json(json.dumps({'value': self.value}, ensure_ascii=False))

        cases = [
            ({'type': 'array', 'items': {'type': 'object', 'properties': {
                'title': {'type': 'string'}, 'url': {'type': 'string'}},
                'required': ['title', 'url'], 'additionalProperties': False}},
             [{'title': 'First', 'url': 'https://example.test/1'}]),
            ({'type': 'array', 'items': {'type': 'string'}}, ['First', 'Second']),
            ({'type': 'string'}, 'Ready'),
            ({'type': 'null'}, None),
        ]
        for schema, expected in cases:
            with self.subTest(schema=schema):
                model, unwrap = output_model_for(schema, 'RootOutput')
                completed, output, gaps = _business_result(
                    History(expected), False, model, unwrap, schema)
                self.assertTrue(completed)
                self.assertEqual(gaps, [])
                self.assertEqual(output, expected)

    def test_success_and_reason_are_required_and_visible_to_the_model(self):
        model = self.tools.registry.registry.actions['done'].param_model
        schema = model.model_json_schema()
        self.assertEqual(set(schema['required']), {'success', 'reason'})
        self.assertNotIn('readRefs', schema['properties'])
        self.assertEqual(model.model_validate({'success': True, 'reason': 'Observed.'}).readRefs, [])
        self.assertEqual(schema['properties']['success']['type'], 'boolean')
        self.assertNotIn('default', schema['properties']['success'])
        self.assertNotIn('data', schema['properties'])
        for invalid in ({'reason': 'blocked', 'readRefs': []},
                        {'success': False, 'readRefs': []},
                        {'success': 'false', 'reason': 'blocked', 'readRefs': []},
                        {'success': True, 'reason': 'Observed.', 'readRefs': [], 'data': {'value': None}}):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                model.model_validate(invalid)

    async def test_explicit_failure_preserves_reason_without_business_data(self):
        result = await self.tools.registry.execute_action(
            'done', {'success': False, 'reason': 'The target changed before selection.', 'readRefs': []},
            browser_session=SimpleNamespace(downloaded_files=['existing-download.pdf'], cdp_client=None),
            file_system=SimpleNamespace())
        self.assertTrue(result.is_done)
        self.assertIs(result.success, False)
        self.assertEqual(result.extracted_content, 'The target changed before selection.')
        self.assertIsNone(result.attachments)
        self.assertEqual(result.metadata['batCompletion'], {
            'success': False, 'reason': 'The target changed before selection.'})

    async def test_business_data_keeps_its_original_null_contract(self):
        model = self.tools.registry.registry.actions['done'].param_model
        with self.assertRaises(ValidationError):
            model.model_validate({'success': True, 'reason': 'Observed.', 'readRefs': [],
                                  'data': {'value': 'not-null'}})
        result = await self.tools.registry.execute_action(
            'done', {'success': True, 'reason': 'Observed.', 'readRefs': []},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        business_output = self.output_model.model_validate_json(result.extracted_content)
        self.assertIsNone(self.unwrap(business_output))
        self.assertIs(result.success, True)

    async def test_invalid_read_reference_cannot_end_source(self):
        result = await self.tools.registry.execute_action(
            'done', {'success': True, 'reason': 'Observed.', 'readRefs': ['r999']},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        self.assertEqual(result.error, 'completion_read_reference_invalid')
        self.assertFalse(result.is_done)
        self.assertIsNot(result.success, True)
        self.assertIsNone(result.extracted_content)

    def test_interim_done_and_final_done_keep_distinct_trace_positions(self):
        reference = EvidenceRef(ref='fixture:done', digest='1' * 64)
        registry = ActionRegistry.from_tools(self.tools)
        observations = [NormalizedObservation(id=f'o-{index:04d}', sequence=index - 1,
            url='https://example.test/', tabId='tab-1', facts=[], sourceRefs=[reference])
            for index in range(1, 5)]
        def record(step, pre, post):
            return HistoryRecord(stepIndex=step, actions=[{'done': {
                'success': True, 'reason': 'Observed.'}}],
                results=[ResultEvidence(errorPresent=False, is_done=True, success=True, ref=reference)],
                preObservationRef=pre, postObservationRefs={'0': post})
        trace, gaps = normalize_history(HistoryInput(
            source=TraceSource(version=registry.providerVersion, historyRef='fixture:history'),
            completed=True, records=[record(0, 'o-0001', 'o-0002'), record(1, 'o-0003', 'o-0004')],
            observations=observations, finalResultRef=reference, redactionManifestRef=reference), registry)

        self.assertEqual(gaps, [])
        self.assertEqual([(item.id, item.name) for item in trace.actions],
                         [('a-0001', 'done'), ('a-0002', 'done')])
        self.assertTrue(trace.completed)


if __name__ == '__main__':
    unittest.main()
