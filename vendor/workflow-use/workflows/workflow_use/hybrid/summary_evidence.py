"""Bind one bat_summarize action to the record appended at its fixed callback position."""
from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue

from .evidence import Contract, digest
from .summary_context import SummaryCompletedFact, SummarySource
from .summary_tool import SummaryToolParams


class SummaryEvidenceFailure(ValueError):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


class VerifiedNaturalSummary(Contract):
    actionRef: str = Field(pattern=r'^a-\d{4,}$')
    outputPath: list[str | int]
    outputSchema: dict[str, JsonValue]
    inputSchema: dict[str, JsonValue]
    sources: list[SummarySource] = Field(min_length=1, max_length=100)
    completedFacts: list[SummaryCompletedFact] = Field(max_length=300)
    runtimeInputDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    summary: str
    resultDigest: str = Field(pattern=r'^[a-f0-9]{64}$')


def verified_summary(*, records, start, arguments, results, result_ref, action_ref):
    if records is None or type(start) is not int or start < 0 or start > len(records.records):
        raise SummaryEvidenceFailure('summary_record_owner_missing')
    appended = records.records[start:]
    if len(results) != 1:
        raise SummaryEvidenceFailure('summary_result_count_invalid')
    result = results[0]
    if result.error:
        if appended:
            raise SummaryEvidenceFailure('summary_failed_with_record')
        return None
    if len(appended) != 1:
        reason = 'summary_record_missing' if not appended else 'summary_record_multiple'
        raise SummaryEvidenceFailure(reason)
    if result_ref is None:
        raise SummaryEvidenceFailure('summary_result_reference_missing')
    try:
        params = SummaryToolParams.model_validate(arguments)
        record = appended[0]
        if record.params != params or result.extracted_content != record.summary:
            raise ValueError('summary_result_mismatch')
        Draft202012Validator(record.outputSchema).validate(record.summary)
        input_schema = record.context.input_schema()
        Draft202012Validator.check_schema(input_schema)
        Draft202012Validator(input_schema).validate(record.context.merged_input())
    except Exception as error:
        raise SummaryEvidenceFailure('summary_result_invalid') from error
    return VerifiedNaturalSummary(actionRef=action_ref, outputPath=params.outputPath,
        outputSchema=record.outputSchema, inputSchema=input_schema, sources=record.context.sources,
        completedFacts=record.context.completedFacts, runtimeInputDigest=digest(record.context.runtimeInput),
        summary=record.summary, resultDigest=result_ref.digest)
