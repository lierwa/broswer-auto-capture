"""Keep only replay reads whose values feed a real action or final result."""

from .action_dispatch import NOT_DISPATCHED_RULE, not_dispatched_coverage
from .coverage import native_dom_lookup_observation_coverage, unused_verified_dom_read_coverage
from .evidence import gap
from .natural_readiness import consumer_readiness_by_action


def consumed_query_ids(trace, segments):
    """Return reads referenced by retained executable consumers or the final result."""
    references = set()
    for segment in segments:
        for key in ('bindings', 'target', 'inputBindings'):
            references.update(_node_refs(segment.get(key)))
    for observation in trace.observations:
        for fact in observation.facts:
            # WHY：自然绑定、DOM 结构与选择函数是来源证明；只有编译进执行段、最终输出或
            # repeat method 的引用才是复跑消费者，历史证明本身不能让探查读取继续存活。
            if fact.kind == 'verified_output_assembly' and isinstance(fact.value, dict):
                references.update(_node_refs(fact.value.get('fields')))
            if fact.kind == 'repeat_method' and isinstance(fact.value, dict):
                references.update(row.get(key) for row in fact.value.get('iterations', [])
                    for key in ('readActionRef', 'continuationActionRef', 'advanceActionRef')
                    if isinstance(row, dict) and isinstance(row.get(key), str))
    return {reference.removeprefix('s-') for reference in references}


def retire_unused_discovery(request, registry, ledger, issues, consumed):
    observations = {item.id: item for item in request.trace.observations}
    actions = {item.id: item for item in request.trace.actions}
    replacements = {}
    for row in ledger:
        if row.disposition != 'not_compilable' or row.actionRef in consumed:
            continue
        action = actions.get(row.actionRef)
        if action is None:
            continue
        proven = native_dom_lookup_observation_coverage(registry, action,
            observations.get(action.preObservationRef), observations.get(action.postObservationRef),
            allow_complete_discovery=True)
        if proven is not None:
            replacements[action.id] = proven
    # WHY：只撤销无执行消费者的探查所派生的读取缺口；原 trace/sourceGaps 不写回，也不补造读取事实。
    unresolved = [issue for issue in issues if not (
        issue.code == 'missing_effect_proof' and issue.resolution == 'collect_evidence'
        and len(issue.actionRefs) == 1 and issue.actionRefs[0] in replacements and not issue.clauseRefs
        and issue.reason in ('find_elements_read_evidence_missing', 'natural_field_read_evidence_missing'))]
    return [replacements.get(row.actionRef, row) for row in ledger], unresolved


def _node_refs(value):
    if isinstance(value, list):
        return {node for item in value for node in _node_refs(item)}
    if not isinstance(value, dict):
        return set()
    found = set()
    if value.get('source') == 'node' and isinstance(value.get('nodeId'), str):
        found.add(value['nodeId'])
    for child in value.values():
        found.update(_node_refs(child))
    return found


def prune_unused_queries(request, registry, segments, ledger, *, repeat_lookup_ids=frozenset()):
    """Retire only a proven, pure find_elements read with no value consumer."""
    consumed = consumed_query_ids(request.trace, segments)
    actions = {item.id: item for item in request.trace.actions}
    observations = {item.id: item for item in request.trace.observations}
    coverage = {item.actionRef: item for item in ledger}
    retained, replacements, issues = [], {}, []
    for segment in segments:
        action_id = segment['id'].removeprefix('s-')
        action = actions.get(action_id)
        if (segment.get('operation', {}).get('name') != 'browser.read-fields'
                or action is None or action.name != 'find_elements' or action_id in consumed
                or action_id in repeat_lookup_ids):
            retained.append(segment)
            continue
        original = coverage.get(action_id)
        retired = unused_verified_dom_read_coverage(
            registry, action, observations.get(action.preObservationRef),
            observations.get(action.postObservationRef))
        if (original is None or original.disposition != 'compiled'
                or original.ownerSegmentId != segment['id'] or retired is None):
            issues.append(gap('invalid_source', [action_id], 'unused_verified_dom_read_unproven', 'reject_trace'))
            retained.append(segment)
            continue
        replacements[action_id] = retired
    updated = [replacements.get(row.actionRef, row) for row in ledger]
    return retained, updated, consumed, issues


