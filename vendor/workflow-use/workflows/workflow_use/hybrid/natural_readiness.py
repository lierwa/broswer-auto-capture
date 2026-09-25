"""Consumer-owned completion conditions for delayed browser actions."""

from .causal import DELAYED_EFFECTS
from .evidence import EvidenceRef, digest, gap
from .natural_reads import VerifiedNaturalRead, runtime_read_specification

NATURAL_SETTLE = {'maxMs': 30000, 'maxAttempts': 100, 'intervalMs': 300}


def consumer_readiness_by_action(trace, settle=NATURAL_SETTLE, *, allowed_consumer_ids=None,
                                 proven_not_dispatched_ids=frozenset()):
    """Bind a producer to the next proven structured consumer, not to a page scenario."""
    observations, output = {item.id: item for item in trace.observations}, {}
    for index, producer in enumerate(trace.actions):
        if producer.status != 'succeeded' or producer.effect not in DELAYED_EFFECTS:
            continue
        for consumer in trace.actions[index + 1:]:
            # WHY：失败但已派发的动作仍可能改变页面；只有审计证明未派发，才能跨过它继续找消费者。
            if (consumer.name == 'done' or consumer.effect in DELAYED_EFFECTS
                    and consumer.id not in proven_not_dispatched_ids):
                break
            if allowed_consumer_ids is not None and consumer.id not in allowed_consumer_ids:
                continue
            readiness = _verified_consumer_readiness(producer, consumer, observations, settle)
            if readiness is not None:
                output[producer.id] = readiness
                break
    return output


def _verified_consumer_readiness(producer, consumer, observations, settle):
    if consumer.name not in ('extract', 'bat_read_fields', 'find_elements') or consumer.status != 'succeeded':
        return None
    pre, post = observations.get(consumer.preObservationRef), observations.get(consumer.postObservationRef)
    if pre is None or post is None or pre.tabId != post.tabId:
        return None
    facts = _natural_facts(post, 'verified_natural_read', consumer.id)
    try:
        values = [VerifiedNaturalRead.model_validate(fact.value) for fact in facts]
        shared = {(digest(value.specification), digest(value.output), value.resultDigest,
                   value.urlDigest, value.targetId, value.containerIdsDigest, value.stable)
                  for value in values}
        if not values or len(shared) != 1:
            return None
    except Exception:
        return None
    value = values[0]
    before_url, after_url = _fact_value(pre, 'url_digest'), _fact_value(post, 'url_digest')
    if (value.actionRef != consumer.id or value.stable is not True or value.targetId != pre.tabId
            or value.targetId != post.tabId or before_url is None or after_url is None
            or before_url.value != value.urlDigest or after_url.value != value.urlDigest):
        return None
    authority = 'ready' if producer.effect == 'navigation' else 'transition'
    condition = {'kind': 'read_fields', authority: True, 'consumerRef': 's-' + consumer.id,
                 'clauseRef': facts[0].id, 'read': runtime_read_specification(value.specification),
                 'scope': {'url': pre.url, 'urlDigest': value.urlDigest}, 'settle': settle}
    refs = _unique_refs([consumer.resultRef, *pre.sourceRefs, *post.sourceRefs,
                         *(reference for fact in facts for reference in fact.sourceRefs)])
    return {'condition': condition, 'proofRefs': refs}


def with_consumer_readiness(conditions, refs, consumer, settle=NATURAL_SETTLE):
    if consumer is None:
        return conditions, refs
    # WHY：一个动作只有一个等待预算；直接动作事实与消费者投影共享同一 settle policy。
    settled = [{**condition, 'settle': settle} for condition in conditions]
    return [*settled, consumer['condition']], _unique_refs([*refs, *consumer['proofRefs']])


def validate_consumer_readiness(segments):
    by_id = {segment['id']: segment for segment in segments}
    issues = []
    for segment in segments:
        if segment['kind'] != 'deterministic' or segment['operation']['name'] != 'browser.workflow-step':
            continue
        for condition in segment['postconditions']:
            consumer_ref = condition.get('consumerRef')
            if consumer_ref is None:
                continue
            consumer = by_id.get(consumer_ref)
            matches = (consumer is not None and consumer['kind'] == 'deterministic'
                       and consumer['operation']['name'] == 'browser.read-fields'
                       and consumer['operation']['specification'] == condition.get('read'))
            if not matches:
                issues.append(gap('missing_effect_proof', [segment['id'][2:]],
                                  'consumer_readiness_uncompiled', 'collect_evidence'))
    return issues


def _natural_facts(observation, kind, action_ref):
    return [fact for fact in observation.facts if fact.kind == kind and isinstance(fact.value, dict)
            and fact.value.get('actionRef') == action_ref]


def _fact_value(observation, kind):
    values = [fact for fact in observation.facts if fact.kind == kind]
    return values[0] if len(values) == 1 else None


def _unique_refs(refs):
    found = {}
    for ref in refs:
        if ref is not None:
            if isinstance(ref, dict):
                ref = EvidenceRef.model_validate(ref)
            found[(ref.ref, ref.digest)] = ref
    return list(found.values())
