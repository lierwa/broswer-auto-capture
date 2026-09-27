"""Source capture hands one canonical request to a separate offline compiler."""
import json
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from browser_use_runner.hybrid_commands import AnnotateRequest, CompileRequest
from browser_use_runner.hybrid_compile import compile_offline
from workflow_use.hybrid import author
from workflow_use.hybrid.evidence import NormalizedTrace, digest, gap
from workflow_use.hybrid.source_response import author_source_response, canonical_json


OUTPUT_SCHEMA = {'type': 'object', 'properties': {'标签': {'type': 'string'}},
                 'required': ['标签'], 'additionalProperties': False}
INPUT_SCHEMA = {'type': 'number', 'maximum': 1.0}


def source_fixture():
    raw = {'task': 'Read the visible label.', 'input': 1.0, 'inputSchema': INPUT_SCHEMA,
           'outputSchema': OUTPUT_SCHEMA, 'resultSpec': {'contractVersion': 'bat-result-spec/v1',
           'mode': 'data', 'schema': OUTPUT_SCHEMA, 'fields': [
               {'path': ['标签'], 'description': 'Visible label', 'producerRef': 'label-read'}],
           'edgeCases': []}, 'requirementId': 'requirement', 'requirementVersion': 1,
           'requirementText': 'Read the visible label.', 'requirementDigest': 'a' * 64,
           'entryUrls': [], 'planId': 'plan', 'planVersion': 2, 'planDigest': 'b' * 64,
           'stepId': 'read', 'callMode': 'once', 'maxSteps': 3}
    trace_body = {'mediaType': 'application/vnd.bat.browser-use-trace+json;version=2',
                  'source': {'provider': 'browser-use', 'version': 'fixture',
                             'historyRef': 'fixture:history'}, 'completed': False,
                  'actions': [], 'observations': [], 'finalResultRef': None,
                  'redactionManifestRef': {'ref': 'fixture:redaction', 'digest': '0' * 64}}
    trace = NormalizedTrace.model_validate({**trace_body, 'digest': digest(trace_body)})
    request = author.natural_compilation_request(
        author.AuthorInput.model_validate(raw), trace, SimpleNamespace(schemaDigest='registry'))
    return raw, request, trace


async def failed_author(raw, trace, capture_gap):
    class Agent:
        def __init__(self, **_kwargs):
            self.history = SimpleNamespace()

        async def run(self, **_kwargs):
            raise RuntimeError('fixture agent failure')

    callbacks = SimpleNamespace(failed=False, before_action=lambda *_: None,
                                after_step=lambda *_: None, bind=lambda *_: None)
    collector = SimpleNamespace(finish=Mock(return_value=(trace, [capture_gap], None)))
    event_capture = SimpleNamespace(close=AsyncMock())
    dialog = SimpleNamespace(start=lambda: None, settle=lambda: None, close=AsyncMock())
    scope = SimpleNamespace(start=lambda: None, close=lambda: None)
    tools = SimpleNamespace(_bat_field_read_records=None, _bat_summary_records=None,
                            _bat_target_scroll_records=None, _bat_visible_wait_records=None)
    replacements = {'Agent': Agent, 'NativeEventCapture': lambda *_: event_capture,
                    'DialogEventBridge': lambda *_: dialog, 'ActionDispatchAudit': lambda *_: object(),
                    'EvidenceCollector': lambda *_, **__: collector,
                    'AuthorCaptureCallbacks': lambda *_, **__: callbacks,
                    'SourceObservationScope': lambda *_, **__: scope,
                    'bind_tools_act': lambda *_, **__: lambda: None,
                    'author_tools_for_result_spec': lambda *_, **__: tools}
    forbidden = AssertionError('author invoked offline compilation')
    with ExitStack() as stack:
        for name, replacement in replacements.items():
            stack.enter_context(patch.object(author, name, replacement))
        stack.enter_context(patch.object(author.ActionRegistry, 'from_tools',
                                         return_value=SimpleNamespace(schemaDigest='registry')))
        stack.enter_context(patch.object(author, 'compilation_response',
                                         side_effect=forbidden, create=True))
        stack.enter_context(patch('workflow_use.hybrid.compiler.compile_request',
                                  side_effect=forbidden))
        return await author.author_step(object(), raw,
            {'agent': object(), 'extract': object(), 'judge': object(),
             'semantic_annotation': object()}, lambda *_: (object(), lambda value: value))


