import unittest
from types import SimpleNamespace

from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_output import (
    VerifiedOutputAssembly,
    build_verified_output_assembly,
    compile_natural_output_assembly,
)
from workflow_use.hybrid.read import ReadField, ReadSpec
from workflow_use.hybrid.natural_result_binding import (
    compile_empty_list_branches,
    compile_result_binding,
    compile_result_derivation_segments,
    wire_empty_list_branches,
)


def put_evidence(_kind, value):
    value_digest = digest(value)
    return EvidenceRef(ref='sha256:' + value_digest, digest=value_digest)


class OutputRecipeTest(unittest.TestCase):
    def test_indexed_consumer_without_declared_empty_success_keeps_ordinary_failure(self):
        records = {'type': 'array', 'items': {'type': 'object', 'properties': {
            'url': {'type': 'string'},
        }, 'required': ['url'], 'additionalProperties': False}, 'minItems': 1, 'maxItems': 5}
        segments = [
            {'id': 's-a-0001', 'outputs': [{'schema': records}], 'bindings': []},
            {'id': 's-a-0002', 'outputs': [], 'bindings': [{
                'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': [0, 'url']},
            }]},
        ]

        self.assertEqual(compile_empty_list_branches({'mode': 'execution'}, None, segments), ([], []))

        records['minItems'] = 0
        branches, gaps = compile_empty_list_branches({'mode': 'execution'}, None, segments)
        self.assertEqual(branches, [])
        self.assertEqual(gaps, [])
        self.assertEqual(compile_empty_list_branches({'mode': 'data', 'edgeCases': []},
                                                   {'assignments': []}, segments), ([], []))

        segments[0]['outputs'][0]['schema'] = {'type': 'array', 'items': {
            'type': 'array', 'items': {'type': 'string'}, 'maxItems': 5,
        }, 'minItems': 1, 'maxItems': 5}
        segments[1]['bindings'][0]['binding']['path'] = [0, 0]
        branches, gaps = compile_empty_list_branches({'mode': 'execution'}, None, segments)
        self.assertEqual(branches, [])
        self.assertEqual(gaps, [])

    def test_result_binding_keeps_verified_sources_and_plan_producer_refs_separate(self):
        schema = {'type': 'object', 'properties': {
            'issues': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 5},
        }, 'required': ['issues'], 'additionalProperties': False}
        assembly = {'sourceRef': 'fact-assembly', 'fields': [{
            'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': []}, 'path': ['issues'],
        }], 'schema': schema, 'proofRefs': [{'ref': 'fixture:proof', 'digest': '1' * 64}]}
        spec = SimpleNamespace(model_dump=lambda **_kwargs: {
            'contractVersion': 'bat-result-spec/v1', 'mode': 'data', 'schema': schema,
            'fields': [{'path': ['issues'], 'description': 'Issues', 'producerRef': 'read-issues'}],
            'edgeCases': [],
        })

        binding, gaps = compile_result_binding(spec, assembly, schema)

        self.assertEqual(gaps, [])
        self.assertEqual(binding['assignments'], [{
            'to': ['issues'], 'from': {'source': 'node', 'nodeId': 'a-0001', 'path': []},
            'producerRef': 'read-issues',
        }])
        self.assertEqual(binding['sourceRef'], assembly['sourceRef'])

    def test_result_binding_rejects_unowned_required_output(self):
        schema = {'type': 'object', 'properties': {'value': {'type': 'string'}},
                  'required': ['value'], 'additionalProperties': False}
        spec = SimpleNamespace(model_dump=lambda **_kwargs: {
            'contractVersion': 'bat-result-spec/v1', 'mode': 'data', 'schema': schema,
            'fields': [{'path': ['value'], 'description': 'Value', 'producerRef': 'read-value'}],
            'edgeCases': [],
        })

        binding, gaps = compile_result_binding(spec, {'sourceRef': 'fact', 'fields': [], 'schema': schema,
            'proofRefs': [{'ref': 'fixture:proof', 'digest': '1' * 64}]}, schema)

        self.assertIsNone(binding)
        self.assertEqual(gaps[0].reason, 'natural_result_binding_invalid')

    def test_result_binding_omits_unobserved_optional_field_without_dropping_its_owner(self):
        schema = {'type': 'object', 'properties': {
            'status': {'type': 'string'}, 'reason': {'type': 'string'},
        }, 'required': ['status'], 'additionalProperties': False}
        spec = SimpleNamespace(model_dump=lambda **_kwargs: {
            'mode': 'data', 'schema': schema, 'fields': [
                {'path': ['status'], 'description': 'Status', 'producerRef': 'status-owner'},
                {'path': ['reason'], 'description': 'Optional reason', 'producerRef': 'reason-owner'},
            ], 'edgeCases': [],
        })
        assembly = {'sourceRef': 'fact', 'fields': [
            {'binding': {'source': 'constant', 'value': 'obtained'}, 'path': ['status']},
        ], 'schema': schema, 'proofRefs': [{'ref': 'fixture:proof', 'digest': '1' * 64}]}

        binding, gaps = compile_result_binding(spec, assembly, schema)

        self.assertEqual(gaps, [])
        self.assertEqual(binding['assignments'], [{
            'to': ['status'], 'from': {'source': 'constant', 'value': 'obtained'},
            'producerRef': 'status-owner',
        }])
        self.assertEqual(spec.model_dump()['fields'][1]['producerRef'], 'reason-owner')

    def test_result_binding_splits_verified_root_object_across_declared_fields(self):
        schema = {'type': 'object', 'properties': {
            'keyword': {'type': 'string', 'minLength': 1}, 'message': {'type': 'string'},
        }, 'required': ['keyword', 'message'], 'additionalProperties': False}
        assembly = {'sourceRef': 'fact-assembly', 'fields': [{
            'binding': {'source': 'node', 'nodeId': 'a-0004', 'path': []}, 'path': [],
        }], 'schema': schema, 'proofRefs': [{'ref': 'fixture:proof', 'digest': '1' * 64}]}
        spec = SimpleNamespace(model_dump=lambda **_kwargs: {
            'contractVersion': 'bat-result-spec/v1', 'mode': 'data', 'schema': schema,
            'fields': [
                {'path': ['keyword'], 'description': 'Keyword', 'producerRef': 'queriedKeyword'},
                {'path': ['message'], 'description': 'Message', 'producerRef': 'catalogResultText'},
            ], 'edgeCases': [],
        })

        binding, gaps = compile_result_binding(spec, assembly, schema)

        self.assertEqual(gaps, [])
        self.assertEqual(binding['assignments'], [
            {'to': ['keyword'], 'from': {'source': 'node', 'nodeId': 'a-0004', 'path': ['keyword']},
             'producerRef': 'queriedKeyword'},
            {'to': ['message'], 'from': {'source': 'node', 'nodeId': 'a-0004', 'path': ['message']},
             'producerRef': 'catalogResultText'},
        ])

    def test_empty_list_branch_precedes_indexed_consumer_and_omits_optional_detail(self):
        issues = {'type': 'array', 'items': {'type': 'object', 'properties': {
            'url': {'type': 'string'},
        }, 'required': ['url'], 'additionalProperties': False}, 'maxItems': 5}
        schema = {'type': 'object', 'properties': {
            'issues': issues, 'detail': {'type': 'string'},
        }, 'required': ['issues'], 'additionalProperties': False}
        spec = SimpleNamespace(model_dump=lambda **_kwargs: {
            'contractVersion': 'bat-result-spec/v1', 'mode': 'data', 'schema': schema,
            'fields': [
                {'path': ['issues'], 'description': 'Issues', 'producerRef': 'read-issues'},
                {'path': ['detail'], 'description': 'Optional detail', 'producerRef': 'read-detail'},
            ],
            'edgeCases': [{'description': 'No first record', 'controlRef': 'has-issues'}],
        })
        result = {'contractVersion': 'bat-result-binding/v1', 'schema': schema,
            'assignments': [
                {'to': ['issues'], 'from': {'source': 'node', 'nodeId': 'a-0001', 'path': []},
                 'producerRef': 'read-issues'},
                {'to': ['detail'], 'from': {'source': 'node', 'nodeId': 'a-0003', 'path': []},
                 'producerRef': 'read-detail'},
            ], 'sourceRef': 'fact-output',
            'proofRefs': [{'ref': 'fixture:proof', 'digest': '1' * 64}]}
        segments = [
            {'id': 's-a-0001', 'outputs': [{'schema': issues}], 'bindings': []},
            {'id': 's-a-0002', 'outputs': [], 'bindings': [{
                'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': [0, 'url']},
            }]},
            {'id': 's-a-0003', 'outputs': [{'schema': {'type': 'string'}}], 'bindings': []},
        ]

        branches, gaps = compile_empty_list_branches(spec, result, segments)
        graph = wire_empty_list_branches({'entry': 's-a-0001', 'edges': [
            {'from': 's-a-0001', 'outcome': 'success', 'to': 's-a-0002'},
            {'from': 's-a-0002', 'outcome': 'success', 'to': 's-a-0003'},
            {'from': 's-a-0003', 'outcome': 'success', 'to': 'completed'},
        ], 'terminals': [{'id': 'completed', 'status': 'completed'}]}, branches)

        self.assertEqual(gaps, [])
        self.assertEqual(branches[0]['predicate']['value']['path'], [])
        self.assertEqual(branches[0]['falseResult']['assignments'], [result['assignments'][0]])
        self.assertFalse(any(edge['to'] == 's-a-0002' and edge['from'] == 's-a-0001'
                             for edge in graph['edges']))
        self.assertIn({'from': 'branch-result-has-issues', 'outcome': 'false',
                       'to': 'completed-empty-has-issues'}, graph['edges'])

    def test_empty_list_branch_rejects_required_output_from_skipped_detail(self):
        schema = {'type': 'object', 'properties': {
            'issues': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 5},
            'detail': {'type': 'string'},
        }, 'required': ['issues', 'detail'], 'additionalProperties': False}
        spec = SimpleNamespace(model_dump=lambda **_kwargs: {
            'mode': 'data', 'schema': schema,
            'fields': [{'path': [], 'description': 'Result', 'producerRef': 'result'}],
            'edgeCases': [{'description': 'No item', 'controlRef': 'has-items'}],
        })
        binding = {'schema': schema, 'assignments': [
            {'to': ['issues'], 'from': {'source': 'node', 'nodeId': 'a-0001', 'path': []}, 'producerRef': 'result'},
            {'to': ['detail'], 'from': {'source': 'node', 'nodeId': 'a-0002', 'path': []}, 'producerRef': 'result'},
        ]}
        segments = [
            {'id': 's-a-0001', 'outputs': [{'schema': schema['properties']['issues']}], 'bindings': []},
            {'id': 's-a-0002', 'outputs': [{'schema': {'type': 'string'}}], 'bindings': [{
                'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': [0]},
            }]},
        ]

        branches, gaps = compile_empty_list_branches(spec, binding, segments)

        self.assertEqual(branches, [])
        self.assertEqual(gaps[0].reason, 'natural_empty_branch_output_incomplete')

    def test_missing_collection_producer_completes_with_an_empty_required_array(self):
        records = {'type': 'array', 'items': {'type': 'object', 'properties': {
            'url': {'type': 'string'},
        }, 'required': ['url'], 'additionalProperties': False}, 'maxItems': 5}
        schema = {'type': 'object', 'properties': {
            'page1': records, 'page2': records, 'detail': {'type': 'string'},
        }, 'required': ['page1', 'page2'], 'additionalProperties': False}
        spec = SimpleNamespace(model_dump=lambda **_kwargs: {
            'contractVersion': 'bat-result-spec/v1', 'mode': 'data', 'schema': schema,
            'fields': [
                {'path': ['page1'], 'description': 'First page', 'producerRef': 'page1'},
                {'path': ['page2'], 'description': 'Second page', 'producerRef': 'page2'},
                {'path': ['detail'], 'description': 'Optional detail', 'producerRef': 'detail'},
            ], 'edgeCases': [{'description': 'No second page', 'controlRef': 'has-page2'}],
        })
        binding = {'schema': schema, 'assignments': [
            {'to': ['page1'], 'from': {'source': 'node', 'nodeId': 'a-0001', 'path': []},
             'producerRef': 'page1'},
            {'to': ['page2'], 'from': {'source': 'node', 'nodeId': 'a-0003', 'path': []},
             'producerRef': 'page2'},
            {'to': ['detail'], 'from': {'source': 'node', 'nodeId': 'a-0005', 'path': []},
             'producerRef': 'detail'},
        ]}
        segments = [
            {'id': 's-a-0001', 'outputs': [{'schema': records}], 'bindings': []},
            {'id': 's-a-0002', 'operation': {'name': 'browser.workflow-step'},
             'target': {'strategy': 'history'}, 'outputs': [], 'bindings': [],
             'postconditions': [{'kind': 'read_fields', 'consumerRef': 's-a-0003'}]},
            {'id': 's-a-0003', 'outputs': [{'schema': records}], 'bindings': []},
            {'id': 's-a-0004', 'outputs': [], 'bindings': [{
                'binding': {'source': 'node', 'nodeId': 'a-0003', 'path': [0, 'url']},
            }]},
            {'id': 's-a-0005', 'outputs': [{'schema': {'type': 'string'}}], 'bindings': []},
        ]
        graph = {'entry': 's-a-0001', 'edges': [
            {'from': 's-a-0001', 'outcome': 'success', 'to': 's-a-0002'},
            {'from': 's-a-0002', 'outcome': 'success', 'to': 's-a-0003'},
            {'from': 's-a-0002', 'outcome': 'missing', 'to': 'missing'},
            {'from': 's-a-0003', 'outcome': 'success', 'to': 's-a-0004'},
            {'from': 's-a-0004', 'outcome': 'success', 'to': 's-a-0005'},
        ], 'terminals': [{'id': 'missing', 'status': 'missing'}]}

        branches, gaps = compile_empty_list_branches(spec, binding, segments)
        wired = wire_empty_list_branches(graph, branches)

        self.assertEqual(gaps, [])
        self.assertEqual(branches[0]['missingProducerSegmentId'], 's-a-0002')
        self.assertEqual(branches[0]['falseResult']['assignments'][1]['from'],
                         {'source': 'constant', 'value': []})
        self.assertIn({'from': 's-a-0002', 'outcome': 'missing',
                       'to': 'completed-empty-has-page2'}, wired['edges'])

    def test_input_and_authorized_task_literal_complete_the_recipe_without_model_bindings(self):
        input_value = {'repository': 'owner/project'}
        input_schema = {'type': 'object', 'properties': {
            'repository': {'type': 'string', 'maxLength': 200},
        }, 'required': ['repository'], 'additionalProperties': False}
        output = {'repository': 'owner/project', 'state': 'open'}
        output_schema = {'type': 'object', 'properties': {
            'repository': {'type': 'string', 'maxLength': 200},
            'state': {'type': 'string', 'maxLength': 20},
        }, 'required': ['repository', 'state'], 'additionalProperties': False}

        fact, gaps = build_verified_output_assembly(
            [], output, output_schema, put_evidence,
            input_value=input_value, input_schema=input_schema,
            requirement_text='Read open issues from the selected repository.')

        self.assertEqual(gaps, [])
        value = VerifiedOutputAssembly.model_validate(fact.value)
        fields = {tuple(field.path): field for field in value.fields}
        self.assertEqual(fields[('repository',)].binding, {'source': 'input', 'path': ['repository']})
        self.assertEqual(fields[('state',)].binding, {'source': 'constant', 'value': 'open'})

        trace = SimpleNamespace(
            observations=[SimpleNamespace(facts=[fact])], actions=[],
            finalResultRef=SimpleNamespace(digest=digest(output)),
        )
        compiled, issues = compile_natural_output_assembly(
            trace, output_schema, [], input_schema, 'Read open issues from the selected repository.')

        self.assertEqual(issues, [])
        self.assertEqual(compiled['fields'], [
            {'binding': {'source': 'input', 'path': ['repository']}, 'path': ['repository']},
            {'binding': {'source': 'constant', 'value': 'open'}, 'path': ['state']},
        ])

    def test_repeated_input_value_is_not_arbitrarily_bound_to_the_first_path(self):
        input_value = {'first': 'same', 'second': 'same'}
        input_schema = {'type': 'object', 'properties': {
            'first': {'type': 'string'}, 'second': {'type': 'string'},
        }, 'required': ['first', 'second'], 'additionalProperties': False}
        output_schema = {'type': 'object', 'properties': {
            'value': {'type': 'string'},
        }, 'required': ['value'], 'additionalProperties': False}

        fact, gaps = build_verified_output_assembly(
            [], {'value': 'same'}, output_schema, put_evidence,
            input_value=input_value, input_schema=input_schema, requirement_text='No literal authority here.')

        self.assertIsNone(fact)
        self.assertEqual(gaps[0].reason, 'natural_output_assembly_incomplete')

    def test_output_assembly_names_uncovered_contract_path_without_sample_value(self):
        schema = {'type': 'object', 'properties': {
            'status': {'type': 'string', 'enum': ['obtained', 'unavailable']},
        }, 'required': ['status'], 'additionalProperties': False}

        fact, gaps = build_verified_output_assembly(
            [], {'status': 'obtained'}, schema, put_evidence,
            input_value={}, input_schema={'type': 'object', 'properties': {},
                                           'required': [], 'additionalProperties': False},
            requirement_text='Read the page and report its fields.')

        self.assertIsNone(fact)
        self.assertEqual([item.reason for item in gaps], [
            'natural_output_assembly_incomplete', 'natural_output_uncovered_paths:[["status"]]',
        ])
        self.assertTrue(all('obtained' not in item.reason for item in gaps))

    def test_dynamic_input_array_is_bound_as_one_collection(self):
        issues_schema = {'type': 'array', 'items': {'type': 'object', 'properties': {
            'title': {'type': 'string'},
        }, 'required': ['title'], 'additionalProperties': False}, 'maxItems': 5}
        input_value = {'issues': [{'title': 'One'}, {'title': 'Two'}]}
        input_schema = {'type': 'object', 'properties': {'issues': issues_schema},
                        'required': ['issues'], 'additionalProperties': False}
        output_schema = {'type': 'object', 'properties': {'copied': issues_schema},
                         'required': ['copied'], 'additionalProperties': False}

        fact, gaps = build_verified_output_assembly(
            [], {'copied': input_value['issues']}, output_schema, put_evidence,
            input_value=input_value, input_schema=input_schema)

        self.assertEqual(gaps, [])
        field = VerifiedOutputAssembly.model_validate(fact.value).fields[0]
        self.assertEqual(field.path, ['copied'])
        self.assertEqual(field.binding, {'source': 'input', 'path': ['issues']})

    def test_one_verified_read_can_supply_multiple_output_fields(self):
        read_schema = {'type': 'object', 'properties': {
            'title': {'type': 'string'}, 'body': {'type': 'string'},
        }, 'required': ['title', 'body'], 'additionalProperties': False}
        output_schema = {'type': 'object', 'properties': {'detail': read_schema},
                         'required': ['detail'], 'additionalProperties': False}
        final_output = {'detail': {'title': 'Issue title', 'body': 'Issue body'}}
        specification = ReadSpec(
            container='article.issue',
            fields={'title': ReadField(selector=':scope > h1'),
                    'body': ReadField(selector=':scope > div.body')},
            maxItems=1, outputSchema=read_schema)
        facts = []
        for index, name in enumerate(('title', 'body'), start=1):
            value = {
                'actionRef': 'a-0001', 'specification': specification.model_dump(mode='json'),
                'outputPath': ['detail', name], 'readPath': [name], 'output': final_output['detail'],
                'resultDigest': '1' * 64, 'urlDigest': '2' * 64, 'targetId': 'tab-1',
                'containerIdsDigest': '3' * 64, 'stable': True,
            }
            facts.append(ObservationFact(
                id=f'fact-read-{index}', kind='verified_natural_read', value=value,
                sourceRefs=[EvidenceRef(ref=f'fixture:read-{index}', digest=digest(value))]))
        observation = SimpleNamespace(id='o-post', facts=facts)
        assembly, gaps = build_verified_output_assembly(
            [observation], final_output, output_schema, put_evidence)

        self.assertEqual(gaps, [])
        segment = {'id': 's-a-0001', 'operation': {
            'name': 'browser.read-fields', 'specification': specification.model_dump(mode='json')},
            'outputs': [{'sourceRef': fact.id, 'schema': read_schema} for fact in facts]}
        trace = SimpleNamespace(
            observations=[observation, SimpleNamespace(id='o-done', facts=[assembly])],
            actions=[SimpleNamespace(id='a-0001', postObservationRef='o-post')],
            finalResultRef=SimpleNamespace(digest=digest(final_output)))

        compiled, issues = compile_natural_output_assembly(trace, output_schema, [segment])

        self.assertEqual(issues, [])
        self.assertEqual(compiled['fields'], [
            {'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': ['title']},
             'path': ['detail', 'title']},
            {'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': ['body']},
             'path': ['detail', 'body']},
        ])

    def test_verified_object_read_can_supply_a_scalar_root_result(self):
        output_schema = {'type': 'string'}
        final_output = 'Catalog result for alpha'
        read_schema = {'type': 'object', 'properties': {'value': output_schema},
                       'required': ['value'], 'additionalProperties': False}
        specification = ReadSpec(
            container='output[data-testid="result"]',
            fields={'value': ReadField(selector=':scope')},
            maxItems=1, outputSchema=read_schema)
        value = {
            'actionRef': 'a-0001', 'specification': specification.model_dump(mode='json'),
            'outputPath': [], 'readPath': ['value'], 'output': {'value': final_output},
            'resultDigest': '1' * 64, 'urlDigest': '2' * 64, 'targetId': 'tab-1',
            'containerIdsDigest': '3' * 64, 'stable': True,
        }
        read_fact = ObservationFact(id='fact-read', kind='verified_natural_read', value=value,
            sourceRefs=[EvidenceRef(ref='fixture:read', digest=digest(value))])
        read_observation = SimpleNamespace(id='o-read', facts=[read_fact])

        assembly, gaps = build_verified_output_assembly(
            [read_observation], final_output, output_schema, put_evidence)

        self.assertEqual(gaps, [])
        trace = SimpleNamespace(
            observations=[read_observation, SimpleNamespace(id='o-done', facts=[assembly])],
            actions=[SimpleNamespace(id='a-0001', postObservationRef='o-read')],
            finalResultRef=SimpleNamespace(digest=digest(final_output)))
        segment = {'id': 's-a-0001', 'operation': {
            'name': 'browser.read-fields', 'specification': specification.model_dump(mode='json')},
            'outputs': [{'sourceRef': read_fact.id, 'schema': read_schema}]}

        compiled, issues = compile_natural_output_assembly(trace, output_schema, [segment])

        self.assertEqual(issues, [])
        self.assertEqual(compiled['fields'], [{
            'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': ['value']}, 'path': [],
        }])

    def test_declared_count_lowers_to_data_segment_and_recomputes_from_array(self):
        issues_schema = {'type': 'array', 'items': {'type': 'object', 'properties': {
            'title': {'type': 'string'},
        }, 'required': ['title'], 'additionalProperties': False}, 'maxItems': 5}
        output_schema = {'type': 'object', 'properties': {
            'issues': issues_schema, 'issueCount': {'type': 'integer', 'minimum': 0, 'maximum': 5},
        }, 'required': ['issues', 'issueCount'], 'additionalProperties': False}
        final_output = {'issues': [{'title': 'One'}, {'title': 'Two'}], 'issueCount': 2}
        spec = SimpleNamespace(model_dump=lambda **_kwargs: {
            'contractVersion': 'bat-result-spec/v1', 'mode': 'data', 'schema': output_schema,
            'fields': [
                {'path': ['issues'], 'description': 'Issues', 'producerRef': 'read-issues'},
                {'path': ['issueCount'], 'description': 'Count', 'producerRef': 'count-issues'},
            ], 'derivations': [{'producerRef': 'count-issues', 'operation': 'count',
                'sourceProducerRef': 'read-issues', 'sourcePath': ['issues']}], 'edgeCases': [],
        })
        specification = ReadSpec(container='div.issue', fields={'title': ReadField(selector=':scope > a')},
                                 maxItems=5, outputSchema=issues_schema)
        value = {'actionRef': 'a-0001', 'specification': specification.model_dump(mode='json'),
                 'outputPath': ['issues'], 'readPath': [], 'output': final_output['issues'],
                 'resultDigest': '1' * 64, 'urlDigest': '2' * 64, 'targetId': 'tab-1',
                 'containerIdsDigest': '3' * 64, 'stable': True}
        read_fact = ObservationFact(id='fact-read', kind='verified_natural_read', value=value,
            sourceRefs=[EvidenceRef(ref='fixture:read', digest=digest(value))])
        read_observation = SimpleNamespace(id='o-read', facts=[read_fact])
        assembly, gaps = build_verified_output_assembly(
            [read_observation], final_output, output_schema, put_evidence, result_spec=spec)
        self.assertEqual(gaps, [])
        trace = SimpleNamespace(observations=[read_observation, SimpleNamespace(id='o-done', facts=[assembly])],
            actions=[SimpleNamespace(id='a-0001', postObservationRef='o-read')],
            finalResultRef=SimpleNamespace(digest=digest(final_output)))
        read_segment = {'id': 's-a-0001', 'kind': 'deterministic',
            'operation': {'name': 'browser.read-fields', 'specification': specification.model_dump(mode='json')},
            'outputs': [{'sourceRef': read_fact.id, 'schema': issues_schema}], 'bindings': [],
            'target': None, 'postconditions': [], 'expectedEffect': {'kind': 'read'}, 'proofRefs': []}

        segments, issues = compile_result_derivation_segments(spec, trace, [read_segment], output_schema)
        compiled, output_issues = compile_natural_output_assembly(trace, output_schema, segments)
        binding, binding_issues = compile_result_binding(spec, compiled, output_schema)

        self.assertEqual([*issues, *output_issues, *binding_issues], [])
        self.assertEqual([segment['id'] for segment in segments], ['s-a-0001', 'result-count-issues'])
        self.assertEqual(segments[1]['operation']['dataOperation'], 'count')
        self.assertEqual(binding['assignments'][1], {
            'to': ['issueCount'], 'from': {'source': 'node', 'nodeId': 'result-count-issues', 'path': []},
            'producerRef': 'count-issues',
        })


if __name__ == '__main__':
    unittest.main()
