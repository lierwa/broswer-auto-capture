"""An exploratory complete DOM query must not become a duplicate final-output producer."""

import unittest
from types import SimpleNamespace

from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_output import build_verified_output_assembly, compile_natural_output_assembly
from workflow_use.hybrid.read import ReadField, ReadSpec


def reference(value):
    value_digest = digest(value)
    return EvidenceRef(ref='fixture:' + value_digest, digest=value_digest)


def read_fact(action, specification, output):
    value = {'actionRef': action, 'specification': specification.model_dump(mode='json'),
             'outputPath': [], 'readPath': [], 'output': output,
             'resultDigest': '1' * 64, 'urlDigest': '2' * 64, 'targetId': 'tab-1',
             'containerIdsDigest': '3' * 64, 'stable': True}
    return ObservationFact(id='fact-' + action, kind='verified_natural_read', value=value,
                           sourceRefs=[reference(value)])


class NaturalOutputScopeTest(unittest.TestCase):
    def test_complete_scope_query_does_not_duplicate_paired_result_read(self):
        schema = {'type': 'array', 'maxItems': 5, 'items': {'type': 'object',
                  'properties': {'title': {'type': 'string'}, 'url': {'type': 'string'}},
                  'required': ['title', 'url'], 'additionalProperties': False}}
        output = [{'title': 'First', 'url': 'https://example.test/1'},
                  {'title': 'Second', 'url': 'https://example.test/2'}]
        query_schema = {'type': 'array', 'maxItems': 5, 'items': {'type': 'object',
                        'properties': {'text': {'type': 'string'}},
                        'required': ['text'], 'additionalProperties': False}}
        query_spec = ReadSpec(container='main > article.row',
                              fields={'text': ReadField(selector=':scope > a')},
                              maxItems=5, outputSchema=query_schema)
        result_spec = ReadSpec(container='main > article.row',
            fields={'title': ReadField(selector=':scope > a'),
                    'url': ReadField(selector=':scope > a', attribute='href')},
            maxItems=5, outputSchema=schema)
        query = read_fact('a-query', query_spec, [{'text': 'First'}, {'text': 'Second'}])
        result = read_fact('a-extract', result_spec, output)
        observations = [SimpleNamespace(id='o-query', facts=[query]),
                        SimpleNamespace(id='o-extract', facts=[result])]

        assembly, gaps = build_verified_output_assembly(
            observations, output, schema, lambda _kind, value: reference(value))

        self.assertEqual(gaps, [])
        self.assertEqual([field['binding']['nodeId'] for field in assembly.value['fields']], ['a-extract'])
        segment = {'id': 's-a-extract', 'operation': {'name': 'browser.read-fields'},
                   'outputs': [{'sourceRef': result.id, 'schema': schema}]}
        trace = SimpleNamespace(observations=[*observations,
            SimpleNamespace(id='o-done', facts=[assembly])],
            actions=[SimpleNamespace(id='a-query', postObservationRef='o-query'),
                     SimpleNamespace(id='a-extract', postObservationRef='o-extract')],
            finalResultRef=reference(output))

        compiled, issues = compile_natural_output_assembly(trace, schema, [segment])

        self.assertEqual(issues, [])
        self.assertEqual(compiled['fields'], [
            {'binding': {'source': 'node', 'nodeId': 'a-extract', 'path': []}, 'path': []}])


if __name__ == '__main__':
    unittest.main()
