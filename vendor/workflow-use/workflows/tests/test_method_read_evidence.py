"""Method evidence requires one host-owned sample, exact result binding, and a live field witness."""
import copy
import json
import unittest
from types import SimpleNamespace

from browser_use.agent.views import ActionResult

from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.field_read_evidence import FieldReadEvidenceFailure
from workflow_use.hybrid.method_read_evidence import verified_method_read, validate_method_read_mapping
from workflow_use.hybrid.method_read_tool import (
    MethodReadRecord, MethodReadRecords, MethodReadToolParams, expand_method_read_params,
    method_read_model_result,
)
from workflow_use.hybrid.read_sampling import ReadSample


SCHEMA = {'type': 'array', 'items': {'type': 'object',
          'properties': {'title': {'type': 'string'}}, 'required': ['title'], 'additionalProperties': False},
          'minItems': 1000, 'maxItems': 1000}
REF = EvidenceRef(ref='fixture:result', digest='d' * 64)


def payload(record):
    return method_read_model_result(record)


def fixture():
    params = MethodReadToolParams(outputPath=[], container='.item', fields={'title': {'selector': 'a'}})
    mapping = expand_method_read_params(params, SCHEMA)
    output = [{'title': 'A'}, {'title': 'B'}, {'title': 'C'}]
    sample = ReadSample(specificationDigest=digest(mapping.specification), output=output,
        outputDigest=digest(output), pageIdentity={'targetId': 'tab-1', 'url': 'https://example.test/list'},
        documentRootId=12, containerIdsDigest=digest([1, 2, 3]),
        coverage={'scope': 'current_dom_matches', 'total': 100, 'sampled': 3,
                  'sampleLimit': 3, 'runtimeTruncated': False})
    record = MethodReadRecord(readRef='r1', parameters=params, mapping=mapping, sample=sample)
    records = MethodReadRecords(SCHEMA)
    records.records.append(record)
    return {'records': records, 'start': 0, 'arguments': params.model_dump(mode='json'),
            'results': [ActionResult(extracted_content=json.dumps(payload(record)))],
            'result_ref': REF, 'action_ref': 'a-0001'}


def refresh_result(case):
    case['results'] = [ActionResult(extracted_content=json.dumps(payload(case['records'].records[-1])))]


