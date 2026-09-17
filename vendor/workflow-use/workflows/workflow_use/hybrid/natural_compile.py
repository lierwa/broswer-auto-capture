"""Evidence-only classification for bat-hybrid/2 natural Agent traces."""
import json

from .action_dispatch import not_dispatched_coverage
from .bindings import classify_binding
from .capability import TARGET_ACTIONS
from .causal import delayed_post_for_conditions, supporting_wait
from .coverage import failed_native_dom_lookup_coverage, search_page_coverage, validate_coverage
from .evidence import ActionCoverage, EvidenceRef, digest, gap
from .natural_facts import IGNORED_TECHNICAL_PARAMETERS, NaturalBindingFact, is_native_parameter
from .natural_output import compile_natural_output_assembly
from .natural_reads import compile_verified_read
from .natural_target_compile import natural_target
from .postconditions import declared_checks
from .registry import action_effect
from .summary_compile import compile_verified_summary
from .target_scroll import TargetScrollParams, VerifiedTargetScroll
from .visible_wait_compile import compile_visible_wait, failed_visible_wait_coverage

ADMITTED = frozenset({'navigate', 'go_back', 'wait', 'scroll', 'send_keys', *TARGET_ACTIONS})
NATURAL_EFFECT_KINDS = {
    'click': ('target_state', 'visible_overlays'),
    'input': ('target_state',),
    'select_dropdown': ('target_state',),
    'dropdown_options': ('target_state',),
    'scroll': ('scroll_position',),
    'send_keys': ('visible_overlays',),
}
NATURAL_SETTLE = {'maxMs': 30000, 'maxAttempts': 100, 'intervalMs': 300}
TARGET_STATE_KEYS = frozenset({'aria-expanded', 'aria-checked', 'aria-selected', 'aria-disabled',
                               'checked', 'selected', 'disabled'})
EMPTY_OVERLAYS = digest([])


