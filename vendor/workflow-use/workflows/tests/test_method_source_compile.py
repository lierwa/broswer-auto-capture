"""The complete natural compiler consumes read methods without freezing representative samples."""
import copy
import unittest

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import AuthorInput, author_tools_for_result_spec, natural_compilation_request
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.natural_prefix import compile_natural_prefix
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
    def test_two_native_waits_do_not_imply_an_undeclared_business_loop(self):
        request, registry, schema, _read = method_source()
        original = request.trace
        observations = list(original.observations[:2])
        records = [HistoryRecord(stepIndex=0, actions=[{'bat_read_fields': original.actions[0].args}],
            results=[ResultEvidence(errorPresent=False, ref=original.actions[0].resultRef)],
            preObservationRef='o-0001', postObservationRefs={'0': 'o-0002'})]
        for step in (1, 2):
            action_ref = f'a-{step + 1:04d}'
            for side in range(2):
                sequence = len(observations)
                facts = [fact('url_digest', original.observations[0].facts[0].value)]
                if side == 0:
                    facts.append(fact('natural_binding', {'actionRef': action_ref, 'argumentPath': 'seconds',
                        'binding': {'source': 'constant', 'value': 3}, 'provenance': 'native_parameter'}))
                observations.append(NormalizedObservation(id=f'o-{sequence + 1:04d}', sequence=sequence,
                    url=original.observations[0].url, tabId='tab-1', facts=facts, sourceRefs=[reference(sequence)]))
            records.append(HistoryRecord(stepIndex=step, actions=[{'wait': {'seconds': 3}}],
                results=[ResultEvidence(errorPresent=False, ref=reference(action_ref))],
                preObservationRef=observations[-2].id, postObservationRefs={'0': observations[-1].id}))
        for item in original.observations[2:]:
            observations.append(item.model_copy(update={'id': f'o-{len(observations) + 1:04d}',
                                                        'sequence': len(observations)}))
        records.append(HistoryRecord(stepIndex=3, actions=[{'done': original.actions[-1].args}],
            results=[ResultEvidence(errorPresent=False, is_done=True, success=True, ref=original.finalResultRef)],
            preObservationRef=observations[-2].id, postObservationRefs={'0': observations[-1].id}))
        trace, gaps = normalize_history(HistoryInput(source=original.source, completed=True,
            records=records, observations=observations, finalResultRef=original.finalResultRef,
            redactionManifestRef=original.redactionManifestRef), registry)
        self.assertEqual(gaps, [])
        result = compile_request(request.model_copy(update={'trace': trace}), registry, output_schema=schema)
        self.assertEqual(result.gaps, [])
        self.assertEqual(len([item for item in result.segments if item.get('operation', {}).get('actionName') == 'wait']), 2)
        self.assertEqual(result.repeatMethods, [])

    def test_prefix_preserves_unconsumed_method_without_faking_completed_source(self):
        request, registry, schema, verified = method_source()
        body = request.trace.model_dump(mode='json', exclude={'digest'})
        body.update(completed=False, finalResultRef=None,
                    actions=body['actions'][:1], observations=body['observations'][:2])
        request.trace = type(request.trace).model_validate({**body, 'digest': digest(body)})
        original = request.model_dump(mode='json')
        first = compile_natural_prefix(request, registry, output_schema=schema)
        second = compile_natural_prefix(request, registry, output_schema=schema)
        self.assertEqual(first, second)
        self.assertEqual(request.model_dump(mode='json'), original)
        self.assertEqual(first.gaps, [])
        self.assertEqual(first.dependencies, [])
        self.assertEqual(first.controlGraph, {'entry': '', 'edges': [], 'terminals': []})
        self.assertEqual(first.segments[0]['operation']['specification'],
                         verified.specification.model_dump(mode='json'))
        final = compile_request(request, registry, output_schema=schema)
        self.assertIn('completed_business_result_required', [item['reason'] for item in final.gaps])

    def test_prefix_does_not_change_final_compilation(self):
        request, registry, schema, _verified = method_source()
        before = compile_request(request, registry, output_schema=schema)
        prefix = compile_natural_prefix(request, registry, output_schema=schema)
        after = compile_request(request, registry, output_schema=schema)
        self.assertEqual(before, after)
        self.assertEqual(prefix.segments, after.segments)
        self.assertIsNone(prefix.resultBinding)
        self.assertIsNotNone(after.resultBinding)

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
