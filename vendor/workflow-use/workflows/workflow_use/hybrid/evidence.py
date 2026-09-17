"""Versioned, strict evidence contracts. These are compile inputs, never executable steps."""
import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


def digest(value: object) -> str:
    data = value.model_dump(mode='json') if isinstance(value, BaseModel) else value
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False, allow_nan=False).encode()).hexdigest()


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class EvidenceRef(Contract):
    ref: str = Field(min_length=1)
    digest: str = Field(pattern=r'^[a-f0-9]{64}$')


class ObservationFact(Contract):
    id: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    value: JsonValue
    sourceRefs: list[EvidenceRef] = Field(min_length=1)


class NormalizedObservation(Contract):
    id: str = Field(pattern=r'^o-\d{4,}$')
    sequence: int = Field(ge=0)
    url: str = Field(min_length=1)
    tabId: str = Field(min_length=1)
    documentDigest: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    accessibilityDigest: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    interactiveElementsDigest: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    facts: list[ObservationFact]
    sourceRefs: list[EvidenceRef] = Field(min_length=1)


class NormalizedAction(Contract):
    id: str = Field(pattern=r'^a-\d{4,}$')
    stepIndex: int = Field(ge=0)
    actionIndex: int = Field(ge=0)
    name: str = Field(min_length=1)
    args: JsonValue
    status: Literal['proposed', 'started', 'succeeded', 'failed', 'cancelled']
    preObservationRef: str | None = None
    resultRef: EvidenceRef | None = None
    postObservationRef: str | None = None
    effect: Literal['none', 'read', 'ui_state', 'navigation', 'external_write']
    retryOf: str | None = None


class TraceSource(Contract):
    provider: Literal['browser-use'] = 'browser-use'
    version: str
    historyRef: str


class NormalizedTrace(Contract):
    mediaType: Literal['application/vnd.bat.browser-use-trace+json;version=1'] = 'application/vnd.bat.browser-use-trace+json;version=1'
    source: TraceSource
    digest: str = Field(pattern=r'^[a-f0-9]{64}$')
    judged: bool
    completed: bool
    actions: list[NormalizedAction]
    observations: list[NormalizedObservation]
    finalResultRef: EvidenceRef | None = None
    redactionManifestRef: EvidenceRef

    @model_validator(mode='after')
    def check_integrity(self):
        if digest(self.model_dump(mode='json', exclude={'digest'})) != self.digest:
            raise ValueError('trace_digest_mismatch')
        observations = {o.id: o for o in self.observations}
        if len(observations) != len(self.observations):
            raise ValueError('duplicate_observation')
        for index, observation in enumerate(self.observations):
            if observation.id != f'o-{index + 1:04d}' or observation.sequence != index:
                raise ValueError('observation_order')
            for fact in observation.facts:
                if fact.kind in {'dom_structure', 'dom_query', 'natural_binding', 'native_extraction',
                                 'native_action_dispatch', 'native_action_result', 'native_dom_event', 'browser_context',
                                 'verified_natural_read', 'verified_target_scroll', 'verified_visible_wait',
                                 'verified_natural_summary', 'verified_output_assembly'}:
                    value_digest = digest(fact.value)
                    if any(reference.digest != value_digest for reference in fact.sourceRefs):
                        raise ValueError('fact_source_digest_mismatch')
        previous = None
        seen = set()
        post_owners = set()
        for index, action in enumerate(self.actions):
            position = (action.stepIndex, action.actionIndex)
            if action.id != f'a-{index + 1:04d}' or (previous is not None and position <= previous):
                raise ValueError('action_order')
            if (previous is None or previous[0] != position[0]) and action.actionIndex != 0:
                raise ValueError('action_order')
            if previous is not None and previous[0] == position[0] and position[1] != previous[1] + 1:
                raise ValueError('action_order')
            for ref in [action.preObservationRef, action.postObservationRef]:
                if ref is not None and ref not in observations:
                    raise ValueError('unknown_observation')
            if action.preObservationRef and action.postObservationRef:
                if observations[action.preObservationRef].sequence >= observations[action.postObservationRef].sequence:
                    raise ValueError('observation_causality')
            if action.postObservationRef:
                if action.postObservationRef in post_owners:
                    raise ValueError('shared_post_observation')
                post_owners.add(action.postObservationRef)
            if action.retryOf is not None and action.retryOf not in seen:
                raise ValueError('unknown_retry')
            seen.add(action.id)
            previous = position
        return self


class CompilationGap(Contract):
    id: str
    code: Literal['invalid_source', 'unsupported_action', 'missing_observation', 'missing_effect_proof',
                  'missing_postcondition', 'missing_binding', 'sample_value_leak', 'ambiguous_clause_alignment',
                  'missing_control_intent', 'unsupported_capability', 'unbounded_semantic_operation',
                  'incomplete_action_coverage']
    actionRefs: list[str]
    clauseRefs: list[str]
    reason: str
    resolution: Literal['collect_evidence', 'confirm_intent', 'add_capability', 'reject_trace']


class ActionCoverage(Contract):
    actionRef: str
    disposition: Literal['compiled', 'supporting', 'retry_attempt', 'agent_internal', 'not_compilable']
    ownerSegmentId: str | None = None
    exclusionRule: str | None = None
    evidenceRefs: list[EvidenceRef]


def gap(code: str, actions: list[str], reason: str, resolution: str = 'collect_evidence',
        clauses: list[str] | None = None) -> CompilationGap:
    body = dict(code=code, actionRefs=actions, clauseRefs=clauses or [], reason=reason, resolution=resolution)
    return CompilationGap(id='g-' + digest(body)[:16], **body)
