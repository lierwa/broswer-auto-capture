"""Proven click/key navigation effects without retaining sample URLs or tab identifiers."""
from .natural_readiness import NATURAL_SETTLE, with_consumer_readiness


def navigation_postconditions(action, pre, post, consumer=None):
    def url_fact(observation):
        values = [fact for fact in observation.facts if fact.kind == 'url_digest']
        return values[0] if len(values) == 1 else None

    before, after = url_fact(pre), url_fact(post)
    if (before is None or after is None or before.value == after.value
            or not isinstance(before.value, str) or not isinstance(after.value, str)):
        return None
    # WHY：点击和按键都可能打开新页；复跑要求当前受控页实际导航，
    # 不固化本次 targetId，也不把导航后的消费者拿旧页作 transition 基线。
    condition = {'kind': 'url_digest', 'changed': True, 'clauseRef': after.id,
                 'settle': NATURAL_SETTLE}
    if consumer is not None:
        ready = {key: value for key, value in consumer['condition'].items() if key != 'transition'}
        consumer = {**consumer, 'condition': {**ready, 'ready': True}}
    references = {(ref.ref, ref.digest): ref for ref in [*before.sourceRefs, *after.sourceRefs]}
    conditions, refs = with_consumer_readiness(
        [condition], list(references.values()), consumer, NATURAL_SETTLE)
    return conditions, refs, []
