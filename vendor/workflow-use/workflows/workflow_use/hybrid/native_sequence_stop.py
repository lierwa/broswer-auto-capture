"""Non-executable evidence for the tail stopped by native multi_act, never a replacement loop."""
from .evidence import ActionCoverage, EvidenceRef, ObservationFact, digest

STOP_FACT_KIND = 'native_sequence_stop'
STOP_RULE = 'native_sequence_not_dispatched/v1'
STOP_REASONS = {'tool_terminates_sequence', 'action_error', 'action_done', 'page_changed',
                'native_stop', 'native_pause', 'done_requires_single_action', 'admission_rejected'}
DISPATCH_KEYS = {'schemaVersion', 'nativeStepNumber', 'nativeActionIndex', 'actionRef', 'actionName',
                 'intentTarget', 'entered', 'resultReceived', 'resultRef', 'eventCapture'}
STOP_KEYS = {'schemaVersion', 'nativeStepNumber', 'nativeActionIndex', 'actionRef',
             'causeActionRef', 'causeResultRef', 'reason', 'proof'}


def record_sequence_stop(audit, native_step, cause_index, *, reason, proof=None):
    """Record observed native stop evidence after one real completed Tools.act call."""
    cause = audit.entries.get((native_step, cause_index))
    proof = {} if proof is None else proof
    if (reason == 'admission_rejected' or cause is None or cause.get('entered') is not True or cause.get('resultReceived') is not True
            or not valid_stop_reason(reason, proof, cause['actionName'], cause['nativeResult'],
                                     audit.entries, native_step, cause_index)):
        return False
    tails = [(position, value) for position, value in audit.entries.items()
             if position[0] == native_step and position[1] > cause_index]
    if not tails or any(value.get('entered') or value.get('resultReceived') for _position, value in tails):
        return False
    marker = {'causeIndex': cause_index, 'reason': reason, 'proof': proof}
    if any(value.get('sequenceStop') not in (None, marker) for _position, value in tails):
        raise ValueError('native_sequence_stop_conflict')
    for _position, value in tails:
        value['sequenceStop'] = marker
    return True


def valid_stop_reason(reason, proof, cause_name, result, positions, native_step, cause_index):
    if not isinstance(reason, str) or reason not in STOP_REASONS or not isinstance(proof, dict) or not isinstance(result, dict):
        return False
    if reason in ('action_error', 'action_done'):
        return proof == {} and bool(result.get('error') if reason == 'action_error' else result.get('is_done'))
    if reason == 'admission_rejected':
        return (proof == {'nativeResultPrefixLength': cause_index + 1}
                and type(proof.get('nativeResultPrefixLength')) is int and bool(result.get('error')))
    if reason == 'tool_terminates_sequence':
        return proof == {'actionName': cause_name, 'terminatesSequence': True}
    if reason in ('native_stop', 'native_pause'):
        return proof == {('stopped' if reason == 'native_stop' else 'paused'): True}
    if reason == 'done_requires_single_action':
        index = proof.get('blockedActionIndex')
        blocked = positions.get((native_step, index)) if type(index) is int else None
        return (set(proof) == {'blockedActionIndex'} and index == cause_index + 1
                and blocked is not None and blocked.get('actionName') == 'done')
    if set(proof) != {'beforeUrlDigest', 'afterUrlDigest', 'beforeTargetId', 'afterTargetId'}:
        return False
    checksums = (proof['beforeUrlDigest'], proof['afterUrlDigest'])
    if any(not isinstance(value, str) or len(value) != 64
           or any(char not in '0123456789abcdef' for char in value) for value in checksums):
        return False
    if any(not isinstance(proof[key], str) or not proof[key] for key in ('beforeTargetId', 'afterTargetId')):
        return False
    return checksums[0] != checksums[1] or proof['beforeTargetId'] != proof['afterTargetId']


