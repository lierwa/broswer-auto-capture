"""Compile observed read/query/navigation samples through the production repeat pipeline."""
import copy
import json
import unittest
from types import SimpleNamespace

from browser_use.agent.views import ActionResult

from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.dom_evidence import capture_find_elements_query, complete_find_elements_query
from workflow_use.hybrid.evidence import NormalizedObservation, TraceSource, digest
from workflow_use.hybrid.method_completion import complete_from_read_refs
from workflow_use.hybrid.method_read_evidence import verified_method_read
from workflow_use.hybrid.method_read_tool import (
    MethodReadRecord, MethodReadRecords, MethodReadToolParams, expand_method_read_params, method_read_model_result,
)
from workflow_use.hybrid.natural_output import build_verified_output_assembly
from workflow_use.hybrid.natural_reads import VerifiedNaturalRead, find_elements_read_spec
from workflow_use.hybrid.natural_repeat import validate_repeat_coverage
from workflow_use.hybrid.natural_repeat_evidence import validate_repeat_method
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.read_sampling import ReadSample
from test_method_source_compile import fact, method_source, reference


PAGE1, PAGE2, PAGE9 = ('https://example.test/list/' + str(index) for index in (1, 2, 9))
SCHEMA = {'type': 'array', 'items': {'type': 'object', 'properties': {
    'title': {'type': 'string'}, 'url': {'type': 'string'}},
    'required': ['title', 'url'], 'additionalProperties': False}}
QUERY_ARGS = {'selector': 'a.next', 'max_results': 1, 'include_text': True, 'attributes': ['href']}


def method_case(page, action_ref, prior_records=None):
    records = copy.deepcopy(prior_records) if prior_records else MethodReadRecords(SCHEMA)
    params = MethodReadToolParams(outputPath=[], container='.item', fields={
        'title': {'selector': 'a'}, 'url': {'selector': 'a', 'attribute': 'href', 'resolveUrl': True}})
    mapping = expand_method_read_params(params, SCHEMA)
    rows = [{'title': 'Record ' + str(index), 'url': page + '/item/' + str(index)} for index in range(3)]
    sample = ReadSample(specificationDigest=digest(mapping.specification), output=rows, outputDigest=digest(rows),
        pageIdentity={'targetId': 'tab-1', 'url': page}, documentRootId=12,
        containerIdsDigest=digest([1, 2, 3]), coverage={'scope': 'current_dom_matches',
            'total': 20, 'sampled': 3, 'sampleLimit': 3, 'runtimeTruncated': False})
    start = len(records.records)
    record = MethodReadRecord(readRef='r' + str(start + 1), parameters=params, mapping=mapping, sample=sample)
    records.records.append(record)
    payload = method_read_model_result(record)
    return {'records': records, 'start': start, 'arguments': params.model_dump(mode='json'),
            'results': [ActionResult(extracted_content=json.dumps(payload))],
            'result_ref': reference(payload), 'action_ref': action_ref}


def query_facts(action_ref, page, continued, query_args=QUERY_ARGS, duplicates=1, destination=PAGE2):
    output = [{'text': 'Next', 'ordinal': index + 1, 'attribute_href': destination}
              for index in range(duplicates)] if continued else []
    result = ActionResult(long_term_memory=f'Found {len(output)} elements matching "a.next".')
    query = complete_find_elements_query(capture_find_elements_query(
        SimpleNamespace(url=page), action_ref, query_args, query_args, 'tab-1'), [result])
    result_ref = reference(result.model_dump(mode='json'))
    read = VerifiedNaturalRead(actionRef=action_ref, specification=find_elements_read_spec(query),
        outputPath=[], readPath=[], output=output, resultDigest=result_ref.digest, urlDigest=digest(page),
        targetId='tab-1', containerIdsDigest=digest(list(range(len(output)))), stable=True)
    return [fact('dom_query', query.model_dump(mode='json')),
            fact('verified_natural_read', read.model_dump(mode='json'))], result_ref


