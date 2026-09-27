"""Fold a proven tail repeat into the existing loop IR; no replay scheduler."""
from copy import deepcopy

from .evidence import ActionCoverage, digest, gap
from .natural_repeat_evidence import sample_action_refs, validate_repeat_method, verified_read
from .natural_repeat_actions import assert_same_page_segments, repeat_mode

SAMPLE_RULE = 'repeat_method_sample/v1'


def repeat_context(request):
    facts = [fact for observation in request.trace.observations for fact in observation.facts
             if fact.kind == 'repeat_method']
    if not facts:
        return None, []
    try:
        if len(facts) != 1:
            raise ValueError('repeat_method_count_invalid')
        fact = facts[0]
        value = validate_repeat_method(request.trace, fact.value, request.requirement.sourceDigest)
        if not fact.sourceRefs or not any(ref.digest == digest(value) for ref in fact.sourceRefs):
            raise ValueError('repeat_method_digest_mismatch')
        refs = sample_action_refs(request.trace, value)
        declared = {ref for row in value['iterations'] for ref in row.values() if ref}
        lookup_refs = {action.id for action in request.trace.actions
                       if action.id in set(refs) - declared and action.name == 'find_elements'}
        validation_refs = {action.id for action in request.trace.actions
                           if action.id in set(refs) - declared and action.name == 'bat_validate_selection'}
        return {'fact': fact, 'value': value, 'sampleRefs': refs,
                'probeRefs': set(refs) - declared - lookup_refs - validation_refs,
                'lookupRefs': lookup_refs, 'validationRefs': validation_refs}, []
    except Exception:
        return None, [gap('invalid_source', [], 'repeat_method_evidence_invalid', 'reject_trace')]


def repeat_sample_coverage(context, action, owner=None):
    first = context['value']['iterations'][0]
    owner = owner or 's-' + first['continuationActionRef']
    return ActionCoverage(actionRef=action.id, disposition='supporting', ownerSegmentId=owner,
                          exclusionRule=SAMPLE_RULE, evidenceRefs=[action.resultRef, *context['fact'].sourceRefs])


def derived_repeat_navigation_binding(request, action, key, expected, prior_segments):
    """Bind equivalent DOM links only within a completely proven repeat method."""
    if action.name != 'navigate' or key != 'url':
        return None
    context, issues = repeat_context(request)
    if context is None or issues:
        return None
    rows = [row for row in context['value']['iterations'] if row['advanceActionRef'] == action.id]
    if len(rows) != 1:
        return None
    query_ref = rows[0]['continuationActionRef']
    _, query, _, post = verified_read(request.trace, query_ref)
    facts = [fact for fact in post.facts if fact.kind == 'verified_natural_read'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == query_ref]
    segment = next((item for item in prior_segments if item['id'] == 's-' + query_ref), None)
    if (len(facts) != 1 or segment is None or not query.output
            or any(item.get('attribute_href') != expected for item in query.output)
            or facts[0].id not in {item.get('sourceRef') for item in segment.get('outputs', [])}):
        return None
    refs = {(ref.ref, ref.digest): ref for ref in [*context['fact'].sourceRefs, *facts[0].sourceRefs]}
    # WHY：重复链接可有同一目的地；此专用证明不改变普通值绑定的唯一来源路径规则。
    return {'id': f'b-{action.id}-{key}', 'actionRef': action.id, 'argumentPath': key,
        'kind': 'prior_output', 'sourceRef': context['fact'].id, 'transform': None,
        'derivation': 'repeat_destination', 'proofRefs': [ref.model_dump(mode='json') for ref in refs.values()],
        'binding': {'source': 'node', 'nodeId': query_ref, 'path': [0, 'attribute_href']}}


def fold_repeat(request, context, segments, ledger):
    if context is None:
        return segments, ledger, [], []
    try:
        return _fold_repeat(request, context, segments, ledger)
    except Exception:
        return segments, ledger, [], [gap('missing_control_intent', context['sampleRefs'],
            'repeat_method_compilation_unproven', 'collect_evidence')]


