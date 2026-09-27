"""Return captured lookup arguments as preparation hints, never continuation authority."""
from copy import deepcopy


def repeat_query_feedback(collector, history, read_ref):
    if not isinstance(read_ref, str):
        return []
    observations = collector.observations
    anchors = [index for index, observation in enumerate(observations) if any(
        fact.kind == 'verified_natural_read' and isinstance(fact.value, dict)
        and fact.value.get('readRef') == read_ref and fact.value.get('stable') is True
        for fact in observation.facts)]
    if len(anchors) != 1:
        return []
    pending = getattr(collector, 'pending', None)
    current = pending.get('pre') if isinstance(pending, dict) else None
    ends = [index for index, observation in enumerate(observations) if observation.id == current]
    end = ends[0] if len(ends) == 1 else len(observations)
    if anchors[0] >= end:
        return []
    candidates = []
    for observation in observations[anchors[0] + 1:end]:
        # WHY：引用只取该次读取之后的窗口；遇到下一条方法读取即停止，不能串入另一方法。
        if any(fact.kind == 'verified_natural_read' and isinstance(fact.value, dict)
               and fact.value.get('readRef') is not None for fact in observation.facts):
            break
        queries = [fact.value for fact in observation.facts if fact.kind == 'dom_query'
                   and isinstance(fact.value, dict) and fact.value.get('complete') is True]
        if len(queries) != 1:
            continue
        query = queries[0]
        verified = any(fact.kind == 'verified_natural_read' and isinstance(fact.value, dict)
                       and fact.value.get('actionRef') == query.get('actionRef')
                       and fact.value.get('stable') is True for fact in observation.facts)
        arguments = _native_query_args(collector, history, observation.id) if verified else None
        if arguments is None or query.get('query', {}).get('value') != arguments.get('selector'):
            continue
        candidates.append({'actionRef': query['actionRef'], 'arguments': arguments})
    # WHY：反馈有界且不猜哪次查询是继续条件；超限时不挑选、改写或认证任意候选。
    return candidates if len(candidates) <= 8 else []


def _native_query_args(collector, history, observation_id):
    positions = [(step, index) for (step, index, side), ref in collector.links.items()
                 if side == 'post' and ref == observation_id]
    if len(positions) != 1:
        return None
    step, index = positions[0]
    if step < 0 or step >= len(history.history):
        return None
    item = history.history[step]
    actions = item.model_output.action if item.model_output else []
    if index < 0 or index >= len(actions) or index >= len(item.result) or item.result[index].error:
        return None
    # RootModel 的公开序列化已返回原生 action 包装；不按内部字段名读取或改写参数。
    raw = actions[index].model_dump(exclude_unset=True)
    if not isinstance(raw, dict) or set(raw) != {'find_elements'} or not isinstance(raw['find_elements'], dict):
        return None
    return deepcopy(raw['find_elements'])
