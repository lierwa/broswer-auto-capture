"""Natural v2 compiles only direct bindings, DOM identity, and observed effects."""
import unittest

from browser_use.tools.service import Tools

from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.evidence import NormalizedTrace, digest
from workflow_use.hybrid.natural_facts import binding_facts
from workflow_use.hybrid.read import ReadSpec
from workflow_use.hybrid.registry import ActionRegistry, action_effect
from workflow_use.hybrid.request import NaturalCompilationRequest


def reference(label, value):
    return {'ref': 'fixture:' + label, 'digest': digest(value)}

def fact(kind, value, label):
    return {'id': 'fact-' + digest([kind, label])[:16], 'kind': kind, 'value': value,
            'sourceRefs': [reference(label, value)]}

def binding(action_ref, path, value, provenance='native_parameter'):
    source = {'source': 'constant', 'value': value}
    return fact('natural_binding', {'actionRef': action_ref, 'argumentPath': path, 'binding': source,
                'provenance': provenance, 'taskQuote': value if provenance == 'task_literal' else None},
                action_ref + '-binding-' + path)

def observation(sequence, url, title, extras=(), url_digest=None):
    facts = [fact('url', url, f'o{sequence}-url'), fact('url_digest', url_digest or digest(url), f'o{sequence}-url-digest'),
             fact('title', title, f'o{sequence}-title'), *extras]
    body = {'url': url, 'tabId': 'tab-1', 'sequence': sequence}
    return {'id': f'o-{sequence + 1:04d}', 'sequence': sequence, 'url': url, 'tabId': 'tab-1',
            'documentDigest': None, 'accessibilityDigest': None, 'interactiveElementsDigest': None,
            'facts': facts, 'sourceRefs': [reference(f'o{sequence}', body)]}

def natural_request(registry, actions, observations, task='Perform the browser step.', runtime_schema=None,
                    output_schema=None, final_output=None):
    runtime_schema = runtime_schema or {'type': 'object'}
    output_schema = output_schema or {'type': 'null'}
    normalized = []
    for index, (name, args, pre, post) in enumerate(actions):
        result = reference(f'result-{index}', {'success': True})
        normalized.append({'id': f'a-{index + 1:04d}', 'stepIndex': index, 'actionIndex': 0,
            'name': name, 'args': args, 'status': 'succeeded', 'preObservationRef': pre,
            'resultRef': result, 'postObservationRef': post, 'effect': action_effect(name), 'retryOf': None})
    trace_body = {'mediaType': 'application/vnd.bat.browser-use-trace+json;version=1',
        'source': {'provider': 'browser-use', 'version': registry.providerVersion, 'historyRef': 'fixture:natural'},
        'judged': True, 'completed': True, 'actions': normalized, 'observations': observations,
        'finalResultRef': reference('final', final_output),
        'redactionManifestRef': reference('redaction', {'policy': 'test'})}
    trace = NormalizedTrace.model_validate({**trace_body, 'digest': digest(trace_body)})
    requirement = {'id': 'req', 'version': 1, 'text': task, 'taskText': task,
                   'sourceDigest': digest({'source': 'req'})}
    plan = {'id': 'plan', 'version': 1, 'sourceDigest': digest({'source': 'plan'}), 'stepId': 'step',
            'inputSchemaDigest': digest(runtime_schema), 'outputSchemaDigest': digest(output_schema),
            'callMode': 'once'}
    return NaturalCompilationRequest.model_validate({'compilerVersion': 'bat-hybrid/2',
        'actionRegistryVersion': registry.schemaDigest, 'requirement': {**requirement, 'digest': digest(requirement)},
        'plan': {**plan, 'digest': digest(plan)}, 'runtimeInputSchema': runtime_schema,
        'trace': trace.model_dump(mode='json')})

