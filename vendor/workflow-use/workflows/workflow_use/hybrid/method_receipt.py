"""Separate native business success from preparation method availability."""
from typing import Literal

from pydantic import Field

from .evidence import Contract, EvidenceRef, ObservationFact, digest, gap

MethodOutcome = Literal['recorded', 'state_only', 'unsupported']


class MethodReceipt(Contract):
    doneActionRef: str
    methodOutcome: MethodOutcome
    requirementDigest: str
    observedActionRefs: list[str] = Field(max_length=500)
    inspectedMethodRefs: list[str] = Field(max_length=500)


def receipt_value(trace, requirement_digest):
    done = trace.actions[-1] if trace.actions else None
    if done is None or done.name != 'done' or done.status != 'succeeded':
        raise ValueError('preparation_terminal_done_required')
    return MethodReceipt(doneActionRef=done.id, methodOutcome=done.args.get('methodOutcome'),
        requirementDigest=requirement_digest,
        observedActionRefs=[a.id for a in trace.actions if a.status == 'succeeded'
                            and a.name not in ('done', 'bat_inspect_action')],
        inspectedMethodRefs=[a.id for a in trace.actions if a.name == 'bat_inspect_action'
                             and a.status == 'succeeded'])


def attach_method_receipt(trace, request):
    if getattr(request, 'sourceProtocol', 'bat-hybrid/2') != 'bat-hybrid/3' or not trace.completed:
        return trace
    try:
        value = receipt_value(trace, request.requirementDigest).model_dump(mode='json')
    except (ValueError, TypeError, KeyError):
        return trace  # 保留原始来源；编译门记录缺少回执，不因收尾声明损坏而丢失整次来源。
    updated = trace.model_copy(deep=True)
    done = updated.actions[-1]
    owner = next((o for o in updated.observations if o.id == done.postObservationRef), None)
    if owner is None:
        return trace
    fingerprint = digest(value)
    owner.facts.append(ObservationFact(id='method-receipt-' + done.id, kind='preparation_method_receipt',
        value=value, sourceRefs=[EvidenceRef(ref='sha256:' + fingerprint, digest=fingerprint)]))
    return type(trace).model_validate({**updated.model_dump(mode='json', exclude={'digest'}),
        'digest': digest(updated.model_dump(mode='json', exclude={'digest'}))})


def method_receipt_issues(request):
    if request.compilerVersion != 'bat-hybrid/3':
        return []
    try:
        expected = receipt_value(request.trace, request.requirement.sourceDigest)
        matches = [(o, f) for o in request.trace.observations for f in o.facts
                   if f.kind == 'preparation_method_receipt']
        if (len(matches) != 1 or matches[0][0].id != request.trace.actions[-1].postObservationRef
                or MethodReceipt.model_validate(matches[0][1].value) != expected):
            raise ValueError('preparation_method_receipt_required')
        if expected.methodOutcome != 'recorded' or not (expected.observedActionRefs or expected.inspectedMethodRefs):
            raise ValueError('preparation_reusable_method_required')
    except (ValueError, TypeError, KeyError):
        return [gap('missing_binding', [], 'preparation_reusable_method_required', 'collect_evidence')]
    return []
