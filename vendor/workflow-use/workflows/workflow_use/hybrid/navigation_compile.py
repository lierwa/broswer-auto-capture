"""Proven click/key navigation effects without retaining sample URLs or tab identifiers."""
from .natural_readiness import NATURAL_SETTLE, with_consumer_readiness


def navigation_command_postconditions(action, pre, post, consumer=None):
    from .context_bindings import context_facts
    from .evidence import gap
    from .native_action_receipt import native_action_receipt
    from .navigation import navigation_destination_matches
    receipt = native_action_receipt(action, pre)
    if receipt is not None:
        # WHY：natural_bindings校验计划参数，ActionDispatchAudit核对实际Tools.act参数摘要。
        # 原生导航成功即可；落地URL是运行事实，不能自动追加“等于入口”或“必须变化”。
        conditions, refs = with_consumer_readiness([], receipt, consumer)
        return conditions, refs, []
    if any(fact.kind in ('native_action_dispatch', 'native_action_result') for fact in pre.facts):
        return [], [], [gap('missing_effect_proof', [action.id],
                            'navigate_native_receipt_invalid', 'collect_evidence')]
    # WHY：旧来源缺少原生派发回执时保持原证明边界；不能仅靠status推断已正确派发。
    matched = [fact for fact in post.facts if fact.kind == 'natural_postcondition'
               and fact.value == {'actionRef': action.id, 'kind': 'url',
                                  'bindingArgument': 'url', 'matched': True}]
    if not navigation_destination_matches(action.args.get('url'), post.url) or len(matched) != 1:
        return [], [], [gap('missing_effect_proof', [action.id],
                            'navigate_url_binding_not_observed', 'collect_evidence')]
    context = context_facts(post)
    clause = context[1] if context is not None else matched[0]
    refs = {(ref.ref, ref.digest): ref for ref in [*matched[0].sourceRefs, *clause.sourceRefs]}
    conditions, refs = with_consumer_readiness(
        [{'kind': 'url', 'bindingArgument': 'url', 'clauseRef': clause.id, 'settle': NATURAL_SETTLE}],
        list(refs.values()), consumer)
    return conditions, refs, []


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
