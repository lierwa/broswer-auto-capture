"""Lossless action ordering over explicitly sanitized history; never infer multi-action post states."""
from typing import Literal

from pydantic import Field, JsonValue

from .action_identity import record_action_refs
from .evidence import (
    CompilationGap,
    Contract,
    EvidenceRef,
    NormalizedAction,
    NormalizedObservation,
    NormalizedTrace,
    TraceSource,
    digest,
    gap,
)
from .registry import ActionRegistry, action_effect


class ResultEvidence(Contract):
    errorPresent: bool
    is_done: bool = False
    success: bool | None = None
    cancelled: bool = False
    ref: EvidenceRef


class HistoryRecord(Contract):
    stepIndex: int = Field(ge=0)
    actions: list[dict[str, JsonValue]]
    results: list[ResultEvidence]
    preObservationRef: str | None = None
    postObservationRefs: dict[str, str] = Field(default_factory=dict)
    resultDisposition: Literal['action_aligned', 'agent_step_auxiliary', 'unpaired'] = 'action_aligned'


class HistoryInput(Contract):
    source: TraceSource
    judged: bool
    completed: bool
    records: list[HistoryRecord]
    observations: list[NormalizedObservation]
    finalResultRef: EvidenceRef | None = None
    redactionManifestRef: EvidenceRef
    importGaps: list[CompilationGap] = Field(default_factory=list)


def normalize_history(source: HistoryInput, registry: ActionRegistry):
    actions, gaps = [], list(source.importGaps)
    action_refs = record_action_refs(source.records)
    if source.source.version != registry.providerVersion:
        gaps.append(gap('invalid_source', [], 'registry_provider_version_mismatch', 'reject_trace'))
    for index, record in enumerate(source.records):
        if record.stepIndex != index:
            raise ValueError('history_step_order')
        auxiliary = record.resultDisposition == 'agent_step_auxiliary'
        if auxiliary and (record.actions or not record.results or not all(item.errorPresent for item in record.results)):
            raise ValueError('invalid_auxiliary_result_disposition')
        if not auxiliary and len(record.results) > len(record.actions):
            gaps.append(gap('invalid_source', [], f'unpaired_result_at_step:{index}', 'reject_trace'))
        ambiguous = len(record.results) != len(record.actions) and any(r.errorPresent for r in record.results)
        for action_index, raw in enumerate(record.actions):
            action, issues = normalize_action(record, action_index, raw,
                action_refs[(record.stepIndex, action_index)], ambiguous, registry)
            actions.append(action)
            gaps.extend(issues)
    body = dict(mediaType='application/vnd.bat.browser-use-trace+json;version=1',
                source=source.source.model_dump(), judged=source.judged, completed=source.completed,
                actions=[a.model_dump() for a in actions], observations=[o.model_dump() for o in source.observations],
                finalResultRef=source.finalResultRef.model_dump() if source.finalResultRef else None,
                redactionManifestRef=source.redactionManifestRef.model_dump())
    return NormalizedTrace.model_validate({**body, 'digest': digest(body)}), sorted(gaps, key=lambda item: item.id)


def normalize_action(record, index, raw, action_id, ambiguous, registry):
    populated = [(key, value) for key, value in raw.items() if value is not None]
    if len(populated) != 1:
        raise ValueError('action_requires_exactly_one_field')
    name, args = populated[0]
    issues = []
    try:
        registry.validate_action(name, args)
    except Exception:
        code = 'unsupported_action' if name not in registry.names else 'invalid_source'
        issues.append(gap(code, [action_id], 'action_not_valid_for_public_schema', 'reject_trace'))
    result = record.results[index] if index < len(record.results) and not ambiguous else None
    status = 'proposed'
    if result is not None:
        status = 'cancelled' if result.cancelled else 'failed' if result.errorPresent or result.success is False else 'succeeded'
    if result is None:
        issues.append(gap('invalid_source', [action_id], 'action_result_unpaired_or_ambiguous', 'reject_trace'))
    # WHY: 同一 item 的 pre state 只属于首动作；缺逐动作观察不能复制给后续动作。
    pre = record.preObservationRef if index == 0 else record.postObservationRefs.get(str(index - 1))
    post = record.postObservationRefs.get(str(index))
    effect = action_effect(name)
    if status == 'succeeded' and effect != 'none' and not pre:
        issues.append(gap('missing_observation', [action_id], 'missing_action_pre_observation'))
    if status == 'succeeded' and effect not in ('none', 'read') and not post:
        issues.append(gap('missing_postcondition', [action_id], 'missing_action_post_observation'))
    return NormalizedAction(id=action_id, stepIndex=record.stepIndex, actionIndex=index, name=name, args=args,
                            status=status, effect=effect, preObservationRef=pre,
                            postObservationRef=post, resultRef=result.ref if result else None), issues


def structure_fixture_input(fixture: dict, redaction: EvidenceRef, provider_version='0.13.8') -> HistoryInput:
    """H0 structure-only fixture adapter. Missing DOM/tab facts remain missing, not fabricated."""
    if fixture['format'] != 'bat-redacted-history-structure/v1':
        raise ValueError('unsupported_fixture_format')
    records = []
    for record in fixture['history']:
        results = [ResultEvidence(errorPresent=result['errorPresent'], is_done=result['is_done'],
                   success=result.get('success'), ref=EvidenceRef(
                       ref=f"fixture:step/{record['stepIndex']}/result/{index}", digest=digest(result)))
                   for index, result in enumerate(record['results'])]
        records.append(HistoryRecord(stepIndex=record['stepIndex'], actions=record['actions'], results=results))
    final = records[-1].results[-1] if records and records[-1].results else None
    # H0 fixture only retained judgement presence, not verdict; presence must never become approval.
    return HistoryInput(source=TraceSource(version=provider_version, historyRef='sha256:' + fixture['sourceDigest']),
                        judged=False, completed=bool(final and final.is_done and final.success),
                        records=records, observations=[], redactionManifestRef=redaction,
                        finalResultRef=final.ref if final else None)