class NaturalCompileTests(unittest.TestCase):
    def setUp(self):
        self.registry = ActionRegistry.from_tools(Tools())

    def test_wait_without_observed_change_and_extract_remain_specific_gaps(self):
        observations = [observation(0, 'https://fixture.invalid/list', 'List',
                                    [binding('a-0001', 'seconds', 1)]),
                        observation(1, 'https://fixture.invalid/list', 'List'),
                        observation(2, 'https://fixture.invalid/list', 'List'),
                        observation(3, 'https://fixture.invalid/list', 'List', [fact('native_extraction', {
                            'actionRef': 'a-0002', 'outputSchemaDigest': digest({'type': 'null'}),
                            'resultDigest': '1' * 64, 'output': None}, 'native-extraction')])]
        request = natural_request(self.registry, [
            ('wait', {'seconds': 1}, 'o-0001', 'o-0002'),
            ('extract', {'query': 'Read bounded fields'}, 'o-0003', 'o-0004')], observations)

        result = compile_request(request, self.registry)

        reasons = {item['reason'] for item in result.gaps}
        self.assertIn('natural_postcondition_evidence_missing', reasons)
        self.assertIn('natural_field_read_evidence_missing', reasons)
        self.assertEqual(result.segments, [])
        self.assertEqual([row.disposition for row in result.coverage], ['not_compilable', 'not_compilable'])

    def test_input_uses_runtime_binding_and_observed_target_value(self):
        structure = {'actionRef': 'a-0001', 'targetRef': 'n-0001',
            'scope': {'url': 'https://fixture.invalid/form', 'tabId': 'tab-1', 'targetId': 'target-1',
                      'frameId': None, 'document': None},
            'nodes': [{'id': 'n-0001', 'tag': 'input', 'xpath': 'html/body/input', 'parentRef': None,
                       'childrenRefs': [], 'attributes': {}}], 'queryCandidate': None,
            'coverage': {'source': 'callback_selector_map'}, 'limitations': ['query_candidate_unavailable']}
        input_binding = fact('natural_binding', {'actionRef': 'a-0001', 'argumentPath': 'text',
            'binding': {'source': 'input', 'path': ['value']}, 'provenance': 'runtime_input',
            'taskQuote': None}, 'input-binding')
        observations = [observation(0, 'https://fixture.invalid/form', 'Form',
            [fact('dom_structure', structure, 'input-structure'), input_binding]),
            observation(1, 'https://fixture.invalid/form', 'Form', [fact('target_value', {
                'actionRef': 'a-0001', 'targetRef': 'n-0001', 'value': {'inputRef': ['value']}},
                'target-value')])]
        schema = {'type': 'object', 'properties': {'value': {'type': 'string'}}}
        request = natural_request(self.registry, [('input', {'index': 7, 'text': 'fixture'},
            'o-0001', 'o-0002')], observations, runtime_schema=schema)

        result = compile_request(request, self.registry)

        self.assertEqual(result.gaps, [])
        self.assertEqual(result.segments[0]['bindings'][0]['binding'], {'source': 'input', 'path': ['value']})
        self.assertEqual(result.segments[0]['postconditions'], [{
            'kind': 'target_value', 'bindingArgument': 'text',
            'clauseRef': observations[1]['facts'][3]['id']}])

        tampered = request.model_dump(mode='json')
        binding_fact = next(item for item in tampered['trace']['observations'][0]['facts']
                            if item['kind'] == 'natural_binding')
        binding_fact['value']['binding']['path'] = ['other']
        trace_body = {key: value for key, value in tampered['trace'].items() if key != 'digest'}
        tampered['trace']['digest'] = digest(trace_body)
        with self.assertRaisesRegex(ValueError, 'fact_source_digest_mismatch'):
            NaturalCompilationRequest.model_validate(tampered)

    def test_target_with_redacted_url_scope_is_not_compiled(self):
        structure = {'actionRef': 'a-0001', 'targetRef': 'n-0001',
            'scope': {'url': 'https://fixture.invalid/list', 'tabId': 'tab-1', 'targetId': 'target-1',
                      'frameId': None, 'document': None},
            'nodes': [{'id': 'n-0001', 'tag': 'button', 'xpath': 'html/body/button', 'parentRef': None,
                       'childrenRefs': [], 'attributes': {}}], 'queryCandidate': None,
            'coverage': {'source': 'callback_selector_map'},
            'limitations': ['query_candidate_unavailable', 'redacted_url_components']}
        observations = [observation(0, 'https://fixture.invalid/list', 'List',
                                    [fact('dom_structure', structure, 'redacted-structure')]),
                        observation(1, 'https://fixture.invalid/next', 'Next')]
        request = natural_request(self.registry, [('click', {'index': 7}, 'o-0001', 'o-0002')], observations)

        result = compile_request(request, self.registry)

        self.assertIn('natural_target_scope_url_redacted', [item['reason'] for item in result.gaps])
        self.assertEqual(result.segments, [])

    def test_missing_target_evidence_is_one_engineering_gap_without_index_binding(self):
        observations = [observation(0, 'https://fixture.invalid/list', 'List'),
                        observation(1, 'https://fixture.invalid/next', 'Next')]
        request = natural_request(self.registry, [('click', {'index': 7}, 'o-0001', 'o-0002')], observations)

        result = compile_request(request, self.registry)

        reasons = [item['reason'] for item in result.gaps]
        self.assertIn('same_snapshot_dom_target_required', reasons)
        self.assertNotIn('natural_binding_evidence_missing:index', reasons)
        target_gap = next(item for item in result.gaps if item['reason'] == 'same_snapshot_dom_target_required')
        self.assertEqual(target_gap['code'], 'missing_observation')

    def test_target_without_xpath_is_an_unsupported_capture_capability(self):
        structure = {'actionRef': 'a-0001', 'targetRef': 'n-0001',
            'scope': {'url': 'https://fixture.invalid/list', 'tabId': 'tab-1', 'targetId': 'target-1',
                      'frameId': None, 'document': None},
            'nodes': [{'id': 'n-0001', 'tag': 'button', 'xpath': None, 'parentRef': None,
                       'childrenRefs': [], 'attributes': {}}], 'queryCandidate': None,
            'coverage': {'source': 'callback_selector_map'}, 'limitations': ['xpath_unavailable']}
        observations = [observation(0, 'https://fixture.invalid/list', 'List',
                                    [fact('dom_structure', structure, 'missing-xpath')]),
                        observation(1, 'https://fixture.invalid/next', 'Next')]
        request = natural_request(self.registry, [('click', {'index': 7}, 'o-0001', 'o-0002')], observations)

        result = compile_request(request, self.registry)

        target_gap = next(item for item in result.gaps if item['reason'] == 'natural_target_xpath_unavailable')
        self.assertEqual(target_gap['code'], 'unsupported_capability')
        self.assertNotIn('natural_binding_evidence_missing:index', [item['reason'] for item in result.gaps])

    def test_go_back_description_is_ignored_and_scroll_uses_real_technical_signature(self):
        observations = [observation(0, 'https://fixture.invalid/detail', 'Detail'),
                        observation(1, 'https://fixture.invalid/list', 'List')]
        request = natural_request(self.registry, [('go_back', {'description': 'Return to the list'},
            'o-0001', 'o-0002')], observations)

        result = compile_request(request, self.registry)

        self.assertEqual(result.gaps, [])
        self.assertEqual(result.segments[0]['bindings'], [])
        facts = binding_facts('a-0001', 'scroll', {'down': True, 'pages': 1.0}, {}, {}, '')
        self.assertEqual([(item.argumentPath, item.binding) for item in facts], [
            ('down', {'source': 'constant', 'value': True}),
            ('pages', {'source': 'constant', 'value': 1.0})])

        scroll_request = natural_request(self.registry, [('scroll', {'down': True, 'pages': 1.0},
            'o-0001', 'o-0002')], observations)
        scroll_result = compile_request(scroll_request, self.registry)
        self.assertEqual(scroll_result.segments, [])
        self.assertIn('natural_concrete_effect_missing', [item['reason'] for item in scroll_result.gaps])

    def test_verified_natural_read_compiles_only_with_original_output_schema(self):
        item_schema = {'type': 'object', 'properties': {'name': {'type': 'string', 'maxLength': 40}},
                       'required': ['name'], 'additionalProperties': False}
        list_schema = {'type': 'array', 'maxItems': 2, 'items': item_schema}
        output_schema = {'type': 'object', 'properties': {'records': list_schema},
                         'required': ['records'], 'additionalProperties': False}
        specification = {'container': '.record', 'fields': {'name': {'selector': '.name'}},
                         'maxItems': 2, 'maxInputBytes': 4000, 'outputSchema': list_schema}
        result_digest = reference('result-0', {'success': True})['digest']
        value = {'actionRef': 'a-0001', 'specification': specification, 'outputPath': ['records'],
                 'readPath': [], 'output': [{'name': 'Example'}], 'resultDigest': result_digest,
                 'urlDigest': digest('https://fixture.invalid/list?filter=one'), 'targetId': 'tab-1',
                 'containerIdsDigest': digest([10]), 'stable': True}
        final_output = {'records': [{'name': 'Example'}]}
        assembly = {'fields': [{'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': []},
                                'path': ['records']}], 'schema': output_schema,
                    'outputDigest': digest(final_output)}
        full_digest = digest('https://fixture.invalid/list?filter=one')
        incomplete_observations = [observation(0, 'https://fixture.invalid/list', 'List', url_digest=full_digest),
            observation(1, 'https://fixture.invalid/list', 'List',
                        [fact('verified_natural_read', value, 'verified-read-only')], full_digest)]
        incomplete = natural_request(self.registry,
            [('extract', {'query': 'Read records'}, 'o-0001', 'o-0002')], incomplete_observations,
            output_schema=output_schema, final_output=final_output)
        incomplete_result = compile_request(incomplete, self.registry, output_schema=output_schema)
        self.assertIn('natural_output_assembly_incomplete', [item['reason'] for item in incomplete_result.gaps])

        observations = [observation(0, 'https://fixture.invalid/list', 'List', url_digest=full_digest),
                        observation(1, 'https://fixture.invalid/list', 'List',
                                    [fact('verified_natural_read', value, 'verified-read'),
                                     fact('verified_output_assembly', assembly, 'verified-assembly')], full_digest)]
        request = natural_request(self.registry, [('extract', {'query': 'Read records'}, 'o-0001', 'o-0002')],
                                  observations, output_schema=output_schema, final_output=final_output)

        missing = compile_request(request, self.registry)
        self.assertIn('natural_output_schema_required', [item['reason'] for item in missing.gaps])
        result = compile_request(request, self.registry, output_schema=output_schema)

        self.assertEqual(result.gaps, [])
        self.assertEqual(result.outputAssembly['fields'][0]['path'], ['records'])
        segment = result.segments[0]
        self.assertEqual(segment['operation']['name'], 'browser.read-fields')
        self.assertEqual(segment['operation']['specification'], ReadSpec.model_validate(specification).model_dump(mode='json'))
        self.assertEqual(segment['outputs'], [{'schema': list_schema,
                                                'sourceRef': observations[1]['facts'][3]['id']}])

        tampered = request.model_dump(mode='json')
        read_fact = next(item for item in tampered['trace']['observations'][1]['facts']
                         if item['kind'] == 'verified_natural_read')
        read_fact['value']['output'][0]['name'] = 'Changed'
        trace_body = {key: value for key, value in tampered['trace'].items() if key != 'digest'}
        tampered['trace']['digest'] = digest(trace_body)
        with self.assertRaisesRegex(ValueError, 'fact_source_digest_mismatch'):
            NaturalCompilationRequest.model_validate(tampered)

    def test_successful_same_document_find_elements_is_audited_internal_observation(self):
        url = 'https://fixture.invalid/list?filter=one'
        query = {'schemaVersion': 'bat.dom-query/v1', 'actionRef': 'a-0001',
                 'scope': {'url': 'https://fixture.invalid/list', 'urlDigest': digest(url),
                           'tabId': 'tab-1', 'targetId': None, 'frameId': None, 'document': None},
                 'query': {'kind': 'css', 'value': '.record'}, 'requestedAttributes': [],
                 'includeText': False, 'maxResults': 10, 'total': 2, 'showing': 2,
                 'truncated': False, 'complete': True, 'limitations': ['result_bodies_omitted']}
        observations = [observation(0, 'https://fixture.invalid/list', 'List', url_digest=digest(url)),
                        observation(1, 'https://fixture.invalid/list', 'List',
                                    [fact('dom_query', query, 'dom-query')], digest(url))]
        arguments = {'selector': '.record', 'max_results': 10, 'include_text': False, 'attributes': []}
        request = natural_request(self.registry, [('find_elements', arguments, 'o-0001', 'o-0002')], observations)

        result = compile_request(request, self.registry)

        self.assertEqual(result.gaps, [])
        self.assertEqual(result.segments, [])
        self.assertEqual(result.coverage[0].disposition, 'agent_internal')
        self.assertEqual(result.coverage[0].exclusionRule, 'native_dom_lookup_observation/v1')
        self.assertEqual(len(result.coverage[0].evidenceRefs), 2)

        changed = request.model_dump(mode='json')
        digest_fact = next(item for item in changed['trace']['observations'][1]['facts']
                           if item['kind'] == 'url_digest')
        digest_fact['value'] = digest('https://fixture.invalid/list?filter=two')
        digest_fact['sourceRefs'][0]['digest'] = digest(digest_fact['value'])
        trace_body = {key: value for key, value in changed['trace'].items() if key != 'digest'}
        changed['trace']['digest'] = digest(trace_body)
        rejected = compile_request(NaturalCompilationRequest.model_validate(changed), self.registry)
        self.assertNotEqual(rejected.coverage[0].disposition, 'agent_internal')
        self.assertIn('natural_action_not_admitted', [item['reason'] for item in rejected.gaps])

if __name__ == '__main__':
    unittest.main()
