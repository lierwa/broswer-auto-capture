"""Source evidence grouping only. There is no runtime wait, retry, or action loop here."""

from .completion import allows_url_change, completion_conditions, fact_values
from .evidence import ActionCoverage
from .postconditions import settle_policy

DELAYED_EFFECTS = frozenset({'external_write', 'ui_state', 'navigation'})


def delayed_post(request, registry, action, prove):
    """A bounded pure-wait suffix may prove a declared eventual effect, without changing the trace."""
    if action.status != 'succeeded' or action.effect not in DELAYED_EFFECTS:
        return None, []
    selection_ids = [item.id for item in request.control.selections if action.id in item.actionRefs]
    conditions = list(completion_conditions(request.requirement.clauses, action.id, selection_ids))
    return delayed_post_for_conditions(request.trace, registry, action, conditions, prove)


def delayed_post_for_conditions(trace, registry, action, conditions, prove):
    """Classify a continuous pure-wait suffix against explicit current-run fact conditions."""
    if action.status != 'succeeded' or action.effect not in DELAYED_EFFECTS:
        return None, []
    try:
        policy = settle_policy(conditions)
    except ValueError:
        return None, []
    if policy is None:
        return None, []
    observations = {item.id: item for item in trace.observations}
    previous = observations.get(action.postObservationRef)
    start = clock_value(previous)
    if previous is None or start is None:
        return None, []
    try:
        following = trace.actions[trace.actions.index(action) + 1:]
    except ValueError:
        return None, []
    may_change_url = allows_url_change(conditions)
    waits = []
    for item in following:
        if item.name != 'wait' or item.status != 'succeeded' or item.effect != 'none' or item.resultRef is None:
            break
        try:
            registry.validate_action(item.name, item.args)
        except Exception:
            break
        before, after = observations.get(item.preObservationRef), observations.get(item.postObservationRef)
        if not continuous_wait_boundary(previous, before, after, start, policy.maxMs, may_change_url):
            break
        waits.append(item)
        if len(prove(before)) == len(conditions):
            if conditions_stable(conditions, before, after):
                return before, waits
            break
        if len(prove(after)) == len(conditions):
            return after, waits
        if len(waits) >= policy.maxAttempts:
            break
        previous = after
    return None, []


def continuous_wait_boundary(previous, before, after, start, maximum_ms, may_change_url):
    if previous is None or before is None or after is None:
        return False
    same_boundary = before.id == previous.id and before.sequence == previous.sequence
    adjacent_boundary = before.id != previous.id and before.sequence == previous.sequence + 1
    if not (same_boundary or adjacent_boundary) or after.sequence != before.sequence + 1:
        return False
    stamps = [clock_value(value) for value in (previous, before, after)]
    if any(stamp is None for stamp in stamps) or stamps != sorted(stamps) or stamps[-1] - start > maximum_ms:
        return False
    if any(value.tabId != previous.tabId for value in (before, after)):
        return False
    return may_change_url or (all(value.url == previous.url for value in (before, after))
                              and same_url_digest(previous, before, after))


def conditions_stable(conditions, before, after):
    return all(fact_values(condition, before) == fact_values(condition, after)
               and len(fact_values(condition, before)) == 1 for condition in conditions)


def clock_value(observation):
    values = [fact.value for fact in observation.facts if fact.kind == 'monotonic_ms'] if observation else []
    return values[0] if len(values) == 1 and type(values[0]) is int and values[0] >= 0 else None


def supporting_wait(request, registry, action, owner):
    if action.name != 'wait' or owner is None or owner['kind'] != 'deterministic':
        return None
    if action.status != 'succeeded' or action.effect != 'none' or action.resultRef is None:
        return None
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None
    observations = {item.id: item for item in request.trace.observations}
    before, after = observations.get(action.preObservationRef), observations.get(action.postObservationRef)
    if before is None or after is None or before.documentDigest is None:
        return None
    if before.url != after.url or before.tabId != after.tabId or before.documentDigest != after.documentDigest:
        return None
    # WHY：等待前就必须满足被拥有区段的全部后置条件；等待后新出现的效果不能冒充原动作已成功。
    owner_action = next((item for item in request.trace.actions if owner['id'] == 's-' + item.id), None)
    owner_post = observations.get(owner_action.postObservationRef) if owner_action else None
    if (owner_post is None or owner_post.documentDigest != before.documentDigest
            or owner_post.url != before.url or owner_post.tabId != before.tabId):
        return None
    if not allows_url_change(owner['postconditions']) and not same_url_digest(owner_post, before, after):
        return None
    args = owner_action.args
    if not isinstance(args, dict) or owner['operation']['name'] != 'browser.workflow-step':
        return None
    for condition in owner['postconditions']:
        expected = args.get(condition['bindingArgument']) if 'bindingArgument' in condition else condition.get('equals')
        kind = condition['kind']
        if condition.get('changed') is True:
            original = observations.get(owner_action.preObservationRef)
            baseline = fact_values(condition, original) if original else []
            values = [fact_values(condition, observation) for observation in (before, after)]
            if len(baseline) != 1 or any(len(value) != 1 or value == baseline for value in values) or values[0] != values[1]:
                return None
            continue
        for observation in (before, after):
            values = [observation.url] if kind == 'url' else fact_values(condition, observation)
            if values != [expected]:
                return None
    owner['proofRefs'].extend(reference.model_dump() for reference in [action.resultRef, *before.sourceRefs, *after.sourceRefs])
    return ActionCoverage(actionRef=action.id, disposition='supporting', ownerSegmentId=owner['id'],
                          exclusionRule='unchanged_wait_after_proven_effect/v1', evidenceRefs=[action.resultRef])


def same_url_digest(*observations):
    values = []
    for observation in observations:
        matches = [fact.value for fact in observation.facts if fact.kind == 'url_digest']
        if len(matches) != 1 or not isinstance(matches[0], str):
            return False
        values.append(matches[0])
    return len(set(values)) == 1