def sequence_stop_fact(dispatch, all_dispatch, results, step_index, put_evidence):
    marker = dispatch.get('sequenceStop')
    if not isinstance(marker, dict):
        return None
    cause_index = marker['causeIndex']
    cause = all_dispatch.get((step_index, cause_index))
    result = results.get(cause_index)
    rejected = marker.get('reason') == 'admission_rejected'
    if (cause is None or result is None or (not rejected and (not cause['entered'] or not cause['resultReceived']))
            or rejected and (cause['entered'] or cause['resultReceived'] or not result.errorPresent)):
        return None
    body = {'schemaVersion': 'bat.native-sequence-stop/v1',
        'nativeStepNumber': dispatch['nativeStepNumber'], 'nativeActionIndex': dispatch['nativeActionIndex'],
        'actionRef': dispatch['actionRef'], 'causeActionRef': cause['actionRef'],
        'causeResultRef': result.ref.model_dump(mode='json'), 'reason': marker['reason'], 'proof': marker['proof']}
    reference = put_evidence('native-sequence-stop', body)
    return ObservationFact(id='fact-' + reference.digest, kind=STOP_FACT_KIND, value=body, sourceRefs=[reference])


def sequence_stop_coverage(trace, action):
    """Accept a proposed tail only with its exact stop, dispatch and completed cause result."""
    if action.status != 'proposed' or action.resultRef is not None or action.postObservationRef is not None:
        return None
    located = [(observation, fact) for observation in trace.observations for fact in observation.facts]
    stops = [(observation, fact) for observation, fact in located if fact.kind == STOP_FACT_KIND
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if len(stops) != 1:
        return None
    observation, stop = stops[0]
    value = stop.value
    if (set(value) != STOP_KEYS or value['schemaVersion'] != 'bat.native-sequence-stop/v1'
            or type(value['nativeStepNumber']) is not int or value['nativeStepNumber'] < 1
            or value['nativeActionIndex'] != action.actionIndex or type(value['nativeActionIndex']) is not int
            or not isinstance(value['causeActionRef'], str)
            or action.preObservationRef != observation.id or not valid_fact(stop)):
        return None
    actions = {item.id: item for item in trace.actions}
    cause = actions.get(value['causeActionRef'])
    if (cause is None or cause.stepIndex != action.stepIndex or cause.actionIndex >= action.actionIndex
            or cause.status not in ('succeeded', 'failed', 'cancelled') or cause.resultRef is None
            or value['causeResultRef'] != cause.resultRef.model_dump(mode='json')):
        return None
    tail_dispatch = sole_dispatch(located, action)
    cause_dispatch = sole_dispatch(located, cause)
    results = [fact for _observation, fact in located if fact.kind == 'native_action_result'
               and isinstance(fact.value, dict) and fact.value.get('actionRef') == cause.id]
    rejected = value['reason'] == 'admission_rejected'
    if (tail_dispatch is None or cause_dispatch is None or len(results) != 1
            or not valid_dispatch(tail_dispatch, action, value['nativeStepNumber'], entered=False)
            or not valid_dispatch(cause_dispatch, cause, value['nativeStepNumber'], entered=not rejected)
            or not valid_result(results[0], cause, received=not rejected)):
        return None
    for item in (tail_dispatch, cause_dispatch):
        if not unique_dispatch_position(located, item.value):
            return None
    positions = {(value['nativeStepNumber'], item.actionIndex): {'actionName': item.name}
                 for item in trace.actions if item.stepIndex == action.stepIndex}
    if not valid_stop_reason(value['reason'], value['proof'], cause.name, results[0].value['result'],
                             positions, value['nativeStepNumber'], cause.actionIndex):
        return None
    prefix_refs = rejection_prefix_refs(trace, located, cause, value['nativeStepNumber']) if rejected else []
    if prefix_refs is None:
        return None
    # WHY：正常停止只覆盖没有进入 Tools.act 的连续尾部，未知结果不能借尾部事实穿透。
    for item in trace.actions:
        if item.stepIndex != action.stepIndex or item.actionIndex <= cause.actionIndex:
            continue
        dispatch = sole_dispatch(located, item)
        if (item.status != 'proposed' or item.resultRef is not None or item.postObservationRef is not None or dispatch is None
                or not valid_dispatch(dispatch, item, value['nativeStepNumber'], entered=False)):
            return None
    refs = unique_refs([*stop.sourceRefs, *tail_dispatch.sourceRefs, *cause_dispatch.sourceRefs,
                        cause.resultRef, *results[0].sourceRefs, *prefix_refs])
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule=STOP_RULE, evidenceRefs=refs)


