"""Adapt native Tools.act receipts; a successful action need not change page state."""
from .action_capture_policy import action_capture_policy
from .action_dispatch import unique_refs
from .evidence import digest
from .native_discovery import _one_fact
from .target_preparation import verify_event_target


def native_action_receipt(action, pre):
    # WHY：原生动作成功与业务后态分开；只消费同动作回执，不推断页面必须变化。
    # 来源：B-U eb4126921bea3373f91afc49fb4b59d6eda7fed6 Tools.act/_click_by_index。
    if getattr(action, 'status', None) != 'succeeded' or action.resultRef is None:
        return None
    sent = _one_fact(pre, 'native_action_dispatch', action.id)
    received = _one_fact(pre, 'native_action_result', action.id)
    if sent is None or received is None:
        return None
    dispatch, result = sent.value, received.value
    reference, raw = action.resultRef.model_dump(mode='json'), result.get('result')
    if (dispatch.get('schemaVersion') != 'bat.native-action-dispatch/v3'
            or dispatch.get('actionName') != action.name or dispatch.get('entered') is not True
            or dispatch.get('resultReceived') is not True or dispatch.get('nativeActionIndex') != action.actionIndex
            or dispatch.get('resultRef') != reference
            or result.get('schemaVersion') != 'bat.native-action-result/v1'
            or result.get('receivedFromToolsAct') is not True or result.get('resultRef') != reference
            or not isinstance(raw, dict) or raw.get('error') is not None or digest(raw) != action.resultRef.digest):
        return None
    refs = [action.resultRef, *sent.sourceRefs, *received.sourceRefs]
    policy = action_capture_policy(action.name)
    if policy.event_expectation != 'required':
        return unique_refs(refs)
    intent = dispatch.get('intentTarget')
    events = [fact for fact in pre.facts if fact.kind == 'native_dom_event'
              and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if (not isinstance(intent, dict) or intent.get('targetId') != pre.tabId
            or not events or any(not fact.sourceRefs or any(ref.digest != digest(fact.value)
                                for ref in fact.sourceRefs) for fact in events)
            or dispatch.get('eventCapture') != {'status': 'captured', 'eventExpectation': 'required',
                                               'eventCount': len(events), 'limitations': []}):
        return None
    actual = [fact.value.get('actual', {}) for fact in events]
    if any(event.get('scope', {}).get('targetId') != pre.tabId
           or event.get('event', {}).get('type') not in policy.event_types for event in actual):
        return None
    try:
        # 原生 watchdog 包含 JS click，isTrusted 不能代替实际派发及目标关联。
        verify_event_target({'status': 'captured', 'events': actual})
    except RuntimeError:
        return None
    return unique_refs([*refs, *(ref for fact in events for ref in fact.sourceRefs)])
