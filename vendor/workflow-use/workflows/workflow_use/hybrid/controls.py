"""Compile source-backed control intent into edges; execution remains entirely in LangGraph."""
from copy import deepcopy

from .evidence import digest, gap
from .alignment import segment_clause_refs


def source_clause(request, intent, key):
    expected = intent.model_dump(exclude={'id', 'clauseRefs'})
    return any(clause.id in intent.clauseRefs and clause.expression == {key: expected}
               for clause in request.requirement.clauses)


def compile_loops(request, segments, ledger):
    result, controls, issues = deepcopy(segments), [], []
    occupied = set()
    for intent in request.control.loops:
        if (intent.stableItemKey is not None or len(intent.stopOutcomes) != 4
                or set(intent.stopOutcomes) != {'complete', 'exhausted', 'blocked', 'failed'}):
            issues.append(gap('unsupported_capability', [], 'loop_policy_not_mapped', 'add_capability', intent.clauseRefs))
            continue
        groups = loop_evidence(request, intent, result)
        if not source_clause(request, intent, 'loop') or not groups:
            issues.append(gap('missing_control_intent', [], 'loop_requires_authorized_body_and_stop', 'confirm_intent', intent.clauseRefs))
            continue
        ids = [item for group in groups for item in group]
        by_id = {segment['id']: segment for segment in result}
        if occupied.intersection(ids) or not set(ids) <= by_id.keys() or len(ids) != len(set(ids)):
            issues.append(gap('incomplete_action_coverage', [], 'loop_body_overlap_or_missing', 'reject_trace', intent.clauseRefs))
            continue
        start = next(i for i, segment in enumerate(result) if segment['id'] == ids[0])
        contiguous = [segment['id'] for segment in result[start:start + len(ids)]] == ids
        signatures = [[operation_digest(by_id[item], {member.removeprefix('s-'): f'body-{i}' for i, member in enumerate(group)})
                       for item in group] for group in groups]
        if not contiguous or any(signature != signatures[0] for signature in signatures[1:]):
            issues.append(gap('missing_control_intent', [], 'loop_iterations_not_equivalent', 'collect_evidence', intent.clauseRefs))
            continue
        canonical = groups[0]
        aliases = {item: canonical[index] for group in groups for index, item in enumerate(group)}
        for row in ledger:
            if row.ownerSegmentId in aliases:
                row.ownerSegmentId = aliases[row.ownerSegmentId]
        for group in groups[1:]:
            for index, item in enumerate(group):
                if by_id[item]['kind'] == 'deterministic':
                    by_id[canonical[index]]['proofRefs'].extend(by_id[item]['proofRefs'])
        result = [segment for segment in result if segment['id'] not in ids or segment['id'] in canonical]
        occupied.update(ids)
        controls.append({'id': 'loop-' + intent.id, 'kind': 'loop', 'body': canonical,
                         'maxIterations': intent.maxIterations, 'continuePredicate': intent.continuePredicate,
                         'accumulator': intent.accumulator, 'stableItemKey': intent.stableItemKey,
                         'clauseRefs': intent.clauseRefs})
    return result, controls, issues


def loop_evidence(request, intent, segments=()):
    clause = next((item for item in request.requirement.clauses if item.id == intent.bodyRef), None)
    if clause is None or not isinstance(clause.expression, dict):
        return None
    if set(clause.expression) == {'bodyClauses'}:
        return semantic_loop_evidence(request, intent, clause.expression['bodyClauses'], segments)
    if set(clause.expression) != {'iterations'}:
        return None
    groups = clause.expression['iterations']
    if not isinstance(groups, list) or not groups or len(groups) > intent.maxIterations:
        return None
    if any(not isinstance(group, list) or not group or not all(isinstance(item, str) for item in group) for group in groups):
        return None
    return [['s-' + action_id for action_id in group] for group in groups]


