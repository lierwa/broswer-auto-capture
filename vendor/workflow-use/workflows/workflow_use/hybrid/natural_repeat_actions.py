"""Prove repeat advances from native actions; no new browser or scheduling logic."""
from .evidence import digest
from .natural_reads import runtime_read_specification
from .natural_target_compile import natural_target
from .registry import action_effect


def repeat_mode(trace, value):
    first = value['iterations'][0]['advanceActionRef']
    action = next(item for item in trace.actions if item.id == first)
    pre, post = action_observations(trace, action)
    if action.name in ('navigate', 'click') and pre.url != post.url:
        return 'href'
    if action.name in ('click', 'scroll') and pre.url == post.url:
        return action.name
    raise ValueError('repeat_method_advance_kind_unproven')


def action_observations(trace, action):
    return tuple(next(item for item in trace.observations if item.id == ref)
                 for ref in (action.preObservationRef, action.postObservationRef))


def unique_continuation_target(action, pre, query_action, query, query_pre, query_post):
    from .natural_repeat_evidence import _assert_same_document
    target, _, issues = natural_target(action, pre)
    structures = [fact.value for fact in pre.facts if fact.kind == 'dom_structure'
                  and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    candidate = structures[0].get('queryCandidate') if len(structures) == 1 else None
    expected = {'strategy': 'structure', 'scope': {'url': pre.url, 'urlDigest': query.urlDigest},
        'container': {'kind': 'css', 'value': 'html'},
        'items': {'kind': 'css', 'value': query_action.args.get('selector')}, 'ordinal': 1, 'withinItem': None}
    if (issues or target != expected or not candidate or candidate.get('readActionRef') != query_action.id
            or not isinstance(query.output, list) or len(query.output) != 1
            or query.output[0].get('ordinal') != 1 or pre.url != query_pre.url
            or pre.tabId != query.targetId):
        raise ValueError('repeat_method_unique_target_unproven')
    _assert_same_document(query_pre, query_post)
    _assert_same_document(query_post, pre)
    return target


def validate_same_page_advance(trace, action, mode, query_action, query, query_pre, query_post,
                               read, next_read, next_pre, next_post, key_path):
    from .natural_repeat_evidence import _assert_same_document, _stable_keys
    pre, post = action_observations(trace, action)
    if (action.name != mode or action.effect != action_effect(mode) or action.status != 'succeeded'
            or action.resultRef is None or pre.url != query_post.url or pre.url != post.url
            or next_pre.url != pre.url or pre.tabId != query.targetId):
        raise ValueError('repeat_method_advance_unproven')
    for left, right in ((query_post, pre), (pre, post), (post, next_pre), (next_pre, next_post)):
        _assert_same_document(left, right)
    native_receipt(trace, action)
    if not _stable_keys(next_read, key_path) - _stable_keys(read, key_path):
        raise ValueError('repeat_method_new_records_unproven')
    if mode == 'click':
        target = unique_continuation_target(action, pre, query_action, query, query_pre, query_post)
        # WHY：原生点击 index 随当前快照变化；可复用方法由完整查询的唯一目标决定。
        args = {key: value for key, value in action.args.items() if key not in ('index', 'element_index', 'xpath')}
        return digest({'name': mode, 'args': args, 'target': target})
    if action.args.get('index') is not None or any(key in action.args for key in ('element_index', 'xpath')):
        raise ValueError('repeat_method_scroll_target_unproven')
    # WHY：原生 ScrollAction 的 index=None 与缺省均指向 viewport；只规范方法比较，不改来源参数。
    args = {key: value for key, value in action.args.items() if key != 'index'}
    return digest({'name': mode, 'args': args})


def native_receipt(trace, action):
    all_facts = [fact for observation in trace.observations for fact in observation.facts
                 if fact.kind == 'native_action_dispatch' and isinstance(fact.value, dict)]
    facts = [fact for fact in all_facts if fact.value.get('actionRef') == action.id]
    if len(facts) != 1 or action.resultRef is None:
        raise ValueError('repeat_method_native_dispatch_missing')
    fact, value = facts[0], facts[0].value
    expected = {'schemaVersion', 'nativeStepNumber', 'nativeActionIndex', 'actionRef', 'actionName',
                'intentTarget', 'resultRef', 'entered', 'resultReceived', 'eventCapture'}
    position = (value.get('nativeStepNumber'), value.get('nativeActionIndex'))
    positions = [(item.value.get('nativeStepNumber'), item.value.get('nativeActionIndex')) for item in all_facts]
    if (set(value) != expected or value.get('schemaVersion') != 'bat.native-action-dispatch/v3'
            or value.get('actionName') != action.name or value.get('entered') is not True
            or value.get('resultReceived') is not True or value.get('nativeActionIndex') != action.actionIndex
            or type(value.get('nativeActionIndex')) is not int or value['nativeActionIndex'] < 0
            or type(value.get('nativeStepNumber')) is not int or value['nativeStepNumber'] <= 0
            or positions.count(position) != 1
            or value.get('resultRef') != action.resultRef.model_dump(mode='json')
            or not fact.sourceRefs or any(ref.digest != digest(value) for ref in fact.sourceRefs)):
        raise ValueError('repeat_method_native_dispatch_invalid')
    return value


def validate_selection_sample(trace, action):
    from .natural_repeat_evidence import _assert_same_document
    from .selection_tool import SelectionCheck
    if (action.effect != 'none' or action.status not in ('succeeded', 'failed') or action.resultRef is None):
        raise ValueError('repeat_method_selection_audit_invalid')
    SelectionCheck.model_validate(action.args)
    receipt = native_receipt(trace, action)
    if receipt.get('intentTarget') is not None or receipt.get('eventCapture') != {
            'status': 'not_applicable', 'eventExpectation': 'none', 'eventCount': 0, 'limitations': []}:
        raise ValueError('repeat_method_selection_effect_unproven')
    pre, post = action_observations(trace, action)
    if pre.url != post.url:
        raise ValueError('repeat_method_selection_scope_changed')
    _assert_same_document(pre, post)


def validate_passive_wait(trace, action):
    from .action_capture_policy import action_capture_policy
    from .natural_repeat_evidence import _assert_same_document
    policy = action_capture_policy(action.name)
    if (action.name != 'wait' or action.effect != action_effect('wait') or action.status != 'succeeded'
            or policy.boundary != 'read' or policy.event_expectation != 'none'):
        raise ValueError('repeat_method_wait_invalid')
    receipt = native_receipt(trace, action)
    if receipt.get('intentTarget') is not None or receipt.get('eventCapture') != {
            'status': 'not_applicable', 'eventExpectation': 'none', 'eventCount': 0, 'limitations': []}:
        raise ValueError('repeat_method_wait_effect_unproven')
    pre, post = action_observations(trace, action)
    if pre.url != post.url:
        raise ValueError('repeat_method_wait_scope_changed')
    _assert_same_document(pre, post)


def assert_same_page_segments(trace, value, segments, mode):
    by_id = {segment['id']: segment for segment in segments}
    for index, row in enumerate(value['iterations'][:-1]):
        advance = by_id['s-' + row['advanceActionRef']]
        next_ref = value['iterations'][index + 1]['readActionRef']
        consumer = by_id['s-' + next_ref]
        conditions = [item for item in advance.get('postconditions', []) if item.get('kind') == 'read_fields']
        if (advance['operation'] != {'name': 'browser.workflow-step', 'version': 2, 'actionName': mode}
                or consumer['operation']['name'] != 'browser.read-fields' or len(conditions) != 1
                or conditions[0].get('transition') is not True or conditions[0].get('ready') is not None
                or conditions[0].get('consumerRef') != consumer['id']
                or conditions[0].get('read') != consumer['operation']['specification']):
            raise ValueError('repeat_method_read_transition_required')
        from .natural_repeat_evidence import verified_read
        _, read, _, post = verified_read(trace, next_ref)
        facts = [fact for fact in post.facts if fact.kind == 'verified_natural_read'
                 and isinstance(fact.value, dict) and fact.value.get('actionRef') == next_ref]
        if (conditions[0].get('clauseRef') != facts[0].id
                or conditions[0]['read'] != runtime_read_specification(read.specification)):
            raise ValueError('repeat_method_read_transition_unproven')