class MethodReadEvidenceTests(unittest.TestCase):
    def test_host_sample_becomes_current_method_evidence_without_final_count_validation(self):
        case = fixture()
        verified = verified_method_read(**case)
        record = case['records'].records[0]
        self.assertEqual(verified.output, record.sample.output)
        self.assertEqual(verified.readRef, 'r1')
        self.assertEqual(verified.resultDigest, REF.digest)
        self.assertEqual(verified.urlDigest, digest(record.sample.pageIdentity['url']))
        self.assertEqual(verified.containerIdsDigest, record.sample.containerIdsDigest)
        self.assertEqual(verified.documentRootId, 12)
        self.assertEqual(verified.coverage.total, 100)
        self.assertEqual(verified.specification.maxItems, 300)
        validate_method_read_mapping(verified, SCHEMA,
                                     SimpleNamespace(name='bat_read_fields', args=case['arguments']))

    def test_callback_position_requires_exactly_one_success_record(self):
        for mutation, reason in [
            (lambda case: case.update(start=-1), 'record_owner_missing'),
            (lambda case: case.update(start=True), 'record_owner_missing'),
            (lambda case: case.update(results=[]), 'result_count_invalid'),
            (lambda case: case['records'].records.clear(), 'record_missing'),
            (lambda case: case['records'].records.append(case['records'].records[0]), 'record_multiple'),
            (lambda case: case.update(result_ref=None), 'result_reference_missing'),
        ]:
            case = fixture()
            mutation(case)
            with self.subTest(reason=reason), self.assertRaisesRegex(FieldReadEvidenceFailure, reason):
                verified_method_read(**case)

    def test_failed_action_must_not_append_a_record(self):
        case = fixture()
        case['results'] = [ActionResult(error='read_collection_limit')]
        with self.assertRaisesRegex(FieldReadEvidenceFailure, 'failed_with_record'):
            verified_method_read(**case)
        case['records'].records.clear()
        self.assertIsNone(verified_method_read(**case))

    def test_parameters_mapping_and_reference_are_revalidated(self):
        for mutation, reason in [
            (lambda case: case['arguments'].update(container='.other'), 'mapping_mismatch'),
            (lambda case: setattr(case['records'].records[0].mapping.specification, 'maxItems', 4),
             'mapping_mismatch'),
            (lambda case: setattr(case['records'].records[0], 'readRef', 'r2'), 'reference_mismatch'),
        ]:
            case = fixture()
            mutation(case)
            with self.subTest(reason=reason), self.assertRaisesRegex(FieldReadEvidenceFailure, reason):
                verified_method_read(**case)

    def test_all_tool_result_fields_must_equal_host_record(self):
        for key, replacement in [('readRef', 'r99'), ('outputPath', ['other']),
                                 ('representative', []), ('coverage', {}),
                                 ('coverageNote', 'complete collection'), ('extra', True)]:
            case = fixture()
            body = payload(case['records'].records[0])
            body[key] = replacement
            case['results'] = [ActionResult(extracted_content=json.dumps(body))]
            with self.subTest(key=key), self.assertRaisesRegex(FieldReadEvidenceFailure, 'result_mismatch'):
                verified_method_read(**case)
        case = fixture()
        case['results'] = [ActionResult(extracted_content='{"readRef":"r1","readRef":"r2"}')]
        with self.assertRaisesRegex(FieldReadEvidenceFailure, 'result_invalid'):
            verified_method_read(**case)

    def test_sample_digests_identity_and_coverage_cannot_be_forged(self):
        for mutate, reason in [
            (lambda sample: setattr(sample, 'specificationDigest', '0' * 64), 'sample_digest_mismatch'),
            (lambda sample: setattr(sample, 'outputDigest', '0' * 64), 'sample_digest_mismatch'),
            (lambda sample: sample.pageIdentity.update(url=''), 'sample_identity_invalid'),
            (lambda sample: setattr(sample, 'documentRootId', 0), 'sample_coverage_mismatch'),
            (lambda sample: setattr(sample.coverage, 'sampled', 2), 'sample_coverage_mismatch'),
            (lambda sample: setattr(sample.coverage, 'runtimeTruncated', True), 'sample_coverage_mismatch'),
            (lambda sample: setattr(sample.coverage, 'sampleLimit', 300), 'sample_coverage_mismatch'),
            (lambda sample: setattr(sample.coverage, 'total', 400), 'sample_coverage_mismatch'),
        ]:
            case = fixture()
            mutate(case['records'].records[0].sample)
            refresh_result(case)
            with self.subTest(reason=reason), self.assertRaisesRegex(FieldReadEvidenceFailure, reason):
                verified_method_read(**case)

    def test_empty_stable_scope_is_not_field_projection_proof(self):
        case = fixture()
        sample = case['records'].records[0].sample
        sample.output, sample.outputDigest = [], digest([])
        sample.coverage.total, sample.coverage.sampled = 0, 0
        refresh_result(case)
        with self.assertRaises(FieldReadEvidenceFailure) as failure:
            verified_method_read(**case)
        self.assertEqual(failure.exception.reason, 'natural_read_empty_sample_unproven')
        self.assertEqual(failure.exception.kind, 'missing_effect_proof')
        self.assertEqual(failure.exception.resolution, 'collect_evidence')

    def test_compiler_rechecks_sample_shape_and_runtime_scope(self):
        case = fixture()
        original = verified_method_read(**case)
        action = SimpleNamespace(name='bat_read_fields', args=case['arguments'])
        mutations = [lambda value: setattr(value.coverage, 'runtimeTruncated', True),
                     lambda value: setattr(value.coverage, 'sampled', 1),
                     lambda value: setattr(value, 'output', [{'title': 42}]),
                     lambda value: setattr(value, 'coverage', None),
                     lambda value: setattr(value, 'readRef', None),
                     lambda value: setattr(value, 'documentRootId', None),
                     lambda value: setattr(value.specification, 'container', '.wrong')]
        for mutate in mutations:
            candidate = copy.deepcopy(original)
            mutate(candidate)
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                validate_method_read_mapping(candidate, SCHEMA, action)


if __name__ == '__main__':
    unittest.main()