def compile_natural_request(request, registry, compilation_type, linear_graph, source_gaps=(), *, output_schema=None):
    trace, issues, segments, ledger = request.trace, list(source_gaps), [], []
    output_paths, wait_owners = [], {}
    if request.actionRegistryVersion != registry.schemaDigest or trace.source.version != registry.providerVersion:
        issues.append(gap('invalid_source', [], 'registry_version_mismatch', 'reject_trace'))
    if not trace.judged or not trace.completed or trace.finalResultRef is None:
        issues.append(gap('invalid_source', [], 'successful_judged_business_result_required', 'reject_trace'))
    observations = {item.id: item for item in trace.observations}
    for action in trace.actions:
        not_dispatched = not_dispatched_coverage(trace, action) if valid_native_action(registry, action) else None
        if not_dispatched is not None:
            ledger.append(not_dispatched)
            continue
        failed_read = failed_bat_field_read_coverage(registry, action)
        if failed_read is not None:
            ledger.append(failed_read)
            continue
        failed_wait = failed_visible_wait_coverage(
            registry, action, observations.get(action.postObservationRef))
        if failed_wait is not None:
            ledger.append(failed_wait)
            continue
        if action.id in wait_owners:
            ledger.append(ActionCoverage(actionRef=action.id, disposition='supporting',
                ownerSegmentId=wait_owners[action.id], exclusionRule='bounded_postcondition_wait/v1',
                evidenceRefs=[action.resultRef] if action.resultRef else []))
            continue
        if action.name == 'done' and action.status == 'succeeded':
            ledger.append(ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                exclusionRule='agent_done_metadata/v1', evidenceRefs=[action.resultRef] if action.resultRef else []))
            continue
        owner = segments[-1] if segments and ledger and ledger[-1].ownerSegmentId == segments[-1]['id'] else None
        support = supporting_wait(request, registry, action, owner)
        if support is not None:
            ledger.append(support)
            continue
        pre, post = observations.get(action.preObservationRef), observations.get(action.postObservationRef)
        text_lookup = search_page_coverage(registry, action, pre, post)
        if text_lookup is not None:
            ledger.append(text_lookup)
            continue
        lookup = natural_dom_lookup_coverage(registry, action, pre, post)
        if lookup is not None:
            ledger.append(lookup)
            continue
        failed_lookup = failed_native_dom_lookup_coverage(registry, action, pre, post)
        if failed_lookup is not None:
            ledger.append(failed_lookup)
            continue
        delayed, waits = delayed_natural_post(trace, registry, action, pre)
        if delayed is not None:
            post = delayed
        segment, path, action_issues = classify_natural_action(
            request, registry, action, pre, post, output_schema, output_paths, segments)
        issues.extend(action_issues)
        if segment is not None:
            segments.append(segment)
            for wait in waits:
                wait_owners[wait.id] = segment['id']
                before, after = observations[wait.preObservationRef], observations[wait.postObservationRef]
                segment['proofRefs'].extend(ref.model_dump(mode='json') for ref in
                                            [wait.resultRef, *before.sourceRefs, *after.sourceRefs])
        if path is not None:
            output_paths.append(path)
        ledger.append(ActionCoverage(actionRef=action.id, disposition='compiled' if segment else 'not_compilable',
            ownerSegmentId=segment['id'] if segment else None, exclusionRule=None,
            evidenceRefs=[action.resultRef] if action.resultRef else []))
    seen = set()
    for segment in segments:
        signature = reuse_digest(segment)
        if signature in seen:
            issues.append(gap('unsupported_capability', [segment['id'][2:]],
                              'repeated_operation_reuse_unproven', 'collect_evidence'))
        seen.add(signature)
    assembly = None
    if request.plan.outputSchemaDigest != digest({'type': 'null'}):
        if isinstance(output_schema, dict) and digest(output_schema) == request.plan.outputSchemaDigest:
            assembly, assembly_issues = compile_natural_output_assembly(trace, output_schema, segments)
            issues.extend(assembly_issues)
        else:
            issues.append(gap('missing_effect_proof', [],
                              'natural_output_schema_required', 'collect_evidence'))
    issues.extend(validate_coverage(trace, ledger, {segment['id'] for segment in segments}, registry=registry))
    issues = sorted({item.id: item for item in issues}.values(), key=lambda item: item.id)
    graph = linear_graph(segments) if not issues else {'entry': '', 'edges': [], 'terminals': []}
    body = {'mediaType': 'application/vnd.bat.hybrid-compilation+json;version=1',
            'compilerVersion': request.compilerVersion,
            'sourceDigests': [request.requirement.digest, request.plan.digest, trace.digest,
                              digest(request.runtimeInputSchema), digest([]), registry.schemaDigest],
            'segments': segments, 'controlGraph': graph,
            'outputAssembly': assembly,
            'coverage': [item.model_dump(mode='json') for item in ledger],
            'gaps': [item.model_dump(mode='json') for item in issues]}
    return compilation_type.model_validate({**body, 'canonicalDigest': digest(body)})


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
                            prior_segments=()):
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
    if pre.tabId != post.tabId:
        return None, None, [gap('unsupported_capability', [action.id], 'cross_tab_state_contract_required', 'add_capability')]
    if action.name == 'bat_summarize':
        return compile_verified_summary(request, action, pre, post, output_schema, prior_segments, prior_paths)
    if action.name in ('extract', 'bat_read_fields'):
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
    bindings, binding_issues = natural_bindings(request, action, pre, target is not None)
    postconditions, post_refs, post_issues = natural_postconditions(
        action, pre, post, target, bindings)
    issues = [*target_issues, *binding_issues, *post_issues]
    if issues:
        return None, None, issues
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


def natural_bindings(request, action, pre, has_target):
    args = action.args if isinstance(action.args, dict) else {}
    decisions, issues = [], []
    facts = [fact for fact in pre.facts if fact.kind == 'natural_binding'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    for key in sorted(args):
        if has_target and key in ('index', 'element_index', 'xpath'):
            continue
        if key in IGNORED_TECHNICAL_PARAMETERS.get(action.name, frozenset()):
            continue
        matches = [fact for fact in facts if fact.value.get('argumentPath') == key]
        if len(matches) != 1:
            issues.append(gap('missing_binding', [action.id],
                              'natural_binding_evidence_missing:' + key, 'collect_evidence'))
            continue
        fact = matches[0]
        try:
            value = NaturalBindingFact.model_validate(fact.value)
        except Exception:
            issues.append(gap('invalid_source', [action.id], 'invalid_natural_binding_fact', 'reject_trace'))
            continue
        kind = classify_binding(value.binding, request.runtimeInputSchema, {})
        if not binding_matches(request, action, key, value, kind):
            issues.append(gap('missing_binding', [action.id],
                              'natural_binding_provenance_mismatch:' + key, 'collect_evidence'))
            continue
        decisions.append({'id': f'b-{action.id}-{key}', 'actionRef': action.id, 'argumentPath': key,
            'kind': kind, 'sourceRef': fact.id, 'transform': None,
            'proofRefs': [ref.model_dump(mode='json') for ref in fact.sourceRefs], 'binding': value.binding})
    return decisions, issues


def natural_dom_lookup_coverage(registry, action, pre, post):
    if action.name != 'find_elements' or action.status != 'succeeded' or action.resultRef is None:
        return None
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None
    if pre is None or post is None or pre.tabId != post.tabId:
        return None
    before, after = fact_value(pre, 'url_digest'), fact_value(post, 'url_digest')
    if before is None or after is None or before.value != after.value:
        return None
    queries = [fact for fact in post.facts if fact.kind == 'dom_query' and isinstance(fact.value, dict)
               and fact.value.get('actionRef') == action.id]
    if len(queries) != 1:
        return None
    scope = queries[0].value.get('scope') or {}
    if (scope.get('tabId') != pre.tabId or scope.get('frameId') is not None
            or scope.get('urlDigest') != before.value):
        return None
    references = unique_refs([action.resultRef, *queries[0].sourceRefs])
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule='native_dom_lookup_observation/v1', evidenceRefs=references)