class AuthorSourceBoundaryTests(unittest.IsolatedAsyncioTestCase):
    def test_canonical_request_preserves_public_aliases_numbers_and_source_gaps(self):
        _raw, request, _trace = source_fixture()
        source_gaps = [gap('invalid_source', [], reason, 'reject_trace') for reason in
                       ('fixture_capture_failed', 'fixture_output_failed',
                        'fixture_review_failed', 'fixture_selection_failed')]
        response = author_source_response({'标签': '甲'}, request, source_gaps)
        payload = request.model_dump(mode='json', by_alias=True)

        self.assertEqual(set(response), {'output', 'canonicalRequest', 'sourceGaps'})
        self.assertEqual(response['canonicalRequest'], canonical_json(payload))
        self.assertEqual(json.loads(response['canonicalRequest']), payload)
        self.assertIn('"maximum":1.0', response['canonicalRequest'])
        self.assertIn('"标签"', response['canonicalRequest'])
        self.assertIn('"schema":', response['canonicalRequest'])
        self.assertNotIn('schemaValue', response['canonicalRequest'])
        self.assertEqual(response['sourceGaps'],
                         [item.model_dump(mode='json', by_alias=True) for item in source_gaps])

    async def test_failed_author_returns_source_only_without_invoking_compiler(self):
        raw, _request, trace = source_fixture()
        capture_gap = gap('missing_observation', [], 'fixture_capture_gap')
        result = await failed_author(raw, trace, capture_gap)

        self.assertEqual(set(result), {'output', 'canonicalRequest', 'sourceGaps'})
        self.assertIsNone(result['output'])
        self.assertEqual(json.loads(result['canonicalRequest'])['trace']['source']['historyRef'],
                         'fixture:history')
        self.assertEqual([item['reason'] for item in result['sourceGaps']],
                         ['fixture_capture_gap', 'native_agent_run_failed'])

    async def test_offline_compile_consumes_source_gaps_and_old_envelope_defaults_empty(self):
        _raw, request, _trace = source_fixture()
        source_gap = gap('missing_observation', [], 'fixture_capture_gap')
        envelope = CompileRequest.model_validate({'id': uuid4(), 'type': 'hybrid_compile',
            'request': request.model_dump(mode='json', by_alias=True), 'outputSchema': OUTPUT_SCHEMA,
            'sourceGaps': [source_gap.model_dump(mode='json', by_alias=True)]})
        old = CompileRequest.model_validate({'id': uuid4(), 'type': 'hybrid_compile',
            'request': request.model_dump(mode='json', by_alias=True), 'outputSchema': OUTPUT_SCHEMA})
        self.assertEqual(old.sourceGaps, [])
        registry = SimpleNamespace(schemaDigest='registry')
        with patch('browser_use_runner.hybrid_compile.output_model_for', return_value=(object(), None)), \
             patch('browser_use_runner.hybrid_compile.author_tools_for_result_spec', return_value=object()), \
             patch('browser_use_runner.hybrid_compile.ActionRegistry.from_tools', return_value=registry), \
             patch('browser_use_runner.hybrid_compile.compilation_response', return_value={}) as compile_call:
            await compile_offline(envelope)
            self.assertEqual(compile_call.call_args.args[3], [source_gap])
            await compile_offline(old)
            self.assertEqual(compile_call.call_args.args[3], [])

    async def test_offline_annotation_extends_instead_of_replacing_source_gaps(self):
        _raw, request, trace = source_fixture()
        source_gap = gap('missing_observation', [], 'fixture_capture_gap')
        annotation_gap = gap('missing_binding', [], 'fixture_annotation_gap')
        envelope = AnnotateRequest.model_validate({'id': uuid4(), 'type': 'hybrid_annotate',
            'request': request.model_dump(mode='json', by_alias=True), 'outputSchema': OUTPUT_SCHEMA,
            'sourceGaps': [source_gap.model_dump(mode='json', by_alias=True)],
            'model': {'model': 'fixture', 'endpoint': 'http://127.0.0.1:1234', 'token': 'fixture'}})
        registry = SimpleNamespace(schemaDigest='registry')
        with patch('browser_use_runner.hybrid_compile.output_model_for', return_value=(object(), None)), \
             patch('browser_use_runner.hybrid_compile.author_tools_for_result_spec', return_value=object()), \
             patch('browser_use_runner.hybrid_compile.ActionRegistry.from_tools', return_value=registry), \
             patch('browser_use_runner.hybrid_compile.AIConnectModel', return_value=object()), \
             patch('browser_use_runner.hybrid_compile.annotate_selections',
                   AsyncMock(return_value=(trace, [annotation_gap]))), \
             patch('browser_use_runner.hybrid_compile.compilation_response', return_value={}) as compile_call:
            await compile_offline(envelope)
        self.assertEqual(compile_call.call_args.args[3], [source_gap, annotation_gap])


if __name__ == '__main__':
    unittest.main()
