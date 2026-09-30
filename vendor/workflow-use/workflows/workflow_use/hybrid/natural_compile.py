"""Evidence-only classification for bat-hybrid/2 natural Agent traces."""
import json

from .action_dispatch import not_dispatched_coverage
from .capability import TARGET_ACTIONS
from .causal import delayed_post_for_conditions, supporting_wait, waits_owned_by_next_target
from .coverage import (
    dom_inspection_coverage,
    execution_extraction_coverage,
    failed_native_dom_lookup_coverage,
    native_extraction_coverage,
    native_dom_lookup_observation_coverage,
    search_page_coverage,
    selection_validation_coverage,
)
from .evidence import ActionCoverage, EvidenceRef, digest, gap
from .human_wait_compile import compile_human_wait
from .natural_binding_compile import anchored_navigation_binding, natural_bindings
from .natural_compile_result import finalize_natural_compilation
from .natural_media_compile import bind_recorded_playback
from .natural_readiness import NATURAL_SETTLE, consumer_readiness_by_action, with_consumer_readiness
from .natural_reads import compile_verified_read
from .natural_repeat import repeat_context, repeat_sample_coverage
from .natural_selection import bind_selection_function
from .natural_target_compile import natural_target
from .navigation import NAVIGATION_ACTIONS, cross_tab_navigation_allowed
from .navigation_compile import navigation_postconditions
from .postconditions import declared_checks
from .registry import action_effect
from .summary_compile import compile_verified_summary
from .target_scroll import TargetScrollParams, VerifiedTargetScroll
from .visible_wait_compile import compile_visible_wait, failed_visible_wait_coverage

ADMITTED = frozenset({'navigate', 'go_back', 'wait', 'scroll', 'send_keys', *TARGET_ACTIONS})
NATURAL_EFFECT_KINDS = {
    'click': ('media_playback', 'target_state', 'visible_overlays', 'focused_element'),
    'input': ('target_state',),
    'select_dropdown': ('target_state',),
    'dropdown_options': ('target_state',),
    'scroll': ('scroll_position',),
    'send_keys': ('visible_overlays', 'focused_element'),
    'wait': ('media_playback',),
}
TARGET_STATE_KEYS = frozenset({'aria-expanded', 'aria-checked', 'aria-selected', 'aria-disabled',
                               'checked', 'selected', 'disabled', 'focused'})
EMPTY_OVERLAYS = digest([])

def compile_natural_request(request, registry, compilation_type, linear_graph, source_gaps=(), *, output_schema=None):
    from .natural_compile_actions import classify_natural_prefix
    segments, ledger, issues, repeat = classify_natural_prefix(
        request, registry, source_gaps, output_schema=output_schema)
    if not request.trace.completed or request.trace.finalResultRef is None:
        issues.append(gap('invalid_source', [], 'completed_business_result_required', 'reject_trace'))
    return finalize_natural_compilation(
        request, registry, compilation_type, linear_graph, output_schema, segments, ledger, issues, repeat=repeat)

def observation_only_coverage(request, registry, action, pre, post, output_schema):
    for classifier in (search_page_coverage, dom_inspection_coverage):
        row = classifier(registry, action, pre, post)
        if row is not None:
            return row
    # WHY：execution 的读取仍可能决定后续目标，不能因公开输出为 null 而抹掉读取职责。
    if getattr(request.plan.resultSpec, 'mode', None) != 'execution':
        row = native_extraction_coverage(registry, action, pre, post)
        if row is not None:
            return row
    row = execution_extraction_coverage(registry, action, pre, post, request.plan.resultSpec, output_schema)
    if row is not None:
        return row
    return (natural_dom_lookup_coverage(registry, action, pre, post)
            or failed_native_dom_lookup_coverage(registry, action, pre, post))


def valid_native_action(registry, action):
    if action.name not in registry.names or action.effect != action_effect(action.name):
        return False
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return False
    return True


def failed_bat_field_read_coverage(registry, action):
    if (action.name != 'bat_read_fields' or action.effect != 'read'
            or action.status != 'failed' or action.resultRef is None):
        return None
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule='failed_bat_field_read_probe/v1', evidenceRefs=[action.resultRef])