def binding_matches(request, action, key, fact, kind):
    if fact.provenance == 'runtime_input':
        return kind == 'runtime_input'
    if fact.provenance == 'native_parameter':
        return (kind == 'authorized_constant' and is_native_parameter(action.name, key, action.args[key])
                and digest(fact.binding.get('value')) == digest(action.args[key]))
    return (fact.provenance == 'task_literal' and kind == 'authorized_constant'
            and fact.taskQuote == fact.binding.get('value') == action.args[key]
            and isinstance(fact.taskQuote, str) and fact.taskQuote in request.requirement.text)


def natural_postconditions(action, pre, post, target, bindings):
    if action.name == 'navigate':
        facts = natural_facts(post, 'natural_postcondition', action.id)
        matched = [fact for fact in facts if fact.value == {'actionRef': action.id, 'kind': 'url',
                                                            'bindingArgument': 'url', 'matched': True}]
        return ([{'kind': 'url', 'bindingArgument': 'url', 'clauseRef': matched[0].id,
                  'settle': NATURAL_SETTLE}],
                matched[0].sourceRefs, []) if len(matched) == 1 else (
                [], [], [gap('missing_effect_proof', [action.id],
                             'navigate_url_binding_not_observed', 'collect_evidence')])
    target_condition = target_value_condition(action, post, target, bindings)
    if target_condition is not None:
        return target_condition
    effect_condition, effect_limitation = natural_effect_condition(action, pre, post)
    if effect_condition is not None:
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
    return [], [], [gap('missing_effect_proof', [action.id],
                        'natural_postcondition_evidence_missing', 'collect_evidence')]


def natural_effect_condition(action, pre, post):
    limitation = None
    for kind in NATURAL_EFFECT_KINDS.get(action.name, ()):
        before, after = fact_value(pre, kind), fact_value(post, kind)
        if before is not None and after is not None and before.value != after.value:
            if kind == 'target_state' and deterministic_target_state(after.value):
                condition = {'kind': kind, 'equals': after.value, 'clauseRef': after.id,
                             'settle': NATURAL_SETTLE}
                return ([condition], after.sourceRefs, []), None
            if kind == 'visible_overlays' and after.value == EMPTY_OVERLAYS:
                condition = {'kind': kind, 'equals': EMPTY_OVERLAYS, 'clauseRef': after.id,
                             'settle': NATURAL_SETTLE}
                return ([condition], after.sourceRefs, []), None
            limitation = ('scroll_position_change_not_completion_proof' if kind == 'scroll_position'
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
    if action.name in ('navigate', 'go_back'):
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
    if action.name == 'go_back':
        kinds.extend(['url_digest', 'url'])
    for kind in kinds:
        before, after = fact_value(pre, kind), fact_value(post, kind)
        if before is None or after is None or before.value == after.value:
            continue
        if kind == 'target_state' and not deterministic_target_state(after.value):
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


def reuse_digest(segment):
    if segment['kind'] == 'explicit_llm':
        return digest({key: value for key, value in segment.items() if key != 'id'})
    return digest({'operation': segment['operation'], 'target': segment['target'],
        'bindings': [{'argumentPath': item['argumentPath'], 'kind': item['kind'], 'binding': item['binding']}
                     for item in segment['bindings']],
        'postconditions': [{key: value for key, value in item.items() if key != 'clauseRef'}
                           for item in segment['postconditions']], 'outputs': segment['outputs']})
