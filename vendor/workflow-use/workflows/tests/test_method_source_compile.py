"""The complete natural compiler consumes read methods without freezing representative samples."""
import copy
import unittest

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import AuthorInput, author_tools_for_result_spec, natural_compilation_request
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.evidence import EvidenceRef, NormalizedObservation, ObservationFact, TraceSource, digest
from workflow_use.hybrid.method_completion import complete_from_read_refs
from workflow_use.hybrid.method_read_evidence import verified_method_read
from workflow_use.hybrid.natural_output import build_verified_output_assembly
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.registry import ActionRegistry
from test_author_source_boundary import source_fixture
from test_method_read_evidence import SCHEMA, fixture


def reference(value):
    checksum = digest(value)
    return EvidenceRef(ref='fixture:' + checksum, digest=checksum)


def fact(kind, value):
    return ObservationFact(id=kind + '-' + digest(value), kind=kind,
                           value=value, sourceRefs=[reference(value)])


def method_source(case=None, schema=None):
    schema = schema if schema is not None else {'type': 'array', 'items': copy.deepcopy(SCHEMA['items'])}
    case = case if case is not None else fixture()
    case['records'].output_schema = copy.deepcopy(schema)
    output = complete_from_read_refs(case['records'], ['r1'], schema, None)
    verified = verified_method_read(**case)
    raw, _request, _trace = source_fixture()
    raw.update(task='Read the current page records.', input=None, inputSchema={'type': 'null'},
        outputSchema=schema, requirementText='Read the current page records.',
        resultSpec={'contractVersion': 'bat-result-spec/v1', 'mode': 'data', 'schema': schema,
                    'fields': [{'path': [], 'description': 'Visible records', 'producerRef': 'records'}],
                    'edgeCases': []})
    author_input = AuthorInput.model_validate(raw)
    model, _unwrap = output_model_for(schema, 'MethodCompileOutput')
    tools = author_tools_for_result_spec(model, author_input.resultSpec)
    registry = ActionRegistry.from_tools(tools)
    url = case['records'].records[0].sample.pageIdentity['url']
    observations = [NormalizedObservation(id=f'o-{index:04d}', sequence=index - 1,
        url=url, tabId=verified.targetId, sourceRefs=[reference(index)],
        facts=[fact('url_digest', verified.urlDigest)]) for index in range(1, 5)]
    observations[1].facts.append(fact('verified_natural_read', verified.model_dump(mode='json')))
    assembly, issues = build_verified_output_assembly(observations, output, schema,
        lambda _kind, value: reference(value), selected_read_refs=['r1'])
    if issues:
        raise AssertionError(issues)
    observations[3].facts.append(assembly)
    records = [HistoryRecord(stepIndex=0, actions=[{'bat_read_fields': case['arguments']}],
        results=[ResultEvidence(errorPresent=False, ref=case['result_ref'])],
        preObservationRef='o-0001', postObservationRefs={'0': 'o-0002'}),
        HistoryRecord(stepIndex=1, actions=[{'done': {'success': True, 'reason': 'Observed method.',
                                                    'readRefs': ['r1']}}],
        results=[ResultEvidence(errorPresent=False, is_done=True, success=True, ref=reference(output))],
        preObservationRef='o-0003', postObservationRefs={'0': 'o-0004'})]
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version=registry.providerVersion,
        historyRef='fixture:method-source'), completed=True, records=records, observations=observations,
        finalResultRef=reference(output), redactionManifestRef=reference('redaction')), registry)
    if issues:
        raise AssertionError(issues)
    return natural_compilation_request(author_input, trace, registry), registry, schema, verified


class MethodSourceCompileTests(unittest.TestCase):
    def test_single_method_source_compiles_without_gaps_and_preserves_runtime_budget(self):
        request, registry, schema, verified = method_source()
        compiled = compile_request(request, registry, output_schema=schema)

        self.assertEqual(compiled.gaps, [])
        self.assertEqual(len(compiled.segments), 1)
        segment = compiled.segments[0]
        self.assertEqual(segment['operation']['name'], 'browser.read-fields')
        self.assertEqual(segment['operation']['specification'], verified.specification.model_dump(mode='json'))
        self.assertEqual(segment['operation']['specification']['maxItems'], 300)
        self.assertEqual(segment['operation']['specification']['outputSchema']['maxItems'], 300)
        self.assertEqual(len(verified.output), 3)
        self.assertEqual(verified.coverage.total, 100)
        self.assertEqual(compiled.controlGraph['entry'], segment['id'])
        self.assertIn({'from': segment['id'], 'outcome': 'success', 'to': 'completed'},
                      compiled.controlGraph['edges'])
        self.assertEqual(compiled.outputAssembly['fields'][0]['binding']['nodeId'], verified.actionRef)
        self.assertEqual(compiled.resultBinding['assignments'][0]['producerRef'], 'records')
        self.assertEqual([row.disposition for row in compiled.coverage], ['compiled', 'agent_internal'])

    def test_mismatched_method_fact_blocks_full_compilation(self):
        request, registry, schema, _verified = method_source()
        fact_value = request.trace.observations[1].facts[-1].value
        fact_value['specification']['maxItems'] = 3
        compiled = compile_request(request, registry, output_schema=schema)

        self.assertIn('verified_natural_read_invalid', [gap['reason'] for gap in compiled.gaps])
        self.assertEqual(compiled.controlGraph['entry'], '')
        self.assertFalse(any(segment.get('operation', {}).get('name') == 'browser.read-fields'
                             for segment in compiled.segments))


if __name__ == '__main__':
    unittest.main()
