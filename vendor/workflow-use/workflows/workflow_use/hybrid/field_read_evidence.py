"""Bind one bat_read_fields action to the record appended at its fixed callback position."""
import json

from .evidence import digest
from .field_read_params import FieldReadToolParams, expand_field_read_params
from .natural_reads import VerifiedNaturalRead, value_at_path


class FieldReadEvidenceFailure(ValueError):
    def __init__(self, reason, *, kind='invalid_source', resolution='reject_trace'):
        super().__init__(reason)
        self.reason = reason
        self.kind = kind
        self.resolution = resolution


def verified_field_read(*, records, start, arguments, results, result_ref, action_ref):
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
    try:
        params = FieldReadToolParams.model_validate(arguments)
    except Exception as error:
        raise FieldReadEvidenceFailure('natural_field_read_mapping_invalid') from error
    record = appended[0]
    if record.parameters.model_dump(mode='json') != params.model_dump(mode='json'):
        raise FieldReadEvidenceFailure('natural_field_read_mapping_mismatch')
    validate_record_mapping(record)
    try:
        actual = json.loads(result.extracted_content or '')
        recorded = value_at_path(record.output, record.mapping.readPath)
    except Exception as error:
        raise FieldReadEvidenceFailure('natural_field_read_result_invalid') from error
    if digest(actual) != digest(recorded):
        raise FieldReadEvidenceFailure('natural_field_read_result_mismatch')
    return VerifiedNaturalRead(
        actionRef=action_ref,
        specification=record.mapping.specification,
        outputPath=record.mapping.outputPath,
        readPath=record.mapping.readPath,
        output=record.output,
        resultDigest=result_ref.digest,
        urlDigest=digest(record.pageIdentity.url),
        targetId=record.pageIdentity.targetId,
        containerIdsDigest=record.containerDigest,
        stable=True,
    )


def validate_record_mapping(record):
    mapping = record.mapping
    schema = mapping.specification.outputSchema
    if mapping.readPath == []:
        target = schema
    elif (mapping.readPath == ['value'] and schema.get('type') == 'object'
          and isinstance(schema.get('properties'), dict)):
        target = schema['properties'].get('value')
    else:
        target = None
    try:
        expected = expand_field_read_params(record.parameters, target)
    except Exception as error:
        raise FieldReadEvidenceFailure('natural_field_read_mapping_invalid') from error
    if expected.model_dump(mode='json') != mapping.model_dump(mode='json'):
        raise FieldReadEvidenceFailure('natural_field_read_mapping_mismatch')
