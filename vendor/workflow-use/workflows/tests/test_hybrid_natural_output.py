"""Natural output assembly binds only verified dynamic reads, never final sample constants."""
import copy
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_output import build_verified_output_assembly, compile_natural_output_assembly

PAGE_SCHEMA = {'type': 'object', 'properties': {'count': {'type': 'integer'}},
               'required': ['count'], 'additionalProperties': False}
REPORT_WRAPPER = {'type': 'object', 'properties': {'value': {'type': 'string'}},
                  'required': ['value'], 'additionalProperties': False}
OUTPUT_SCHEMA = {'type': 'object', 'properties': {'page': PAGE_SCHEMA, 'report': {'type': 'string'}},
                 'required': ['page', 'report'], 'additionalProperties': False}
FINAL_OUTPUT = {'page': {'count': 2}, 'report': 'complete'}


def reference(name, value):
    return EvidenceRef(ref='fixture:' + name, digest=digest(value))


def specification(name, schema):
    return {'container': '.result', 'fields': {name: {'selector': '.' + name, 'attribute': None,
            'valueType': 'integer' if name == 'count' else 'string'}},
            'maxItems': 2, 'maxInputBytes': 4000, 'outputSchema': schema}


def read_fact(action, output_path, read_path, output, schema):
    value = {'actionRef': action, 'specification': specification('count' if not read_path else 'value', schema),
             'outputPath': output_path, 'readPath': read_path, 'output': output,
             'resultDigest': '1' * 64, 'urlDigest': '2' * 64, 'targetId': 'tab-1',
             'containerIdsDigest': '3' * 64, 'stable': True}
    return ObservationFact(id='read-' + action, kind='verified_natural_read', value=value,
                           sourceRefs=[reference('read-' + action, value)])


def fixture():
    reads = [read_fact('a-0001', ['page'], [], {'count': 2}, PAGE_SCHEMA),
             read_fact('a-0002', ['report'], ['value'], {'value': 'complete'}, REPORT_WRAPPER)]
    observations = [SimpleNamespace(id=f'o-000{index + 1}', facts=[fact]) for index, fact in enumerate(reads)]
    actions = [SimpleNamespace(id=f'a-000{index + 1}', postObservationRef=observations[index].id)
               for index in range(2)]
    segments = [{'id': 's-' + action.id, 'operation': {'name': 'browser.read-fields'},
                 'outputs': [{'schema': fact.value['specification']['outputSchema'], 'sourceRef': fact.id}]}
                for action, fact in zip(actions, reads, strict=True)]
    return reads, observations, actions, segments


def put_evidence(kind, value):
    return reference(kind, value)


class NaturalOutputTests(unittest.TestCase):
    def test_two_verified_dynamic_reads_cover_and_compile_the_final_object(self):
        _reads, observations, actions, segments = fixture()
        fact, gaps = build_verified_output_assembly(observations, FINAL_OUTPUT, OUTPUT_SCHEMA, put_evidence)
        trace = SimpleNamespace(observations=[*observations, SimpleNamespace(id='o-0003', facts=[fact])],
                                actions=actions, finalResultRef=reference('final', FINAL_OUTPUT))

        assembly, compile_gaps = compile_natural_output_assembly(trace, OUTPUT_SCHEMA, segments)

        self.assertEqual(gaps, [])
        self.assertEqual(compile_gaps, [])
        self.assertEqual(assembly['sourceRef'], fact.id)
        self.assertEqual([field['binding']['source'] for field in assembly['fields']], ['node', 'node'])
        self.assertEqual([field['binding']['nodeId'] for field in assembly['fields']], ['a-0001', 'a-0002'])
        self.assertNotIn('constant', str(assembly))

    def test_missing_page_report_or_all_read_facts_is_incomplete(self):
        _reads, observations, _actions, _segments = fixture()
        for retained in (observations[:1], observations[1:], []):
            with self.subTest(count=len(retained)):
                fact, gaps = build_verified_output_assembly(retained, FINAL_OUTPUT, OUTPUT_SCHEMA, put_evidence)
                self.assertIsNone(fact)
                self.assertEqual([item.reason for item in gaps], ['natural_output_assembly_incomplete'])

    def test_constant_duplicate_path_and_tampered_read_are_rejected(self):
        reads, observations, actions, segments = fixture()
        assembly_fact, _ = build_verified_output_assembly(observations, FINAL_OUTPUT, OUTPUT_SCHEMA, put_evidence)
        for mutation in ('constant', 'duplicate', 'tampered_read'):
            facts = copy.deepcopy(reads)
            value = copy.deepcopy(assembly_fact.value)
            if mutation == 'constant':
                value['fields'][0]['binding'] = {'source': 'constant', 'value': {'count': 2}}
            elif mutation == 'duplicate':
                value['fields'][1]['path'] = ['page']
            else:
                facts[0].value['output']['count'] = 99
            candidate = ObservationFact(id=assembly_fact.id, kind=assembly_fact.kind, value=value,
                                        sourceRefs=[reference('assembly-' + mutation, value)])
            changed_observations = [SimpleNamespace(id=f'o-000{index + 1}', facts=[fact])
                                    for index, fact in enumerate(facts)]
            trace = SimpleNamespace(observations=[*changed_observations, SimpleNamespace(id='o-0003', facts=[candidate])],
                actions=actions, finalResultRef=reference('final', FINAL_OUTPUT))

            compiled, gaps = compile_natural_output_assembly(trace, OUTPUT_SCHEMA, segments)

            self.assertIsNone(compiled)
            self.assertEqual([item.reason for item in gaps], ['natural_output_assembly_invalid'])


if __name__ == '__main__':
    unittest.main()
