"""Keep only replay reads whose values feed a real action or final result."""

from .action_dispatch import NOT_DISPATCHED_RULE, not_dispatched_coverage
from .coverage import unused_verified_dom_read_coverage
from .evidence import gap
from .natural_readiness import consumer_readiness_by_action


def consumed_query_ids(trace, segments):
    """Exclude ConsumerReadiness from liveness: a wait cannot make its own read necessary."""
    references = set()
    for segment in segments:
        for key in ('bindings', 'target', 'inputBindings'):
            references.update(_node_refs(segment.get(key)))
    for observation in trace.observations:
        for fact in observation.facts:
            if fact.kind == 'verified_output_assembly' and isinstance(fact.value, dict):
                references.update(_node_refs(fact.value.get('fields')))
    return {reference.removeprefix('s-') for reference in references}


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


def prune_unused_queries(request, registry, segments, ledger):
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
                or action is None or action.name != 'find_elements' or action_id in consumed):
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
    issues = []
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
        if current is None and previous:
            issues.append(gap('missing_effect_proof', [segment['id'].removeprefix('s-')],
                              'consumer_readiness_live_read_required', 'collect_evidence'))
        segment['postconditions'] = [*direct, *([current['condition']] if current else [])]
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