def sole_dispatch(located, action):
    matches = [fact for _observation, fact in located if fact.kind == 'native_action_dispatch'
               and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    return matches[0] if len(matches) == 1 else None


def valid_dispatch(fact, action, native_step, *, entered):
    value, capture = fact.value, fact.value.get('eventCapture')
    if (set(value) != DISPATCH_KEYS or value['schemaVersion'] != 'bat.native-action-dispatch/v3'
            or type(value['nativeStepNumber']) is not int or type(value['nativeActionIndex']) is not int
            or value['nativeStepNumber'] != native_step or value['nativeActionIndex'] != action.actionIndex
            or value['actionName'] != action.name or value['entered'] is not entered
            or value['resultReceived'] is not entered
            or value['resultRef'] != (action.resultRef.model_dump(mode='json') if action.resultRef else None)
            or not valid_fact(fact)):
        return False
    if entered:
        return True
    return (isinstance(capture, dict) and capture == {
        'status': 'not_dispatched', 'eventExpectation': capture.get('eventExpectation'),
        'eventCount': 0, 'limitations': []} and capture.get('eventExpectation') in ('none', 'optional', 'required'))


def valid_result(fact, action, *, received=True):
    value = fact.value
    return (set(value) == {'schemaVersion', 'actionRef', 'resultRef', 'receivedFromToolsAct', 'result'}
            and value['schemaVersion'] == 'bat.native-action-result/v1'
            and value['receivedFromToolsAct'] is received and isinstance(value['result'], dict)
            and type(value['result'].get('is_done')) is bool
            and (value['result'].get('error') is None or isinstance(value['result'].get('error'), str))
            and value['resultRef'] == action.resultRef.model_dump(mode='json')
            and digest(value['result']) == action.resultRef.digest and valid_fact(fact))


def valid_fact(fact):
    return bool(fact.sourceRefs) and all(ref.digest == digest(fact.value) for ref in fact.sourceRefs)


def unique_dispatch_position(located, value):
    matches = [fact for _observation, fact in located if fact.kind == 'native_action_dispatch'
               and isinstance(fact.value, dict)
               and fact.value.get('nativeStepNumber') == value['nativeStepNumber']
               and fact.value.get('nativeActionIndex') == value['nativeActionIndex']]
    return len(matches) == 1


def rejection_prefix_refs(trace, located, cause, native_step):
    from .action_dispatch import not_dispatched_coverage
    if cause.status != 'failed' or not_dispatched_coverage(trace, cause) is None:
        return None
    refs = []
    for action in trace.actions:
        if action.stepIndex != cause.stepIndex or action.actionIndex >= cause.actionIndex:
            continue
        dispatch = sole_dispatch(located, action)
        results = [fact for _observation, fact in located if fact.kind == 'native_action_result'
                   and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
        if (action.status not in ('succeeded', 'failed') or action.resultRef is None or dispatch is None or len(results) != 1
                or not valid_dispatch(dispatch, action, native_step, entered=True)
                or not unique_dispatch_position(located, dispatch.value) or not valid_result(results[0], action)
                or results[0].value['result'].get('error') or results[0].value['result'].get('is_done')):
            return None
        refs.extend([action.resultRef, *dispatch.sourceRefs, *results[0].sourceRefs])
    return refs


def unique_refs(references):
    refs = [EvidenceRef.model_validate(value) if isinstance(value, dict) else value for value in references]
    return list({(ref.ref, ref.digest): ref for ref in refs}.values())
