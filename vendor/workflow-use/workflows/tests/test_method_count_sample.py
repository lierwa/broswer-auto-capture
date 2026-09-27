"""Only ResultSpec count derivations of proven samples receive a preparation lower-bound exemption."""
import copy
import unittest
from types import SimpleNamespace

from jsonschema import ValidationError
from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import _business_result
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.evidence import NormalizedObservation, digest
from workflow_use.hybrid.method_completion import complete_from_read_refs
from workflow_use.hybrid.method_read_evidence import verified_method_read
from workflow_use.hybrid.method_read_tool import MethodReadToolParams, expand_method_read_params
from workflow_use.hybrid.natural_output import build_verified_output_assembly, compile_natural_output_assembly
from test_method_read_evidence import fixture as read_fixture, refresh_result
from test_method_source_compile import method_source, fact, reference


def count_source(minimum=50, maximum=200, count_bounds=None):
    request, registry, collection, _read = method_source()
    collection = {**collection, 'minItems': minimum, 'maxItems': maximum}
    schema = {'type': 'object', 'properties': {'records': collection,
        'count': {'type': 'integer', 'minimum': minimum, 'maximum': maximum, **(count_bounds or {})}},
        'required': ['records', 'count'], 'additionalProperties': False}
    spec = type(request.plan.resultSpec).model_validate({
        'contractVersion': 'bat-result-spec/v1', 'mode': 'data', 'schema': schema,
        'fields': [{'path': ['records'], 'description': 'Records', 'producerRef': 'records'},
                   {'path': ['count'], 'description': 'Record count', 'producerRef': 'count'}],
        'derivations': [{'producerRef': 'count', 'operation': 'count',
                         'sourceProducerRef': 'records', 'sourcePath': ['records']}], 'edgeCases': []})
    case = read_fixture()
    record = case['records'].records[0]
    params = MethodReadToolParams(outputPath=['records'], container='.item', fields={'title': {'selector': 'a'}})
    record.parameters = params
    record.mapping = expand_method_read_params(params, schema)
    case['records'].output_schema = schema
    case['arguments'] = params.model_dump(mode='json')
    refresh_result(case)
    output = complete_from_read_refs(case['records'], ['r1'], schema, spec)
    read = verified_method_read(**case)
    raw = request.model_dump(mode='json', by_alias=True)
    raw['plan']['resultSpec'] = spec.model_dump(mode='json', by_alias=True)
    raw['plan']['outputSchemaDigest'] = digest(schema)
    raw['plan']['digest'] = digest({key: value for key, value in raw['plan'].items() if key != 'digest'})
    raw['trace']['actions'][0]['args'] = case['arguments']
    raw['trace']['observations'][1]['facts'][-1] = fact(
        'verified_natural_read', read.model_dump(mode='json')).model_dump(mode='json')
    observations = [NormalizedObservation.model_validate(value) for value in raw['trace']['observations']]
    assembly, issues = build_verified_output_assembly(observations, output, schema,
        lambda _kind, value: reference(value), selected_read_refs=['r1'], result_spec=spec)
    if issues:
        raise AssertionError(issues)
    raw['trace']['observations'][3]['facts'][-1] = assembly.model_dump(mode='json')
    raw['trace']['finalResultRef'] = reference(output).model_dump(mode='json')
    raw['trace']['digest'] = digest({key: value for key, value in raw['trace'].items() if key != 'digest'})
    return type(request).model_validate(raw), registry, schema, spec, output, case


def business_result(schema, spec, output, records):
    model, unwrap = output_model_for(schema, 'CountSampleOutput')
    history = SimpleNamespace(is_done=lambda: True, is_successful=lambda: True,
                              get_structured_output=lambda chosen: chosen.model_validate(output))
    return _business_result(history, False, model, unwrap, schema, records, spec)


class MethodCountSampleTests(unittest.TestCase):
    def test_host_count_sample_survives_source_handoff_only_with_same_result_spec(self):
        _request, _registry, schema, spec, output, case = count_source()
        original = copy.deepcopy(schema)
        self.assertEqual(output['count'], 3)
        self.assertEqual(business_result(schema, spec, output, case['records'])[2], [])
        self.assertTrue(business_result(schema, None, output, case['records'])[2])
        self.assertEqual(schema, original)

    def test_forged_count_and_upper_bound_remain_rejected(self):
        request, _registry, schema, spec, output, case = count_source()
        forged = {**output, 'count': 4}
        self.assertTrue(business_result(schema, spec, forged, case['records'])[2])
        invented = {'records': [*output['records'], {'title': 'invented'}], 'count': 4}
        self.assertTrue(business_result(schema, spec, invented, case['records'])[2])
        self.assertTrue(build_verified_output_assembly(request.trace.observations, forged, schema,
            lambda _kind, value: reference(value), selected_read_refs=['r1'], result_spec=spec)[1])
        limited = copy.deepcopy(schema)
        limited['properties']['count'] = {'type': 'integer', 'minimum': 0, 'maximum': 2}
        limited_spec = spec.model_copy(update={'schemaValue': limited})
        with self.assertRaises(ValidationError):
            complete_from_read_refs(case['records'], ['r1'], limited, limited_spec)

    def test_full_compiler_reconstructs_count_sample_but_preserves_runtime_contract(self):
        request, registry, schema, spec, _output, _case = count_source()
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        count = next(segment for segment in compiled.segments if segment['id'] == 'result-count')
        self.assertEqual(count['operation']['dataOperation'], 'count')
        self.assertEqual(count['outputs'][0]['schema'], schema['properties']['count'])
        self.assertEqual(compiled.resultBinding['schema'], schema)
        self.assertTrue(compile_natural_output_assembly(request.trace, schema, compiled.segments)[1])
        self.assertEqual(compile_natural_output_assembly(
            request.trace, schema, compiled.segments, result_spec=spec)[1], [])

    def test_representative_count_does_not_admit_impossible_formal_collection(self):
        request, registry, schema, _spec, output, _case = count_source(1000, 1000)
        self.assertEqual(output['count'], 3)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertIn('natural_output_cardinality_disjoint', [issue['reason'] for issue in compiled.gaps])
        self.assertEqual(compiled.controlGraph['entry'], '')

    def test_known_complete_collection_and_derived_count_must_satisfy_final_bounds(self):
        cases = [(200, 250, None, 'natural_output_collection_incomplete'),
                 (50, 200, {'minimum': 120}, 'natural_output_count_cardinality_mismatch'),
                 (50, 200, {'maximum': 90}, 'natural_output_count_cardinality_mismatch')]
        for minimum, maximum, bounds, reason in cases:
            with self.subTest(reason=reason, count_bounds=bounds):
                request, registry, schema, _spec, _output, _case = count_source(minimum, maximum, bounds)
                compiled = compile_request(request, registry, output_schema=schema)
                self.assertIn(reason, [issue['reason'] for issue in compiled.gaps])
                self.assertEqual(compiled.controlGraph['entry'], '')


if __name__ == '__main__':
    unittest.main()