def add_action(records, observations, name, args, before, after, *, facts=(), result_ref=None, done=False):
    index = len(records)
    refs = []
    for url, extra in [(before, []), (after, facts)]:
        identity = f'o-{len(observations) + 1:04d}'
        refs.append(identity)
        observations.append(NormalizedObservation(id=identity, sequence=len(observations), url=url, tabId='tab-1',
            facts=[fact('url_digest', digest(url)), fact('url', url), *extra], sourceRefs=[reference(identity)]))
    records.append(HistoryRecord(stepIndex=index, actions=[{name: args}],
        results=[ResultEvidence(errorPresent=False, ref=result_ref or reference(name + str(index)),
                                is_done=done, success=True if done else None)],
        preObservationRef=refs[0], postObservationRefs={'0': refs[1]}))


def repeat_source(*, terminal_probe=False, hidden_effect=False, output_read='r1', duplicate_links=1,
                  lookup_probes=False, final_positive=False, final_query_budget=None, final_query_count=None,
                  same_tab_advance=False):
    first = method_case(PAGE1, 'a-0001')
    request, registry, schema, read = method_source(case=first, schema=SCHEMA)
    records, observations = [], []
    add_action(records, observations, 'bat_read_fields', first['arguments'], PAGE1, PAGE1,
               facts=[fact('verified_natural_read', read.model_dump(mode='json'))], result_ref=first['result_ref'])
    query_args = {**QUERY_ARGS, 'max_results': max(1, duplicate_links)}
    facts, result = query_facts('a-0002', PAGE1, True, query_args, duplicate_links)
    add_action(records, observations, 'find_elements', query_args, PAGE1, PAGE1, facts=facts, result_ref=result)
    add_action(records, observations, 'navigate', {'url': PAGE2, **({'new_tab': False} if same_tab_advance else {})}, PAGE1, PAGE2,
        facts=[fact('natural_postcondition', {'actionRef': 'a-0003', 'kind': 'url',
                                             'bindingArgument': 'url', 'matched': True})])
    if same_tab_advance:
        observations[-2].facts.append(fact('natural_binding', {'actionRef': 'a-0003', 'argumentPath': 'new_tab',
            'binding': {'source': 'constant', 'value': False}, 'provenance': 'native_parameter'}))
    if lookup_probes:
        for args in [query_args, {**query_args, 'selector': 'nav a', 'max_results': 10}]:
            action_ref = f'a-{len(records) + 1:04d}'
            facts, result = query_facts(action_ref, PAGE2, True, args, duplicate_links)
            add_action(records, observations, 'find_elements', args, PAGE2, PAGE2,
                       facts=facts, result_ref=result)
    end_page = PAGE2
    if terminal_probe or hidden_effect:
        end_page = PAGE9 if terminal_probe else PAGE2
        add_action(records, observations, 'navigate' if terminal_probe else 'send_keys',
                   {'url': PAGE9} if terminal_probe else {'keys': 'Enter'}, PAGE2, end_page)
    second_id = f'a-{len(records) + 1:04d}'
    second = method_case(end_page, second_id, first['records'])
    add_action(records, observations, 'bat_read_fields', second['arguments'], end_page, end_page,
        facts=[fact('verified_natural_read', verified_method_read(**second).model_dump(mode='json'))],
        result_ref=second['result_ref'])
    query_id = f'a-{len(records) + 1:04d}'
    final_args = {**query_args, 'max_results': final_query_budget or query_args['max_results']}
    facts, result = query_facts(query_id, end_page, final_positive, final_args,
                               final_query_count or duplicate_links, PAGE9)
    add_action(records, observations, 'find_elements', final_args, end_page, end_page, facts=facts, result_ref=result)
    value = {'requirementDigest': request.requirement.sourceDigest, 'outputPath': [], 'stableKeyPath': ['url'],
        'iterations': [{'readActionRef': 'a-0001', 'continuationActionRef': 'a-0002', 'advanceActionRef': 'a-0003'},
                       {'readActionRef': second_id, 'continuationActionRef': query_id, 'advanceActionRef': None}]}
    observations[1].facts.append(fact('repeat_method', value))
    output = complete_from_read_refs(second['records'], [output_read], schema, request.plan.resultSpec)
    assembly, issues = build_verified_output_assembly(observations, output, schema,
        lambda _kind, value: reference(value), selected_read_refs=[output_read], result_spec=request.plan.resultSpec)
    if issues:
        raise AssertionError(issues)
    add_action(records, observations, 'done', {'success': True, 'reason': 'Observed repeat method.',
        'readRefs': [output_read]}, end_page, end_page, facts=[assembly], result_ref=reference(output), done=True)
    if lookup_probes:
        for observation in observations:
            observation.facts.append(fact('document_identity', {
                'targetId': 'tab-1', 'documentDigest': digest({'document': observation.url})}))
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version=registry.providerVersion,
        historyRef='fixture:repeat-source'), completed=True, records=records, observations=observations,
        finalResultRef=reference(output), redactionManifestRef=reference('redaction')), registry)
    if issues:
        raise AssertionError(issues)
    raw = request.model_dump(mode='json', by_alias=True)
    raw['trace'] = trace.model_dump(mode='json')
    raw['requirement'].update(text='Collect the records across all pages.', taskText='Collect the records across all pages.')
    raw['requirement']['digest'] = digest({key: value for key, value in raw['requirement'].items() if key != 'digest'})
    return type(request).model_validate(raw), registry, schema


