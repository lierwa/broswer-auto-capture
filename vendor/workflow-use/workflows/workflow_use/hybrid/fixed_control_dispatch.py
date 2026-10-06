"""Admit a confirmed control's native action receipt without inventing business completion."""
import re
from .evidence import digest
from .native_discovery import _one_fact
from .target_preparation import verify_event_target


def fixed_control_dispatch(action, pre, post, target):
    identity = target.get('identity', {}) if isinstance(target, dict) and target.get('strategy') == 'history' else {}
    if (action.name != 'click' or not (identity.get('requireAxName') or identity.get('requireText'))
            or pre.tabId != post.tabId or pre.url != post.url or action.resultRef is None):
        return None
    before, after = document_identity(pre), document_identity(post)
    before_url, after_url = observed_fact(pre, 'url_digest'), observed_fact(post, 'url_digest')
    sent, received = _one_fact(pre, 'native_action_dispatch', action.id), _one_fact(pre, 'native_action_result', action.id)
    if (any(fact is None for fact in (before, after, before_url, after_url, sent, received))
            or before != after or before_url.value != digest(pre.url)
            or after_url.value != digest(post.url)):
        return None
    dispatch, result = sent.value, received.value
    reference = action.resultRef.model_dump(mode='json')
    raw = result.get('result')
    intent = dispatch.get('intentTarget')
    if (dispatch.get('schemaVersion') != 'bat.native-action-dispatch/v3'
            or dispatch.get('actionName') != action.name or dispatch.get('entered') is not True
            or dispatch.get('resultReceived') is not True or dispatch.get('nativeActionIndex') != action.actionIndex
            or dispatch.get('resultRef') != reference or not isinstance(intent, dict) or intent.get('targetId') != pre.tabId
            or result.get('schemaVersion') != 'bat.native-action-result/v1'
            or result.get('receivedFromToolsAct') is not True or result.get('resultRef') != reference
            or not isinstance(raw, dict) or raw.get('error') is not None or digest(raw) != action.resultRef.digest):
        return None
    events = [fact for fact in pre.facts if fact.kind == 'native_dom_event'
              and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id
              and fact.sourceRefs and all(ref.digest == digest(fact.value) for ref in fact.sourceRefs)]
    actual = [fact.value.get('actual', {}) for fact in events]
    if (not actual or any(event.get('scope', {}).get('targetId') != pre.tabId
                         or event.get('event', {}).get('type') != 'click' for event in actual)
            or dispatch.get('eventCapture') != {'status': 'captured', 'eventExpectation': 'required',
                                               'eventCount': len(events), 'limitations': []}):
        return None
    try:
        verify_event_target({'status': 'captured', 'events': actual}, require_trusted=True)
    except RuntimeError:
        return None
    # WHY：只证明这一固定控件确实接收可信点击；任务完成、动态选择和显式输出均不由它代替。
    return ([{'kind': 'url_digest', 'unchanged': True, 'clauseRef': after_url.id}],
            [ref for fact in (_one_fact(pre, 'document_identity'), _one_fact(post, 'document_identity'),
                             before_url, after_url, sent, received, *events) for ref in fact.sourceRefs])


def observed_fact(observation, kind):
    facts = [fact for fact in observation.facts if fact.kind == kind]
    if len(facts) != 1 or not facts[0].sourceRefs:
        return None
    fact = facts[0]
    hashes = {digest(fact.value), digest({'kind': kind, 'value': fact.value})}
    return fact if all(ref.digest in hashes for ref in fact.sourceRefs) else None


def document_identity(observation):
    fact = _one_fact(observation, 'document_identity') if observation is not None else None
    value = fact.value if fact is not None else None
    if (not isinstance(value, dict) or value.get('targetId') != observation.tabId
            or not isinstance(value.get('documentDigest'), str)
            or re.fullmatch(r'[a-f0-9]{64}', value['documentDigest']) is None):
        return None
    return {'targetId': value['targetId'], 'documentDigest': value['documentDigest']}
