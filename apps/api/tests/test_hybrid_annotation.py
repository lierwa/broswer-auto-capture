"""Offline annotation RPC preserves canonical sources and rejects browser ownership."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from browser_use_runner.hybrid_commands import AnnotateRequest, REQUEST
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import author_tools_for_result_spec
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.registry import ActionRegistry
from tests.test_selection_annotation import annotation_dependencies, trace_with_clicks


def annotation_request():
    output_schema, input_schema = {'type': 'null'}, {'type': 'null'}
    model, _ = output_model_for(output_schema, 'HybridAgentOutput')
    result_spec = {'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'}
    registry = ActionRegistry.from_tools(author_tools_for_result_spec(model, SimpleNamespace(mode='execution')))
    requirement = {'id': 'requirement', 'version': 1, 'text': 'Choose the eligible item.',
        'taskText': 'Choose it.', 'sourceDigest': '2' * 64}
    requirement['digest'] = digest(requirement)
    plan = {'id': 'plan', 'version': 1, 'sourceDigest': '3' * 64, 'stepId': 'choose',
        'inputSchemaDigest': digest(input_schema), 'outputSchemaDigest': digest(output_schema),
        'callMode': 'once', 'entryUrls': ['https://fixture.invalid/'], 'resultSpec': result_spec}
    plan['digest'] = digest(plan)
    return {'id': str(uuid4()), 'type': 'hybrid_annotate', 'request': {
        'compilerVersion': 'bat-hybrid/2', 'actionRegistryVersion': registry.schemaDigest,
        'requirement': requirement, 'plan': plan, 'runtimeInputSchema': input_schema,
        'trace': trace_with_clicks(count=1, existing=True).model_dump(mode='json')},
        'outputSchema': output_schema, 'verifiedChildren': [],
        'model': {'model': 'fixture', 'endpoint': 'http://127.0.0.1:1234', 'token': 'fixture'}}


class OfflineAnnotationTests(unittest.IsolatedAsyncioTestCase):
    async def test_annotate_rejects_live_browser_owner_before_any_model_or_compile_work(self):
        raw = annotation_request()
        self.assertIsInstance(REQUEST.validate_json(json.dumps(raw)), AnnotateRequest)
        runner = Runner()
        runner.browser = object()
        with patch('browser_use_runner.hybrid_main.assert_runtime'), \
                patch('browser_use_runner.hybrid_main.compile_offline', AsyncMock()) as compile_call:
            with self.assertRaisesRegex(ValueError, 'hybrid_annotate_requires_offline_owner'):
                await runner.handle(raw)
        compile_call.assert_not_awaited()

    async def test_offline_envelope_keeps_existing_trace_and_python_canonical_numbers(self):
        raw = annotation_request()
        original = copy.deepcopy(raw)
        model = SimpleNamespace(ainvoke=AsyncMock())
        with patch('browser_use_runner.hybrid_main.assert_runtime'), \
                patch('browser_use_runner.hybrid_compile.AIConnectModel', return_value=model) as model_factory:
            result = await Runner().handle(raw)
        self.assertEqual(raw, original)
        self.assertEqual(set(result), {'request', 'response'})
        self.assertEqual(result['request']['trace'], original['request']['trace'])
        model.ainvoke.assert_not_awaited()
        self.assertEqual(model_factory.call_args.kwargs['purpose'], 'semantic_annotation')
        trace_payload = result['response']['sourcePayloads'][2]
        self.assertIn('"number":1.0', trace_payload)
        self.assertEqual(digest(json.loads(trace_payload)), result['request']['trace']['digest'])
        self.assertIn('canonicalPayload', result['response'])

    async def test_annotation_failure_remains_a_gap_in_the_compilation_envelope(self):
        raw = annotation_request()
        raw['request']['trace'] = trace_with_clicks(count=1).model_dump(mode='json')
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion={})))
        target, read = annotation_dependencies()
        with patch('browser_use_runner.hybrid_main.assert_runtime'), \
                patch('browser_use_runner.hybrid_compile.AIConnectModel', return_value=model), target, read:
            result = await Runner().handle(raw)
        self.assertEqual(model.ainvoke.await_count, 1)
        gaps = result['response']['compilation']['gaps']
        self.assertTrue(any(item['reason'] == 'selection_annotation_unavailable'
                            and item['actionRefs'] == ['a-0001'] for item in gaps))
        self.assertEqual(result['request']['trace'], raw['request']['trace'])


if __name__ == '__main__':
    unittest.main()