def _fold_repeat(request, context, segments, ledger):
    value, fact = context['value'], context['fact']
    first = value['iterations'][0]
    keep = ['s-' + first[key] for key in ('readActionRef', 'continuationActionRef', 'advanceActionRef')]
    by_id = {segment['id']: segment for segment in segments}
    if any(identity not in by_id for identity in keep):
        raise ValueError('repeat_method_body_missing')
    read, query, advance = [by_id[identity] for identity in keep]
    if any(segment['kind'] != 'deterministic' for segment in (read, query, advance)):
        raise ValueError('repeat_method_body_kind')
    mode = repeat_mode(request.trace, value)
    if mode == 'href':
        expected = {'source': 'node', 'nodeId': first['continuationActionRef'], 'path': [0, 'attribute_href']}
        if (advance['operation'].get('actionName') != 'navigate' or advance.get('target') is not None
                or not any(binding['argumentPath'] == 'url' and binding['kind'] == 'prior_output'
                           and binding['binding'] == expected for binding in advance['bindings'])):
            raise ValueError('repeat_method_dynamic_advance_missing')
    else:
        assert_same_page_segments(request.trace, value, segments, mode)
    owned = set(context['sampleRefs'])
    start = next(index for index, segment in enumerate(segments) if segment['id'] == keep[0])
    if any(segment['id'].removeprefix('s-') not in owned for segment in segments[start:]):
        raise ValueError('repeat_method_non_tail_segment')
    aliases = _sample_aliases(value, context['probeRefs'] | context['lookupRefs'])
    actions = {action.id: action for action in request.trace.actions}
    # WHY：折叠只改执行节点归属，原动作、回执和 readiness clauseRef 仍留在不可变来源。
    folded = deepcopy(segments[:start] + [read, query, advance])
    for segment in folded:
        for condition in segment.get('postconditions', []):
            consumer = condition.get('consumerRef', '').removeprefix('s-')
            if consumer in aliases:
                condition['consumerRef'] = aliases[consumer]
    updated = [repeat_sample_coverage(context, actions[row.actionRef], aliases[row.actionRef])
               if row.actionRef in aliases else row for row in ledger]
    metadata = {'id': 'repeat-' + first['readActionRef'], 'sourceRef': fact.id,
        'proofRefs': [ref.model_dump(mode='json') for ref in fact.sourceRefs],
        'readSegmentId': keep[0], 'continuationSegmentId': keep[1], 'advanceSegmentId': keep[2],
        'outputPath': value['outputPath'], 'readPath': verified_read(request.trace, first['readActionRef'])[1].readPath,
        'stableKeyPath': value['stableKeyPath'], 'sampleActionRefs': context['sampleRefs']}
    return folded, updated, [metadata], []


def _sample_aliases(value, probe_refs):
    first = value['iterations'][0]
    aliases = {ref: 's-' + first['continuationActionRef'] for ref in probe_refs}
    for iteration in value['iterations'][1:]:
        for key, action_ref in iteration.items():
            if action_ref:
                aliases[action_ref] = 's-' + first[key]
    return aliases


def validate_repeat_coverage(trace, row):
    if row.exclusionRule != SAMPLE_RULE or row.disposition != 'supporting':
        return False
    facts = [fact for observation in trace.observations for fact in observation.facts if fact.kind == 'repeat_method']
    try:
        if len(facts) != 1 or not isinstance(facts[0].value, dict):
            return False
        fact = facts[0]
        value = validate_repeat_method(trace, fact.value, fact.value['requirementDigest'])
        refs = sample_action_refs(trace, value)
        declared = {ref for iteration in value['iterations'] for ref in iteration.values() if ref}
        validation_refs = {action.id for action in trace.actions if action.name == 'bat_validate_selection'}
        aliases = _sample_aliases(value, set(refs) - declared - validation_refs)
        action = next(item for item in trace.actions if item.id == row.actionRef)
        if row.actionRef not in aliases or not any(ref.digest == digest(value) for ref in fact.sourceRefs):
            return False
        return row == repeat_sample_coverage({'value': value, 'fact': fact}, action, aliases[row.actionRef])
    except Exception:
        return False


def wire_repeat_graph(graph, methods):
    if not methods:
        return graph
    method = methods[0]
    loop, first = 'loop-' + method['id'], 'first-' + method['id']
    read, query, advance = (method[key] for key in ('readSegmentId', 'continuationSegmentId', 'advanceSegmentId'))
    graph = deepcopy(graph)
    for edge in graph['edges']:
        if edge['to'] == read:
            edge['to'] = loop
        if edge['from'] == query and edge['outcome'] == 'success':
            edge['to'] = loop
        if edge['from'] == advance and edge['outcome'] == 'success':
            edge['to'] = read
    if graph['entry'] == read:
        graph['entry'] = loop
    graph['edges'].extend({'from': source, 'outcome': outcome, 'to': target} for source, outcome, target in [
        (loop, 'body', first), (loop, 'done', 'completed'), (loop, 'limit', 'failed'),
        (loop, 'failed', 'failed'),
        (first, 'true', read), (first, 'false', advance), (first, 'failed', 'failed')])
    return graph


def repeat_assembly_issues(assembly, methods):
    if not methods:
        return []
    method = methods[0]
    expected = {'source': 'node', 'nodeId': method['readSegmentId'].removeprefix('s-'),
                'path': method['readPath']}
    selected = [field for field in (assembly or {}).get('fields', [])
                if field.get('path') == method['outputPath'] and field.get('binding') == expected]
    if len(selected) != 1:
        return [gap('missing_control_intent', [], 'repeat_method_representative_binding_required', 'collect_evidence')]
    return []