def semantic_loop_evidence(request, intent, body, segments):
    if (not isinstance(body, list) or not body or not all(isinstance(item, str) for item in body)
            or len(set(body)) != len(body) or not set(body) <= {clause.id for clause in request.requirement.clauses}):
        return None
    matches = [set(body).intersection(segment_clause_refs(segment)) for segment in segments]
    positions = [index for index, matched in enumerate(matches) if matched]
    if not positions:
        return None
    selected = segments[positions[0]:positions[-1] + 1]
    actual = matches[positions[0]:positions[-1] + 1]
    count, remainder = divmod(len(selected), len(body))
    if remainder or not 0 < count <= intent.maxIterations:
        return None
    # WHY：历史只绑定已确认体中的条款；缺步骤、交错动作或一段同时匹配多个位置都拒绝。
    if any(matched != {body[index % len(body)]} for index, matched in enumerate(actual)):
        return None
    return [[segment['id'] for segment in selected[start:start + len(body)]]
            for start in range(0, len(selected), len(body))]


def operation_digest(segment, aliases=None):
    body = {key: value for key, value in segment.items() if key not in ('id', 'proofRefs', 'preconditions', 'bindings')}
    body['bindings'] = [{key: value for key, value in binding.items() if key not in ('id', 'actionRef', 'proofRefs')}
                        for binding in segment.get('bindings', [])]
    if aliases and body.get('inputBindings'):
        body['inputBindings'] = [{**binding, 'nodeId': aliases.get(binding['nodeId'], binding['nodeId'])}
                                 if binding.get('source') == 'node' else binding for binding in body['inputBindings']]
    return digest(body)


def wire_controls(graph, controls):
    graph = deepcopy(graph)
    for control in controls:
        first, last = control['body'][0], control['body'][-1]
        next_edge = next(edge for edge in graph['edges'] if edge['from'] == last and edge['outcome'] == 'success')
        following = next_edge['to']
        for edge in graph['edges']:
            if edge['to'] == first:
                edge['to'] = control['id']
        next_edge['to'] = control['id']
        graph['edges'].extend([{'from': control['id'], 'outcome': 'body', 'to': first},
                               {'from': control['id'], 'outcome': 'done', 'to': following},
                               {'from': control['id'], 'outcome': 'limit', 'to': 'failed'},
                               {'from': control['id'], 'outcome': 'failed', 'to': 'failed'}])
        if graph['entry'] == first:
            graph['entry'] = control['id']
    return graph


def wire_branches(request, graph, segments=()):
    graph = deepcopy(graph)
    issues = []
    segment_ids = {row['from'] for row in graph['edges']}
    observations = {observation.id: observation for observation in request.trace.observations}
    for intent in request.control.branches:
        reference = intent.outcomes.get('true', '')
        matches = [segment['id'] for segment in segments if reference.removeprefix('clause:') in segment_clause_refs(segment)]
        target = (matches[0] if len(matches) == 1 else '') if reference.startswith('clause:') else 's-' + reference
        action = next((item for item in request.trace.actions if 's-' + item.id == target), None)
        pre = observations.get(action.preObservationRef) if action else None
        proof = {'branchId': intent.id, 'outcome': 'true', 'predicate': intent.predicate}
        proven = pre is not None and any(f.kind == 'branch_choice' and f.value == proof for f in pre.facts)
        pure_input = intent.predicateSource.get('source') == 'input'
        if not source_clause(request, intent, 'branch') or not pure_input:
            issues.append(gap('missing_control_intent', [], 'source_backed_pure_branch_required', 'confirm_intent', intent.clauseRefs))
            continue
        if not proven or target not in segment_ids or intent.outcomes.get('false') != 'completed' or target != graph['entry']:
            issues.append(gap('missing_effect_proof', [], 'unvisited_branch_requires_verified_subchain', 'collect_evidence', intent.clauseRefs))
            continue
        graph['entry'] = 'branch-' + intent.id
        graph['edges'].extend([{'from': graph['entry'], 'outcome': 'true', 'to': target},
                               {'from': graph['entry'], 'outcome': 'false', 'to': 'completed'},
                               {'from': graph['entry'], 'outcome': 'failed', 'to': 'failed'}])
    return graph, issues
