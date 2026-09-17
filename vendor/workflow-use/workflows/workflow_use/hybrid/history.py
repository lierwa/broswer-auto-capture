"""Public AgentHistoryList adapter. Redaction and evidence storage belong to the product boundary."""
from typing import Callable

from browser_use.agent.views import ActionResult, AgentHistoryList

from .action_dispatch import DISPATCH_FACT_KIND, EVENT_FACT_KIND, RESULT_FACT_KIND, public_action_result
from .action_identity import history_action_refs
from .dom_evidence import history_tab_id, safe_url
from .evidence import EvidenceRef, NormalizedObservation, ObservationFact, TraceSource, digest, gap
from .normalize import HistoryInput, HistoryRecord, ResultEvidence


def from_agent_history(history: AgentHistoryList, *, source: TraceSource, judged: bool,
                       redaction_manifest: EvidenceRef, redact_action: Callable[[dict], dict],
                       store_result: Callable[[int, int, ActionResult], EvidenceRef],
                       observations: list[NormalizedObservation],
                       observation_links: dict[tuple[int, int, str], str],
                       final_result_ref: EvidenceRef | None,
                       put_evidence: Callable[[str, object], EvidenceRef] | None = None,
                       completed: bool | None = None, dispatch_audit=None) -> HistoryInput:
    """Never uses model_actions_filtered/zip, and never serializes state_message or screenshots."""
    records, import_gaps = [], []
    action_refs = history_action_refs(history)
    dispatch, invalid_dispatch = dispatch_audit.resolve(history) if dispatch_audit is not None else ({}, [])
    for action_ref in invalid_dispatch:
        import_gaps.append(gap('invalid_source', [action_ref] if action_ref else [],
                               'native_action_dispatch_identity_unavailable', 'reject_trace'))
    for step_index, item in enumerate(history.history):
        raw_actions = item.model_output.action if item.model_output else []
        original = [action.model_dump(exclude_unset=True) for action in raw_actions]
        action_names = [set(action) for action in original]
        actions = [redact_action(action) for action in original]
        if any(not isinstance(action, dict) or set(action) != action_names[index]
               for index, action in enumerate(actions)):
            raise ValueError('invalid_redacted_action')
        result_pairs = collect_result_evidence(
            step_index, item.result, len(actions), dispatch, store_result, put_evidence)
        results = [result for _index, result in result_pairs]
        results_by_index = dict(result_pairs)
        if put_evidence is not None:
            for action_index in range(len(actions)):
                value = dispatch.get((step_index, action_index))
                if value is None:
                    continue
                raw_result = item.result[action_index] if action_index < len(item.result) else None
                result = results_by_index.get(action_index)
                facts = action_evidence_facts(value, raw_result, result.ref if result else None,
                                              observations, put_evidence)
                attached = attach_action_facts(observations, observation_links, step_index,
                                               action_index, facts)
                if not attached:
                    import_gaps.append(gap('missing_observation', [value['actionRef']],
                                           'native_action_dispatch_observation_unavailable', 'reject_trace'))
                if value['entered'] and not value['resultReceived']:
                    import_gaps.append(gap('invalid_source', [value['actionRef']],
                                           'native_action_result_not_received', 'reject_trace'))
                capture = value['eventCapture']
                if value['entered'] and capture.get('eventExpectation') == 'required' \
                        and capture['status'] != 'captured':
                    import_gaps.append(gap('missing_observation', [value['actionRef']],
                                           'native_action_event_' + capture['status'], 'reject_trace'))
        disposition = 'action_aligned' if set(results_by_index) == set(range(len(actions))) else 'unpaired'
        if not actions and results and all(result.errorPresent for result in results) and put_evidence is not None:
            if retain_auxiliary_results(step_index, item, results, observations, put_evidence):
                disposition = 'agent_step_auxiliary'
        records.append(HistoryRecord(stepIndex=step_index, actions=actions, results=results,
                       preObservationRef=observation_links.get((step_index, 0, 'pre')),
                       postObservationRefs={str(index): observation_links[(step_index, index, 'post')]
                                            for index in range(len(actions)) if (step_index, index, 'post') in observation_links},
                       resultDisposition=disposition))
    actual_completed = bool(history.is_done() and history.is_successful()) if completed is None else completed
    return HistoryInput(source=source, judged=judged, completed=actual_completed,
                        records=records, observations=observations, finalResultRef=final_result_ref,
                        redactionManifestRef=redaction_manifest, importGaps=import_gaps)