def rebind_consumer_readiness(trace, segments, ledger):
    """Tie delayed effects to the first retained consumer across only proven non-dispatches."""
    actions = {item.id: item for item in trace.actions}
    allowed = {item['id'].removeprefix('s-') for item in segments
               if item.get('operation', {}).get('name') == 'browser.read-fields'}
    harmless = set()
    for row in ledger:
        action = actions.get(row.actionRef)
        if (row.disposition == 'agent_internal' and row.exclusionRule == NOT_DISPATCHED_RULE
                and action is not None and row == not_dispatched_coverage(trace, action)):
            harmless.add(row.actionRef)
    previous_readiness = consumer_readiness_by_action(trace)
    readiness = consumer_readiness_by_action(
        trace, allowed_consumer_ids=allowed, proven_not_dispatched_ids=harmless)
    issues, unproven = [], set()
    for segment in segments:
        if segment.get('operation', {}).get('name') != 'browser.workflow-step':
            continue
        conditions = segment.get('postconditions', [])
        previous = [item for item in conditions if item.get('consumerRef') is not None]
        current = readiness.get(segment['id'].removeprefix('s-'))
        if not previous and current is None:
            continue
        if len(previous) > 1:
            issues.append(gap('invalid_source', [segment['id'].removeprefix('s-')],
                              'consumer_readiness_ambiguous', 'reject_trace'))
            continue
        direct = [item for item in conditions if item.get('consumerRef') is None]
        proven_direct = [item for item in direct if isinstance(item.get('clauseRef'), str)]
        # WHY：裁掉探查读取后，已有来源 clause 的物理后态仍能独立证明动作；无来源的占位
        # 条件或仅有 consumer wait 的动作不能借此绕过缺证。
        if current is None and previous and not proven_direct:
            issues.append(gap('missing_effect_proof', [segment['id'].removeprefix('s-')],
                              'consumer_readiness_live_read_required', 'collect_evidence'))
        segment['postconditions'] = [*direct, *([current['condition']] if current else [])]
        if not segment['postconditions']:
            unproven.add(segment['id'])
        old = previous_readiness.get(segment['id'].removeprefix('s-'))
        if previous and old is not None and previous[0] == old['condition']:
            obsolete = {_ref_key(item) for item in old['proofRefs']}
            protected = _producer_proof_keys(trace, actions.get(segment['id'].removeprefix('s-')), segment)
            segment['proofRefs'] = [item for item in segment.get('proofRefs', [])
                                    if _ref_key(item) not in obsolete or _ref_key(item) in protected]
        if current:
            refs = [*segment.get('proofRefs', []),
                    *[item.model_dump(mode='json') for item in current['proofRefs']]]
            segment['proofRefs'] = list({(item['ref'], item['digest']): item for item in refs}.values())
    # WHY：失去唯一消费者后态的动作只能留下 typed gap 与不可编译审计，不能输出空后态执行段。
    segments[:] = [segment for segment in segments if segment['id'] not in unproven]
    ledger[:] = [row.model_copy(update={'disposition': 'not_compilable', 'ownerSegmentId': None,
                                       'exclusionRule': None})
                 if row.ownerSegmentId in unproven else row for row in ledger]
    return issues


def _ref_key(value):
    return (value['ref'], value['digest']) if isinstance(value, dict) else (value.ref, value.digest)


def _producer_proof_keys(trace, action, segment):
    if action is None:
        return set()
    observations = {item.id: item for item in trace.observations}
    refs = [action.resultRef] if action.resultRef is not None else []
    for identity in (action.preObservationRef, action.postObservationRef):
        observation = observations.get(identity)
        if observation is not None:
            refs.extend(observation.sourceRefs)
            refs.extend(ref for fact in observation.facts for ref in fact.sourceRefs)
    for binding in segment.get('bindings', []):
        refs.extend(binding.get('proofRefs', []))
    return {_ref_key(item) for item in refs}
