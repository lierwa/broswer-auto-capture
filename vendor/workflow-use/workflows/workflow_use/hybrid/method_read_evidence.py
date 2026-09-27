"""Bind a host-verified read method and bounded sample to one native action result."""
import json
import re

from jsonschema import Draft202012Validator

from .evidence import digest
from .field_read_evidence import FieldReadEvidenceFailure
from .method_read_tool import MethodReadRecord, MethodReadToolParams, expand_method_read_params, method_read_model_result
from .natural_reads import VerifiedNaturalRead, schema_at_path, value_at_path
from .read import ReadSampleCoverage


def verified_method_read(*, records, start, arguments, results, result_ref, action_ref):
    if records is None or type(start) is not int or start < 0 or start > len(records.records):
        raise FieldReadEvidenceFailure('natural_field_read_record_owner_missing')
    appended = records.records[start:]
    if len(results) != 1:
        raise FieldReadEvidenceFailure('natural_field_read_result_count_invalid')
    result = results[0]
    if result.error:
        if appended:
            raise FieldReadEvidenceFailure('natural_field_read_failed_with_record')
        return None
    if len(appended) != 1:
        reason = 'natural_field_read_record_missing' if not appended else 'natural_field_read_record_multiple'
        raise FieldReadEvidenceFailure(reason)
    if result_ref is None:
        raise FieldReadEvidenceFailure('natural_field_read_result_reference_missing')
    record = _validated_record(appended[0], arguments, records, start)
    if record.readRef != 'r' + str(start + 1):
        raise FieldReadEvidenceFailure('natural_field_read_reference_mismatch')
    _validate_result_payload(record, result.extracted_content)
    _validate_sample(record)
    sample = record.sample
    return VerifiedNaturalRead(
        actionRef=action_ref, specification=record.mapping.specification,
        outputPath=record.mapping.outputPath, readPath=record.mapping.readPath,
        output=sample.output, resultDigest=result_ref.digest,
        urlDigest=digest(sample.pageIdentity['url']), targetId=sample.pageIdentity['targetId'],
        containerIdsDigest=sample.containerIdsDigest, stable=True, readRef=record.readRef,
        coverage=sample.coverage, documentRootId=sample.documentRootId,
    )


def _validated_record(record, arguments, records, start):
    try:
        params = MethodReadToolParams.model_validate(arguments)
        checked = MethodReadRecord.model_validate(record.model_dump(mode='json'))
        expanded, expected = records.resolve(params, before=start)
    except Exception as error:
        raise FieldReadEvidenceFailure('natural_field_read_mapping_invalid') from error
    if (digest(checked.parameters) != digest(expanded) or digest(expected) != digest(checked.mapping)):
        raise FieldReadEvidenceFailure('natural_field_read_mapping_mismatch')
    return checked


def _validate_result_payload(record, content):
    expected = method_read_model_result(record)
    try:
        actual = json.loads(content or '', object_pairs_hook=_unique_object)
        matches = digest(actual) == digest(expected)
    except Exception as error:
        raise FieldReadEvidenceFailure('natural_field_read_result_invalid') from error
    if not matches:
        raise FieldReadEvidenceFailure('natural_field_read_result_mismatch')


def _unique_object(pairs):
    output = {}
    for key, value in pairs:
        if key in output:
            raise ValueError('duplicate_result_property')
        output[key] = value
    return output


def _validate_sample(record):
    sample = record.sample
    if (sample.specificationDigest != digest(record.mapping.specification)
            or sample.outputDigest != digest(sample.output)):
        raise FieldReadEvidenceFailure('natural_field_read_sample_digest_mismatch')
    if (set(sample.pageIdentity) != {'targetId', 'url'}
            or not sample.pageIdentity['targetId'] or not sample.pageIdentity['url']):
        raise FieldReadEvidenceFailure('natural_field_read_sample_identity_invalid')
    _validate_sample_output(record.mapping.specification, sample.output, sample.coverage, sample.documentRootId,
                            record.mapping.readPath)


def _validate_sample_output(specification, output, coverage, document_root_id, read_path):
    try:
        coverage = ReadSampleCoverage.model_validate(coverage.model_dump(mode='json'))
        Draft202012Validator(specification.outputSchema).validate(output)
        selected = value_at_path(output, read_path)
        source = schema_at_path(specification.outputSchema, read_path)
    except Exception as error:
        raise FieldReadEvidenceFailure('natural_field_read_sample_invalid') from error
    maximum = source['maxItems'] if source.get('type') == 'array' else specification.maxItems
    expected_count = min(coverage.total, maximum, 3)
    actual_count = len(selected) if isinstance(selected, list) else 1
    if (coverage.sampleLimit != 3 or coverage.sampled != expected_count
            or actual_count != coverage.sampled or coverage.total > maximum
            or coverage.runtimeTruncated or type(document_root_id) is not int or document_root_id <= 0):
        raise FieldReadEvidenceFailure('natural_field_read_sample_coverage_mismatch')
    # WHY：空集合只证明当前没有匹配，不能把未经真实字段样本验证的方法作为可编译读取。
    if coverage.sampled == 0:
        raise FieldReadEvidenceFailure('natural_read_empty_sample_unproven',
                                      kind='missing_effect_proof', resolution='collect_evidence')


def validate_method_read_mapping(value, output_schema, action, trace=None):
    if action.name != 'bat_read_fields':
        raise ValueError('verified_read_action_mismatch')
    try:
        params = MethodReadToolParams.model_validate(action.args)
        if params.readRef is None:
            expected = expand_method_read_params(params, output_schema)
        else:
            from .method_read_reference import referenced_method_mapping
            expected = referenced_method_mapping(params.readRef, action, trace, output_schema)
    except Exception as error:
        raise ValueError('verified_read_mapping_invalid') from error
    if (expected.outputPath != value.outputPath or expected.readPath != value.readPath
            or digest(expected.specification) != digest(value.specification)):
        raise ValueError('verified_read_mapping_mismatch')
    if (not isinstance(value.readRef, str) or re.fullmatch(r'r[1-9][0-9]*', value.readRef) is None
            or value.stable is not True):
        raise ValueError('verified_read_method_reference_invalid')
    _validate_sample_output(value.specification, value.output, value.coverage, value.documentRootId, value.readPath)