def classify_natural_action(request, registry, action, pre, post, output_schema=None, prior_paths=(),
                            prior_segments=(), consumer_readiness=None, *, dependencies=None):
    if action.name not in registry.names or action.effect != action_effect(action.name):
        return None, None, [gap('unsupported_action', [action.id], 'unregistered_or_mismatched_action', 'reject_trace')]
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None, None, [gap('invalid_source', [action.id], 'invalid_action_arguments', 'reject_trace')]
    if action.status != 'succeeded' or action.resultRef is None:
        return None, None, [gap('invalid_source', [action.id], 'successful_action_result_required', 'reject_trace')]
    if pre is None or post is None:
        return None, None, [gap('missing_observation', [action.id], 'action_pre_and_post_required')]
    if not cross_tab_navigation_allowed(action, pre, post):
        return None, None, [gap('unsupported_capability', [action.id], 'cross_tab_state_contract_required', 'add_capability')]
    if action.name == 'bat_request_human':
        return compile_human_wait(action, pre, post)
    if action.name == 'bat_summarize':
        return compile_verified_summary(request, action, pre, post, output_schema, prior_segments, prior_paths)
    if action.name in ('extract', 'bat_read_fields', 'find_elements'):
        return compile_verified_read(request, action, pre, post, output_schema, prior_paths)
    if action.name == 'bat_scroll_to':
        return compile_target_scroll(request, action, pre, post)
    if action.name == 'bat_wait_for':
        bindings, binding_issues = natural_bindings(request, action, pre, False)
        return compile_visible_wait(action, pre, post, bindings, binding_issues)
    if action.name not in ADMITTED:
        return None, None, [gap('unsupported_capability', [action.id],
                                'natural_action_not_admitted', 'add_capability')]
    target, target_refs, target_issues = natural_target(action, pre)
    if target_issues:
        return None, None, target_issues
    bindings, binding_issues = natural_bindings(
        request, action, pre, target is not None, prior_segments, dependencies=dependencies)
    anchored = anchored_navigation_binding(request, action, pre, post, target, prior_segments)
    if anchored is not None and not binding_issues:
        binding, url_fact = anchored
        conditions, readiness_refs = with_consumer_readiness(
            [{'kind': 'url', 'bindingArgument': 'url', 'clauseRef': url_fact.id,
              'settle': NATURAL_SETTLE}], url_fact.sourceRefs, consumer_readiness, NATURAL_SETTLE)
        try:
            declared_checks(conditions, {**action.args, 'url': url_fact.value}, None,
                            allow_unresolved_target=True)
        except ValueError:
            return None, None, [gap('unsupported_capability', [action.id],
                                    'anchor_navigation_postcondition_not_admitted', 'add_capability')]
        proof_refs = unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs,
                                  *target_refs, *readiness_refs,
                                  *(ref for ref in binding['proofRefs'])])
        return {'id': 's-' + action.id, 'kind': 'deterministic',
                'operation': {'name': 'browser.workflow-step', 'version': 2, 'actionName': 'navigate'},
                'target': None, 'bindings': [binding],
                'preconditions': [{'kind': 'source_observation', 'evidenceRef': pre.id}],
                'expectedEffect': {'kind': 'navigation'}, 'postconditions': conditions,
                'outputs': [], 'proofRefs': [ref.model_dump(mode='json') for ref in proof_refs]}, None, []
    postconditions, post_refs, post_issues = natural_postconditions(
        action, pre, post, target, bindings, consumer_readiness, dependencies=dependencies)
    issues = [*target_issues, *binding_issues, *post_issues]
    if issues:
        return None, None, issues
    if dependencies is not None and any(item.actionRef == action.id for item in dependencies):
        return None, None, []
    try:
        declared_checks(postconditions, action.args, target, allow_unresolved_target=True)
    except ValueError:
        return None, None, [gap('unsupported_capability', [action.id],
                                'natural_postcondition_not_admitted', 'add_capability')]
    proof_refs = unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs,
                              *target_refs, *post_refs,
                              *(ref for binding in bindings for ref in binding['proofRefs'])])
    return {'id': 's-' + action.id, 'kind': 'deterministic',
            'operation': {'name': 'browser.workflow-step', 'version': 2, 'actionName': action.name},
            'target': target, 'bindings': bindings,
            'preconditions': [{'kind': 'source_observation', 'evidenceRef': pre.id}],
            'expectedEffect': {'kind': action.effect}, 'postconditions': postconditions,
            'outputs': [], 'proofRefs': [ref.model_dump(mode='json') for ref in proof_refs]}, None, []


