"""Preserve observed playback as a checked effect of its owning browser action."""

from .causal import DELAYED_EFFECTS, clock_value, continuous_wait_boundary
from .evidence import gap
from .natural_readiness import NATURAL_SETTLE
from .postconditions import declared_checks


def bind_recorded_playback(trace, registry, segments):
    observations = {item.id: item for item in trace.observations}
    owners = {segment['id'][2:]: segment for segment in segments
              if segment.get('operation', {}).get('name') == 'browser.workflow-step'}
    issues = []
    for index, action in enumerate(trace.actions):
        if action.name == 'wait':
            previous = trace.actions[index - 1] if index else None
            issues.extend(bind_wait_playback(previous, action, observations, registry, owners))
            continue
        if action.effect in DELAYED_EFFECTS:
            issues.extend(bind_action_playback(action, observations, owners))
    return issues


def bind_action_playback(action, observations, owners):
    post = observations.get(action.postObservationRef)
    fact, ambiguous = recorded_playing(post)
    if ambiguous:
        return [playback_gap(action, 'media_playback_fact_ambiguous')]
    if fact is None:
        return []
    transition = playback_transition(observations.get(action.preObservationRef), post)
    if transition == 'unproven':
        return [playback_gap(action, 'media_playback_transition_unproven')]
    return [] if transition == 'already_playing' else attach_playback(action, fact, owners, [])


def bind_wait_playback(previous, wait, observations, registry, owners):
    before, after = observations.get(wait.preObservationRef), observations.get(wait.postObservationRef)
    issues = []
    for observation in (before, after):
        fact, ambiguous = recorded_playing(observation)
        if ambiguous:
            issues.append(playback_gap(wait, 'media_playback_fact_ambiguous'))
            continue
        if fact is None or (owners.get(wait.id) is not None and checks_playback(owners[wait.id])):
            continue
        if not bounded_wait_from_action(registry, previous, wait, observations):
            issues.append(playback_gap(wait, 'media_playback_owner_unproven'))
            continue
        previous_post = observations[previous.postObservationRef]
        previous_media = [item for item in previous_post.facts if item.kind == 'media_playback'][0]
        if previous_media.value == 'playing':
            transition = playback_transition(observations.get(previous.preObservationRef), previous_post)
            if transition == 'already_playing':
                continue
            if transition == 'unproven':
                issues.append(playback_gap(wait, 'media_playback_transition_unproven'))
                continue
        refs = [wait.resultRef, *before.sourceRefs, *after.sourceRefs]
        issues.extend(attach_playback(previous, fact, owners, refs))
    return issues


def recorded_playing(observation):
    if observation is None:
        return None, False
    facts = [fact for fact in observation.facts if fact.kind == 'media_playback']
    playing = [fact for fact in facts if fact.value == 'playing']
    return (playing[0] if len(facts) == 1 and playing else None,
            bool(playing) and len(facts) != 1)


def playback_transition(before, after):
    if before is None or after is None:
        return 'unproven'
    if before.tabId != after.tabId or before.url != after.url:
        return 'new_target'
    media = [fact for fact in before.facts if fact.kind == 'media_playback']
    if len(media) != 1:
        return 'unproven'
    return ('already_playing' if media[0].value == 'playing'
            else 'started' if media[0].value == 'not_playing' else 'unproven')


def bounded_wait_from_action(registry, previous, wait, observations):
    if (previous is None or previous.effect not in DELAYED_EFFECTS
            or previous.status != 'succeeded' or previous.resultRef is None
            or wait.status != 'succeeded' or wait.effect != 'none' or wait.resultRef is None):
        return False
    try:
        registry.validate_action(wait.name, wait.args)
    except Exception:
        return False
    post = observations.get(previous.postObservationRef)
    before = observations.get(wait.preObservationRef)
    after = observations.get(wait.postObservationRef)
    # WHY：只能归因给同一目标页上紧邻的成功动作；旧页曾在播放不能证明新页已开始播放。
    media = [fact for fact in post.facts if fact.kind == 'media_playback'] if post else []
    start = clock_value(post)
    return (len(media) == 1 and media[0].value in ('playing', 'not_playing')
            and start is not None and continuous_wait_boundary(
                post, before, after, start, NATURAL_SETTLE['maxMs'], False))


def checks_playback(segment):
    return any(item.get('kind') == 'media_playback' and item.get('equals') == 'playing'
               for item in segment['postconditions'])


def attach_playback(action, fact, owners, supporting_refs):
    owner = owners.get(action.id)
    if owner is None or action.status != 'succeeded' or action.resultRef is None:
        return [playback_gap(action, 'media_playback_postcondition_missing')]
    if not checks_playback(owner):
        condition = {'kind': 'media_playback', 'equals': 'playing', 'clauseRef': fact.id,
                     'settle': NATURAL_SETTLE}
        try:
            declared_checks([*owner['postconditions'], condition], action.args, owner.get('target'),
                            allow_unresolved_target=True)
        except ValueError:
            return [playback_gap(action, 'media_playback_postcondition_not_admitted')]
        owner['postconditions'].append(condition)
    for ref in [*fact.sourceRefs, *supporting_refs]:
        if ref is not None:
            value = ref.model_dump(mode='json')
            if value not in owner['proofRefs']:
                owner['proofRefs'].append(value)
    return []


def playback_gap(action, reason):
    return gap('missing_effect_proof', [action.id], reason, 'collect_evidence')
