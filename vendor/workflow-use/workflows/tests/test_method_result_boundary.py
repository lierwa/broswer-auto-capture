"""A sampled method cannot make an impossible executable result binding valid."""
import copy
import unittest

from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.evidence import digest
from test_method_source_compile import method_source, reference


def bounded_source(**bounds):
    request, registry, schema, _read = method_source()
    schema = {**schema, **bounds}
    raw = request.model_dump(mode='json', by_alias=True)
    raw['plan']['resultSpec']['schema'] = schema
    raw['plan']['outputSchemaDigest'] = digest(schema)
    raw['plan']['digest'] = digest({key: value for key, value in raw['plan'].items() if key != 'digest'})
    for observation in raw['trace']['observations']:
        for fact in observation['facts']:
            if fact['kind'] == 'verified_output_assembly':
                fact['value']['schema'] = schema
                fact['sourceRefs'] = [reference(fact['value']).model_dump(mode='json')]
                fact['id'] = 'fact-' + digest(fact['value'])
    raw['trace']['digest'] = digest({key: value for key, value in raw['trace'].items() if key != 'digest'})
    return type(request).model_validate(raw), registry, schema


class MethodResultBoundaryTests(unittest.TestCase):
    def assert_blocked(self, compiled, reason):
        issues = [issue for issue in compiled.gaps if issue['reason'] == reason]
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]['code'], 'missing_effect_proof')
        self.assertEqual(issues[0]['actionRefs'], ['a-0001'])
        self.assertEqual(compiled.controlGraph['entry'], '')
        self.assertIsNone(compiled.outputAssembly)
        self.assertIsNone(compiled.resultBinding)

    def test_full_compiler_rejects_disjoint_read_and_result_cardinality(self):
        request, registry, schema = bounded_source(minItems=1000, maxItems=1000)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assert_blocked(compiled, 'natural_output_cardinality_disjoint')

    def test_full_compiler_requires_selection_when_known_dom_exceeds_result(self):
        request, registry, schema = bounded_source(maxItems=10)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assert_blocked(compiled, 'natural_output_selection_required')

    def test_intersecting_runtime_ranges_preserve_final_contract(self):
        request, registry, schema = bounded_source(minItems=50, maxItems=200)
        original = copy.deepcopy(schema)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(compiled.segments[0]['operation']['specification']['maxItems'], 300)
        self.assertEqual(compiled.resultBinding['schema'], original)
        self.assertEqual(compiled.resultBinding['assignments'][0]['from'],
                         {'source': 'node', 'nodeId': 'a-0001', 'path': []})
        self.assertEqual(schema, original)


if __name__ == '__main__':
    unittest.main()