def repeat_fact(request):
    return next(item for observation in request.trace.observations for item in observation.facts if item.kind == 'repeat_method')


def replace_fact(request, kind, action_ref, mutate):
    for observation in request.trace.observations:
        for index, item in enumerate(observation.facts):
            if item.kind == kind and (kind == 'repeat_method' or item.value.get('actionRef') == action_ref):
                value = copy.deepcopy(item.value)
                mutate(value)
                observation.facts[index] = fact(kind, value)
                return
    raise AssertionError('fixture_fact_missing')


class NaturalRepeatTests(unittest.TestCase):
    def test_complete_query_budget_variation_preserves_first_limit_and_rejects_semantic_changes(self):
        request, registry, schema = repeat_source(final_positive=True, duplicate_links=4, final_query_budget=100)
        original = request.model_dump(mode='json')
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(compiled.segments[1]['operation']['specification']['maxItems'], 4)
        self.assertEqual(request.model_dump(mode='json'), original)
        for mutation in ['selector', 'attributes', 'include_text', 'field', 'incomplete', 'ordinal']:
            with self.subTest(mutation=mutation):
                changed = request.model_copy(deep=True)
                action = next(item for item in changed.trace.actions if item.id == 'a-0005')
                if mutation in ['selector', 'attributes', 'include_text']:
                    action.args[mutation] = {'selector': 'unproven', 'attributes': ['title'], 'include_text': False}[mutation]
                elif mutation == 'incomplete':
                    replace_fact(changed, 'dom_query', action.id, lambda value: value.update(complete=False))
                elif mutation == 'field':
                    replace_fact(changed, 'verified_natural_read', action.id,
                                 lambda value: value['specification']['fields']['text'].update(textSource='rendered'))
                else:
                    replace_fact(changed, 'verified_natural_read', action.id,
                                 lambda value: value['specification']['outputSchema']['items']['properties']['ordinal'].update(maximum=50))
                rejected = compile_request(changed, registry, output_schema=schema)
                self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in rejected.gaps])
        too_many, registry, schema = repeat_source(final_positive=True, duplicate_links=4,
                                                  final_query_budget=100, final_query_count=5)
        rejected = compile_request(too_many, registry, output_schema=schema)
        self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in rejected.gaps])

    def test_two_positive_samples_prove_method_without_observed_terminal(self):
        request, registry, schema = repeat_source(final_positive=True, duplicate_links=4)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(len(compiled.segments), 3)
        final = repeat_fact(request).value['iterations'][-1]
        self.assertIsNone(final['advanceActionRef'])
        query = next(fact.value for observation in request.trace.observations for fact in observation.facts
                     if fact.kind == 'dom_query' and fact.value.get('actionRef') == final['continuationActionRef'])
        self.assertEqual(query['total'], 4)  # 未观察终页；null 仅表示代表样本在此结束。
        for malformed in ['', PAGE2]:
            changed = request.model_copy(deep=True)
            replace_fact(changed, 'verified_natural_read', final['continuationActionRef'],
                         lambda value: value['output'][1].update(attribute_href=malformed))
            rejected = compile_request(changed, registry, output_schema=schema)
            self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in rejected.gaps])
        absent_advance = request.model_copy(deep=True)
        replace_fact(absent_advance, 'repeat_method', None,
                     lambda value: value['iterations'][0].update(advanceActionRef=None))
        rejected = compile_request(absent_advance, registry, output_schema=schema)
        self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in rejected.gaps])

    def test_verified_lookup_probes_fold_without_replaying_and_tampering_rejects(self):
        request, registry, schema = repeat_source(terminal_probe=True, lookup_probes=True)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(len(compiled.segments), 3)
        for action_ref in ['a-0004', 'a-0005']:
            row = next(item for item in compiled.coverage if item.actionRef == action_ref)
            self.assertEqual(row.ownerSegmentId, 's-a-0002')
            self.assertTrue(validate_repeat_coverage(request.trace, row))
        for mutation in ['effect', 'name', 'incomplete', 'selector', 'read_spec', 'document']:
            with self.subTest(mutation=mutation):
                changed = request.model_copy(deep=True)
                lookup = next(action for action in changed.trace.actions if action.id == 'a-0005')
                if mutation == 'effect':
                    lookup.effect = 'navigation'
                elif mutation == 'name':
                    lookup.name = 'send_keys'
                elif mutation == 'incomplete':
                    replace_fact(changed, 'dom_query', lookup.id, lambda value: value.update(complete=False))
                elif mutation == 'selector':
                    lookup.args['selector'] = 'unproven'
                elif mutation == 'read_spec':
                    replace_fact(changed, 'verified_natural_read', lookup.id,
                                 lambda value: value['specification'].update(container='unproven'))
                else:
                    observation = next(item for item in changed.trace.observations
                                       if item.id == lookup.postObservationRef)
                    observation.facts = [item for item in observation.facts if item.kind != 'document_identity']
                    observation.facts.append(fact('document_identity', {'targetId': 'tab-1', 'documentDigest': digest('other')}))
                rejected = compile_request(changed, registry, output_schema=schema)
                self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in rejected.gaps])

    def test_complete_equivalent_links_use_repeat_destination_and_distinct_links_reject(self):
        request, registry, schema = repeat_source(duplicate_links=4)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        advance = next(segment for segment in compiled.segments if segment['id'] == 's-a-0003')
        binding = next(item for item in advance['bindings'] if item['argumentPath'] == 'url')
        self.assertEqual(binding['derivation'], 'repeat_destination')
        self.assertEqual(binding['sourceRef'], repeat_fact(request).id)
        replace_fact(request, 'verified_natural_read', 'a-0002',
                     lambda value: value['output'][1].update(attribute_href=PAGE9))
        rejected = compile_request(request, registry, output_schema=schema)
        self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in rejected.gaps])
        self.assertEqual(rejected.controlGraph['entry'], '')

    def test_production_compiler_folds_two_samples_and_preserves_coverage(self):
        request, registry, schema = repeat_source()
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual([segment['id'] for segment in compiled.segments], ['s-a-0001', 's-a-0002', 's-a-0003'])
        self.assertEqual(len(compiled.repeatMethods), 1)
        method = compiled.repeatMethods[0]
        self.assertEqual(method['stableKeyPath'], ['url'])
        self.assertEqual(method['sampleActionRefs'], ['a-0001', 'a-0002', 'a-0003', 'a-0004', 'a-0005'])
        self.assertEqual(compiled.controlGraph['entry'], 'loop-repeat-a-0001')
        for source, outcome, destination in [('s-a-0002', 'success', 'loop-repeat-a-0001'),
                ('s-a-0003', 'success', 's-a-0001'), ('loop-repeat-a-0001', 'done', 'completed')]:
            self.assertIn({'from': source, 'outcome': outcome, 'to': destination}, compiled.controlGraph['edges'])
        self.assertEqual(compiled.outputAssembly['fields'][0]['binding']['nodeId'], 'a-0001')
        advance = compiled.segments[2]
        self.assertEqual(next(item['binding'] for item in advance['bindings'] if item['argumentPath'] == 'url'),
                         {'source': 'node', 'nodeId': 'a-0002', 'path': [0, 'attribute_href']})
        samples = [row for row in compiled.coverage if row.exclusionRule == 'repeat_method_sample/v1']
        self.assertEqual([row.actionRef for row in samples], ['a-0004', 'a-0005'])
        self.assertTrue(all(validate_repeat_coverage(request.trace, row) for row in samples))
        self.assertFalse(validate_repeat_coverage(request.trace, samples[0].model_copy(update={'ownerSegmentId': 's-a-0003'})))
        self.assertEqual(compiled.segments[0]['operation']['specification']['maxItems'], 300)

    def test_terminal_probe_is_supported_without_running_all_intermediate_pages(self):
        request, registry, schema = repeat_source(terminal_probe=True)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(len(compiled.segments), 3)
        samples = [row for row in compiled.coverage if row.exclusionRule == 'repeat_method_sample/v1']
        self.assertEqual([row.actionRef for row in samples], ['a-0004', 'a-0005', 'a-0006'])
        self.assertTrue(all(validate_repeat_coverage(request.trace, row) for row in samples))

    def test_bad_stop_spec_and_stable_key_cannot_pass_source_validator(self):
        mutations = [('verified_natural_read', 'a-0005', lambda value: value['specification'].update(container='a.other')),
                     ('repeat_method', None, lambda value: value.update(stableKeyPath=['missing'])),
                     ('repeat_method', None, lambda value: value.update(stableKeyPath=['__proto__']))]
        for kind, action_ref, mutate in mutations:
            with self.subTest(kind=kind, action=action_ref):
                request, registry, schema = repeat_source()
                replace_fact(request, kind, action_ref, mutate)
                with self.assertRaisesRegex(ValueError, 'repeat_method_evidence_invalid'):
                    validate_repeat_method(request.trace, repeat_fact(request).value, request.requirement.sourceDigest)
                compiled = compile_request(request, registry, output_schema=schema)
                self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in compiled.gaps])
                self.assertEqual(compiled.controlGraph['entry'], '')

    def test_unreferenced_side_effect_cannot_be_erased_as_sample(self):
        request, registry, schema = repeat_source(hidden_effect=True)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in compiled.gaps])
        self.assertEqual(compiled.controlGraph['entry'], '')

    def test_non_dynamic_advance_and_changed_fact_digest_are_rejected(self):
        for mode in ['advance', 'digest']:
            with self.subTest(mode=mode):
                request, registry, schema = repeat_source()
                if mode == 'advance':
                    request.trace.actions[2].args['url'] = 'https://example.test/unobserved'
                else:
                    repeat_fact(request).sourceRefs[0].digest = 'f' * 64
                compiled = compile_request(request, registry, output_schema=schema)
                self.assertIn('repeat_method_evidence_invalid', [item['reason'] for item in compiled.gaps])
                self.assertEqual(compiled.controlGraph['entry'], '')

    def test_done_cannot_bind_to_folded_later_sample(self):
        request, registry, schema = repeat_source(output_read='r2')
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertIn('repeat_method_representative_binding_required', [item['reason'] for item in compiled.gaps])
        self.assertEqual(compiled.controlGraph['entry'], '')


if __name__ == '__main__':
    unittest.main()
