"""Host receipts for a preparation-only DOM query with no executable value consumer."""
import re

from .dom_evidence import find_elements_total
from .evidence import digest


def native_discovery_proof(action, pre, post, query):
    """Return existing proof references only; never synthesize a missing field-read sample."""
    before = _one_fact(pre, 'document_identity')
    after = _one_fact(post, 'document_identity')
    dispatch = _one_fact(pre, 'native_action_dispatch', action.id)
    result = _one_fact(pre, 'native_action_result', action.id)
    if any(fact is None for fact in (before, after, dispatch, result)):
        return None
    identity = before.value
    if (identity != after.value or set(identity) != {'targetId', 'documentDigest'}
            or identity.get('targetId') != pre.tabId
            or not isinstance(identity.get('documentDigest'), str)
            or re.fullmatch('[a-f0-9]{64}', identity['documentDigest']) is None):
        return None
    sent, received = dispatch.value, result.value
    reference = action.resultRef.model_dump(mode='json')
    expected = {'schemaVersion', 'nativeStepNumber', 'nativeActionIndex', 'actionRef', 'actionName',
                'intentTarget', 'resultRef', 'entered', 'resultReceived', 'eventCapture'}
    if (set(sent) != expected or sent.get('schemaVersion') != 'bat.native-action-dispatch/v3'
            or sent.get('actionName') != 'find_elements' or sent.get('entered') is not True
            or sent.get('resultReceived') is not True or sent.get('intentTarget') is not None
            or type(sent.get('nativeStepNumber')) is not int or sent['nativeStepNumber'] <= 0
            or type(sent.get('nativeActionIndex')) is not int or sent['nativeActionIndex'] != action.actionIndex
            or sent.get('resultRef') != reference or sent.get('eventCapture') != {
                'status': 'not_applicable', 'eventExpectation': 'none', 'eventCount': 0, 'limitations': []}):
        return None
    raw = received.get('result')
    if (set(received) != {'schemaVersion', 'actionRef', 'resultRef', 'receivedFromToolsAct', 'result'}
            or received.get('schemaVersion') != 'bat.native-action-result/v1'
            or received.get('receivedFromToolsAct') is not True or received.get('resultRef') != reference
            or not isinstance(raw, dict) or raw.get('error') is not None
            or digest(raw) != action.resultRef.digest
            or find_elements_total(raw.get('long_term_memory')) != query.total):
        return None
    return [ref for fact in (before, after, dispatch, result) for ref in fact.sourceRefs]


def _one_fact(observation, kind, action_ref=None):
    facts = [fact for fact in observation.facts if fact.kind == kind and isinstance(fact.value, dict)
             and (action_ref is None or fact.value.get('actionRef') == action_ref)]
    if len(facts) != 1:
        return None
    fact = facts[0]
    if not fact.sourceRefs or any(ref.digest != digest(fact.value) for ref in fact.sourceRefs):
        return None
    return fact