def compile_target_scroll(request, action, pre, post):
    facts = natural_facts(post, 'verified_target_scroll', action.id)
    if len(facts) != 1:
        return None, None, [gap('missing_effect_proof', [action.id],
                                'verified_target_scroll_required', 'collect_evidence')]
    fact = facts[0]
    try:
        params = TargetScrollParams.model_validate(action.args)
        verified = VerifiedTargetScroll.model_validate(fact.value)
    except Exception:
        return None, None, [gap('invalid_source', [action.id],
                                'verified_target_scroll_invalid', 'reject_trace')]
    before, after = fact_value(pre, 'url_digest'), fact_value(post, 'url_digest')
    identity_matches = (verified.selector == params.selector and verified.visible is True
                        and verified.targetId == pre.tabId == post.tabId
                        and verified.resultDigest == action.resultRef.digest
                        and before is not None and after is not None
                        and before.value == verified.urlDigest == after.value)
    if not identity_matches:
        return None, None, [gap('invalid_source', [action.id],
                                'verified_target_scroll_mismatch', 'reject_trace')]
    bindings, issues = natural_bindings(request, action, pre, False)
    if issues or len(bindings) != 1 or bindings[0]['argumentPath'] != 'selector':
        return None, None, issues or [gap('missing_binding', [action.id],
            'target_scroll_selector_binding_required', 'collect_evidence')]
    target = {'strategy': 'css', 'value': params.selector,
              'scope': {'url': pre.url, 'urlDigest': verified.urlDigest}}
    postconditions = [{'kind': 'target_in_view', 'equals': 'true', 'clauseRef': fact.id}]
    try:
        declared_checks(postconditions, action.args, target)
    except ValueError:
        return None, None, [gap('unsupported_capability', [action.id],
            'target_scroll_postcondition_not_admitted', 'add_capability')]
    refs = unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs, *fact.sourceRefs,
                        *(ref for binding in bindings for ref in binding['proofRefs'])])
    segment = {'id': 's-' + action.id, 'kind': 'deterministic',
        'operation': {'name': 'browser.workflow-step', 'version': 2, 'actionName': action.name},
        'target': target, 'bindings': bindings,
        'preconditions': [{'kind': 'source_observation', 'evidenceRef': pre.id}],
        'expectedEffect': {'kind': 'ui_state'}, 'postconditions': postconditions,
        'outputs': [], 'proofRefs': [ref.model_dump(mode='json') for ref in refs]}
    return segment, None, []


def natural_dom_lookup_coverage(registry, action, pre, post):
    return native_dom_lookup_observation_coverage(registry, action, pre, post)


