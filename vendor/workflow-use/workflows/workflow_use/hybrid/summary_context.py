"""Build the bounded data context consumed by the explicit summary tool."""
from typing import Literal

from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue, model_validator

from .evidence import Contract, EvidenceRef, digest
from .natural_reads import VerifiedNaturalRead, paths_conflict, schema_at_path, value_at_path


class SummaryContextFailure(ValueError):
    pass


class SummarySource(Contract):
    name: str = Field(pattern=r'^source\d+$')
    kind: Literal['prior_output'] = 'prior_output'
    binding: dict[str, JsonValue]
    valueSchema: dict[str, JsonValue]
    outputPath: list[str | int]
    sourceRef: str = Field(min_length=1)
    proofRefs: list[EvidenceRef] = Field(min_length=1)
    value: JsonValue


class SummaryCompletedFact(Contract):
    kind: Literal['verified_target_scroll', 'verified_visible_wait']
    actionRef: str = Field(min_length=1)
    actionName: Literal['bat_scroll_to', 'bat_wait_for']
    sourceRef: str = Field(min_length=1)
    proofRefs: list[EvidenceRef] = Field(min_length=1)
    value: JsonValue


class SummaryContext(Contract):
    task: str = Field(min_length=1, max_length=100000)
    runtimeInput: JsonValue
    runtimeInputSchema: dict[str, JsonValue]
    sources: list[SummarySource] = Field(min_length=1, max_length=100)
    completedFacts: list[SummaryCompletedFact] = Field(max_length=300)

    @model_validator(mode='after')
    def validate_values(self):
        Draft202012Validator.check_schema(self.runtimeInputSchema)
        Draft202012Validator(self.runtimeInputSchema).validate(self.runtimeInput)
        for index, source in enumerate(self.sources):
            if source.name != f'source{index}':
                raise ValueError('summary_source_order_invalid')
            if any(paths_conflict(source.outputPath, previous.outputPath) for previous in self.sources[:index]):
                raise ValueError('summary_prior_read_path_conflict')
            expected = {'source': 'node', 'nodeId': source.binding.get('nodeId'),
                        'path': source.binding.get('path')}
            if source.binding != expected or not isinstance(expected['nodeId'], str) or not expected['nodeId']:
                raise ValueError('summary_source_binding_invalid')
            Draft202012Validator.check_schema(source.valueSchema)
            Draft202012Validator(source.valueSchema).validate(source.value)
        return self

    def merged_input(self):
        return {'runtimeInput': self.runtimeInput, **{source.name: source.value for source in self.sources}}

    def input_schema(self):
        properties = {'runtimeInput': self.runtimeInputSchema,
                      **{source.name: source.valueSchema for source in self.sources}}
        return {'type': 'object', 'properties': properties, 'required': list(properties),
                'additionalProperties': False}


def build_summary_context(*, task, runtime_input, runtime_input_schema, observations):
    """Use only prior verified reads and completed facts; raw page state never enters the model."""
    Draft202012Validator.check_schema(runtime_input_schema)
    Draft202012Validator(runtime_input_schema).validate(runtime_input)
    sources, completed = [], []
    for observation in observations:
        for fact in observation.facts:
            if fact.kind == 'verified_natural_read':
                _assert_value_fact(fact)
                try:
                    read = VerifiedNaturalRead.model_validate(fact.value)
                    source_schema = schema_at_path(read.specification.outputSchema, read.readPath)
                    value = value_at_path(read.output, read.readPath)
                    Draft202012Validator(source_schema).validate(value)
                except Exception as error:
                    raise SummaryContextFailure('summary_prior_read_invalid') from error
                if any(paths_conflict(read.outputPath, item.outputPath) for item in sources):
                    raise SummaryContextFailure('summary_prior_read_path_conflict')
                sources.append(SummarySource(name=f'source{len(sources)}',
                    binding={'source': 'node', 'nodeId': read.actionRef, 'path': read.readPath},
                    valueSchema=source_schema, outputPath=read.outputPath, sourceRef=fact.id,
                    proofRefs=fact.sourceRefs, value=value))
            elif fact.kind in ('verified_target_scroll', 'verified_visible_wait'):
                action_ref = fact.value.get('actionRef') if isinstance(fact.value, dict) else None
                if not isinstance(action_ref, str) or not action_ref:
                    continue
                _assert_completed_fact(fact)
                action_name = 'bat_scroll_to' if fact.kind == 'verified_target_scroll' else 'bat_wait_for'
                completed.append(SummaryCompletedFact(kind=fact.kind, actionRef=action_ref, actionName=action_name,
                    sourceRef=fact.id, proofRefs=fact.sourceRefs, value=fact.value))
    if not sources:
        raise SummaryContextFailure('summary_prior_read_required')
    return SummaryContext(task=task, runtimeInput=runtime_input, runtimeInputSchema=runtime_input_schema,
                          sources=sources, completedFacts=completed)


def _assert_value_fact(fact):
    if not fact.sourceRefs or any(reference.digest != digest(fact.value) for reference in fact.sourceRefs):
        raise SummaryContextFailure('summary_prior_read_digest_mismatch')


def _assert_completed_fact(fact):
    if not fact.sourceRefs or any(reference.digest != digest(fact.value) for reference in fact.sourceRefs):
        raise SummaryContextFailure('summary_completed_fact_digest_mismatch')