def action_evidence_facts(dispatch, raw_result, result_ref, observations, put_evidence):
    capture = dispatch['eventCapture']
    dispatch_body = {'schemaVersion': 'bat.native-action-dispatch/v3',
        'nativeStepNumber': dispatch['nativeStepNumber'], 'nativeActionIndex': dispatch['nativeActionIndex'],
        'actionRef': dispatch['actionRef'], 'actionName': dispatch['actionName'],
        'intentTarget': dispatch['intentTarget'], 'entered': dispatch['entered'],
        'resultReceived': dispatch['resultReceived'],
        'resultRef': result_ref.model_dump(mode='json') if result_ref is not None else None,
        'eventCapture': {'status': capture['status'], 'eventExpectation': capture['eventExpectation'],
                         'eventCount': len(capture['events']),
                         'limitations': capture['limitations']}}
    facts = [stored_fact(DISPATCH_FACT_KIND, 'native-action-dispatch', dispatch_body, put_evidence)]
    result_value = dispatch['nativeResult'] if dispatch['resultReceived'] else public_action_result(raw_result)
    if result_ref is not None and result_value is not None:
        result_body = {'schemaVersion': 'bat.native-action-result/v1', 'actionRef': dispatch['actionRef'],
            'resultRef': result_ref.model_dump(mode='json'), 'receivedFromToolsAct': dispatch['resultReceived'],
            'result': result_value}
        facts.append(stored_fact(RESULT_FACT_KIND, 'native-action-result', result_body, put_evidence))
    intent = intended_target_ref(observations, dispatch['actionRef'])
    for index, event in enumerate(capture['events']):
        body = {'schemaVersion': 'bat.native-dom-event/v1', 'actionRef': dispatch['actionRef'],
                'eventIndex': index, 'intentTargetRef': intent, 'actual': event}
        facts.append(stored_fact(EVENT_FACT_KIND, 'native-dom-event', body, put_evidence))
    return facts


def result_evidence(step_index, index, result, dispatch, store_result, put_evidence):
    value = dispatch.get((step_index, index))
    native = value.get('nativeResult') if value and value.get('resultReceived') else None
    public = native if native is not None else public_action_result(result)
    reference = put_evidence('action-result', public) if put_evidence is not None and native is not None \
        else store_result(step_index, index, result)
    return ResultEvidence(errorPresent=bool(public.get('error')), is_done=bool(public.get('is_done')),
                          success=public.get('success'), ref=reference)


def collect_result_evidence(step_index, raw_results, action_count, dispatch, store_result, put_evidence):
    pairs = [(index, result_evidence(step_index, index, result, dispatch, store_result, put_evidence))
             for index, result in enumerate(raw_results)]
    captured = {index for index, _result in pairs}
    if put_evidence is None:
        return pairs
    for index in range(action_count):
        value = dispatch.get((step_index, index))
        if index in captured or value is None or not value.get('resultReceived'):
            continue
        public = value.get('nativeResult')
        if not isinstance(public, dict):
            continue
        reference = put_evidence('action-result', public)
        pairs.append((index, ResultEvidence(errorPresent=bool(public.get('error')),
            is_done=bool(public.get('is_done')), success=public.get('success'), ref=reference)))
    return sorted(pairs, key=lambda pair: pair[0])


def stored_fact(kind, evidence_kind, body, put_evidence):
    reference = put_evidence(evidence_kind, body)
    return ObservationFact(id='fact-' + reference.digest, kind=kind, value=body, sourceRefs=[reference])


def intended_target_ref(observations, action_ref):
    matches = [fact.value.get('targetRef') for observation in observations for fact in observation.facts
               if fact.kind == 'dom_structure' and isinstance(fact.value, dict)
               and fact.value.get('actionRef') == action_ref]
    return matches[0] if len(matches) == 1 else None


def attach_action_facts(observations, observation_links, step_index, action_index, facts):
    reference = observation_links.get((step_index, action_index, 'pre'))
    observation = linked_observation(observations, reference)
    if observation is not None:
        observation.facts.extend(facts)
        return True
    return False


def linked_observation(observations, observation_ref):
    return next((item for item in observations if item.id == observation_ref), None)


def retain_auxiliary_results(step_index, item, results, observations, put_evidence):
    state = getattr(item, 'state', None)
    url, tab_id = safe_url(getattr(state, 'url', None)), history_tab_id(state)
    if not url or not tab_id:
        return False
    body = {'stepIndex': step_index, 'disposition': 'agent_step_auxiliary',
            'results': [{'resultRef': result.ref.model_dump(mode='json'), 'errorPresent': result.errorPresent,
                         'isDone': result.is_done, 'success': result.success} for result in results]}
    fact_ref = put_evidence('agent-step-result', body)
    fact = ObservationFact(id='fact-' + fact_ref.digest, kind='agent_step_result', value=body, sourceRefs=[fact_ref])
    source = {'url': url, 'tabId': tab_id, 'source': 'history_agent_step_auxiliary',
              'factDigest': digest(body)}
    observation_ref = put_evidence('observation', source)
    sequence = len(observations)
    observations.append(NormalizedObservation(id=f'o-{sequence + 1:04d}', sequence=sequence, url=url,
        tabId=tab_id, facts=[fact], sourceRefs=[observation_ref], documentDigest=None))
    return True