def natural_postconditions(action, pre, post, target, bindings, consumer=None, *, dependencies=None):
    if action.name == 'navigate':
        facts = natural_facts(post, 'natural_postcondition', action.id)
        matched = [fact for fact in facts if fact.value == {'actionRef': action.id, 'kind': 'url',
                                                            'bindingArgument': 'url', 'matched': True}]
        if len(matched) != 1:
            return [], [], [gap('missing_effect_proof', [action.id],
                                'navigate_url_binding_not_observed', 'collect_evidence')]
        conditions, refs = with_consumer_readiness(
            [{'kind': 'url', 'bindingArgument': 'url', 'clauseRef': matched[0].id,
              'settle': NATURAL_SETTLE}], matched[0].sourceRefs, consumer, NATURAL_SETTLE)
        return conditions, refs, []
    if action.name in NAVIGATION_ACTIONS:
        navigation = navigation_postconditions(action, pre, post, consumer)
        if navigation is not None:
            return navigation
    if action.name == 'wait':
        playing = fact_value(post, 'media_playback')
        if playing is not None and playing.value == 'playing':
            return ([{'kind': 'media_playback', 'equals': 'playing', 'clauseRef': playing.id,
                      'settle': NATURAL_SETTLE}], playing.sourceRefs, [])
        before, after = fact_value(pre, 'url_digest'), fact_value(post, 'url_digest')
        if (before is not None and after is not None and isinstance(after.value, str)
                and before.value == after.value):
            # WHY：固定等待本身没有业务副作用；复跑只需证明它没有把当前动态页面切走，
            # 不能把样本 URL 固化成 equals，也不能因 DOM 在等待中异步变化而制造 gap。
            return ([{'kind': 'url_digest', 'unchanged': True, 'clauseRef': after.id}],
                    unique_refs([*before.sourceRefs, *after.sourceRefs]), [])
    target_condition = target_value_condition(action, post, target, bindings)
    if target_condition is not None:
        conditions, refs, issues = target_condition
        if consumer is not None:
            conditions, refs = with_consumer_readiness(
                conditions, refs, consumer, NATURAL_SETTLE)
        return conditions, refs, issues
    if consumer is not None and action.name != 'scroll':
        conditions, refs = with_consumer_readiness([], [], consumer, NATURAL_SETTLE)
        return conditions, refs, []
    effect_condition, effect_limitation = natural_effect_condition(action, pre, post)
    if effect_condition is not None:
        if consumer is not None:
            conditions, refs, issues = effect_condition
            conditions, refs = with_consumer_readiness(conditions, refs, consumer, NATURAL_SETTLE)
            return conditions, refs, issues
        return effect_condition
    if action.name == 'scroll':
        return [], [], [gap('missing_effect_proof', [action.id],
                            effect_limitation or 'natural_concrete_effect_missing', 'collect_evidence')]
    # WHY：地址变化只作为原生后退的导航结果，不替普通点击证明业务完成。
    for kind in (('url_digest', 'url') if action.name == 'go_back' else ()):
        before, after = fact_value(pre, kind), fact_value(post, kind)
        if before is not None and after is not None and before.value != after.value:
            return ([{'kind': kind, 'changed': True, 'clauseRef': after.id, 'settle': NATURAL_SETTLE}],
                    after.sourceRefs, [])
    if effect_limitation is not None:
        return [], [], [gap('missing_effect_proof', [action.id], effect_limitation, 'collect_evidence')]
    if action.name in ('scroll', 'send_keys'):
        return [], [], [gap('missing_effect_proof', [action.id],
                            'natural_concrete_effect_missing', 'collect_evidence')]
    if dependencies is not None:
        from .natural_prefix_dependency import defer_consumer_readiness
        if defer_consumer_readiness(action, pre, post, dependencies):
            return [], [], []
    return [], [], [gap('missing_effect_proof', [action.id],
                        'natural_postcondition_evidence_missing', 'collect_evidence')]


def natural_effect_condition(action, pre, post):
    limitation = None
    for kind in NATURAL_EFFECT_KINDS.get(action.name, ()):
        before, after = fact_value(pre, kind), fact_value(post, kind)
        # WHY：点击目标已经聚焦仍有明确物理后态；不要求焦点必须变化，且不能以 false
        # 或单纯 trusted dispatch 为完成证据。旧来源不含 focused，仍走原有规则。
        if (kind == 'target_state' and after is not None and deterministic_target_state(after.value)
                and json.loads(after.value).get('focused') is True):
            return ([{'kind': kind, 'equals': after.value, 'clauseRef': after.id,
                      'settle': NATURAL_SETTLE}], after.sourceRefs, []), None
        if before is not None and after is not None and before.value != after.value:
            if kind == 'focused_element':
                return ([{'kind': kind, 'changed': True, 'clauseRef': after.id,
                          'settle': NATURAL_SETTLE}], after.sourceRefs, []), None
            if kind == 'media_playback' and after.value == 'playing':
                condition = {'kind': kind, 'equals': 'playing', 'clauseRef': after.id,
                             'settle': NATURAL_SETTLE}
                return ([condition], after.sourceRefs, []), None
            if kind == 'scroll_position':
                # WHY：页面位置变化只证明 scroll 动作确实生效；结果完成仍由独立的
                # ReadSpec、输出装配和集合范围证据核验，不能把滚动本身当作业务完成。
                condition = {'kind': kind, 'changed': True, 'clauseRef': after.id,
                             'settle': NATURAL_SETTLE}
                return ([condition], after.sourceRefs, []), None
            if kind == 'target_state' and deterministic_target_state(after.value):
                condition = {'kind': kind, 'equals': after.value, 'clauseRef': after.id,
                             'settle': NATURAL_SETTLE}
                return ([condition], after.sourceRefs, []), None
            if kind == 'visible_overlays' and after.value == EMPTY_OVERLAYS:
                condition = {'kind': kind, 'equals': EMPTY_OVERLAYS, 'clauseRef': after.id,
                             'settle': NATURAL_SETTLE}
                return ([condition], after.sourceRefs, []), None
            limitation = ('media_playback_change_not_completion_proof' if kind == 'media_playback'
                          else 'scroll_position_change_not_completion_proof' if kind == 'scroll_position'
                          else 'visible_overlays_change_not_completion_proof' if kind == 'visible_overlays'
                          else 'target_state_value_not_deterministic')
    return None, limitation


def delayed_natural_post(trace, registry, action, pre):
    if pre is None:
        return None, []
    observations = {item.id: item for item in trace.observations}
    immediate = observations.get(action.postObservationRef)
    if immediate_natural_completion(action, pre, immediate):
        return None, []
    kinds = [kind for kind in NATURAL_EFFECT_KINDS.get(action.name, ()) if kind != 'scroll_position']
    if action.name in ('navigate', 'go_back', *NAVIGATION_ACTIONS):
        kinds.extend(['url_digest', 'url'])
    for kind in kinds:
        condition = {'kind': kind, 'changed': True, 'settle': NATURAL_SETTLE}
        def prove(observation, *, current=condition):
            before, after = fact_value(pre, current['kind']), fact_value(observation, current['kind'])
            return [current] if before is not None and after is not None and before.value != after.value else []
        post, waits = delayed_post_for_conditions(trace, registry, action, [condition], prove)
        if post is not None:
            return post, waits
    return None, []


def immediate_natural_completion(action, pre, post):
    if post is None:
        return False
    # WHY：capture 会为 click 也记录 target_value；只有原生值输入动作能把它当作完成证据。
    if action.name in ('input', 'select_dropdown') and natural_facts(post, 'target_value', action.id):
        return True
    if action.name == 'navigate':
        facts = natural_facts(post, 'natural_postcondition', action.id)
        if any(fact.value.get('matched') is True for fact in facts):
            return True
    kinds = [kind for kind in NATURAL_EFFECT_KINDS.get(action.name, ()) if kind != 'scroll_position']
    if action.name in ('go_back', *NAVIGATION_ACTIONS):
        kinds.extend(['url_digest', 'url'])
    for kind in kinds:
        before, after = fact_value(pre, kind), fact_value(post, kind)
        if before is None or after is None or before.value == after.value:
            continue
        if kind == 'target_state' and not deterministic_target_state(after.value):
            continue
        if kind == 'media_playback' and after.value != 'playing':
            continue
        if kind == 'visible_overlays' and after.value != EMPTY_OVERLAYS:
            continue
        return True
    return False


def deterministic_target_state(value):
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return False
    return (isinstance(parsed, dict) and bool(parsed) and not set(parsed) - TARGET_STATE_KEYS
            and all(type(item) is bool for item in parsed.values())
            and json.dumps(parsed, ensure_ascii=False, sort_keys=True, separators=(',', ':')) == value)


def target_value_condition(action, post, target, bindings):
    if target is None:
        return None
    facts = natural_facts(post, 'target_value', action.id)
    for binding in bindings:
        expected = ({'inputRef': binding['binding']['path']} if binding['binding'].get('source') == 'input'
                    else binding['binding'].get('value'))
        redacted_expected = ('<redacted:' + digest(expected) + '>'
                             if binding['binding'].get('source') == 'constant'
                             and isinstance(expected, str) else None)
        matched = [fact for fact in facts if isinstance(fact.value, dict)
                   and (fact.value.get('value') == expected
                        or (redacted_expected is not None and fact.value.get('value') == redacted_expected))]
        if len(matched) == 1:
            fact = matched[0]
            return ([{'kind': 'target_value', 'bindingArgument': binding['argumentPath'], 'clauseRef': fact.id}],
                    fact.sourceRefs, [])
    return None


def natural_facts(observation, kind, action_ref):
    return [fact for fact in observation.facts if fact.kind == kind and isinstance(fact.value, dict)
            and fact.value.get('actionRef') == action_ref]


def fact_value(observation, kind):
    values = [fact for fact in observation.facts if fact.kind == kind]
    return values[0] if len(values) == 1 else None


def unique_refs(refs):
    found = {}
    for ref in refs:
        if ref is not None:
            if isinstance(ref, dict):
                ref = EvidenceRef.model_validate(ref)
            found[(ref.ref, ref.digest)] = ref
    return list(found.values())
