"""Typed preparation dependencies, never executable instructions or retry requests."""
from typing import Literal

from pydantic import Field

from .causal import DELAYED_EFFECTS
from .evidence import Contract, EvidenceRef, gap
from .natural_repeat_evidence import verified_read, _query_scope
from .natural_reads import validate_compiled_query_read


class PrefixDependency(Contract):
    actionRef: str = Field(pattern=r'^a-\d{4,}$')
    kind: Literal['consumer_readiness', 'repeat_method']
    evidenceRefs: list[EvidenceRef] = Field(min_length=1)


def defer_consumer_readiness(action, pre, post, dependencies):
    if (action.effect not in DELAYED_EFFECTS or action.name in ('navigate', 'scroll', 'send_keys')
            or action.status != 'succeeded' or action.resultRef is None):
        return False
    # WHY：只有已采到前后现场、但仍缺消费者证明的动作可等待；目标/绑定错误不在这里吞掉。
    dependencies.append(PrefixDependency(actionRef=action.id, kind='consumer_readiness',
        evidenceRefs=[action.resultRef, *pre.sourceRefs, *post.sourceRefs]))
    return True


def defer_repeat_navigation(request, action, key, expected, segments, dependencies):
    if (action.name != 'navigate' or key != 'url' or not isinstance(expected, str)
            or not expected.startswith(('http://', 'https://'))):
        return False
    before = next((item for item in request.trace.observations if item.id == action.preObservationRef), None)
    prior = request.trace.actions[:request.trace.actions.index(action)]
    for candidate in reversed(prior):
        if candidate.effect in DELAYED_EFFECTS:
            return False
        if candidate.name != 'find_elements' or candidate.status != 'succeeded':
            continue
        try:
            read_action, read, pre, post = verified_read(request.trace, candidate.id)
            validate_compiled_query_read(read, read_action, pre, post)
            _query_scope(read_action, read, pre, post)
        except (ValueError, TypeError, KeyError, StopIteration):
            return False
        segment = next((item for item in segments if item['id'] == 's-' + candidate.id), None)
        if (segment is None or before is None or before.url != post.url or before.tabId != post.tabId
                or not read.output or any(item.get('attribute_href') != expected for item in read.output)):
            return False
        # WHY：同一完整查询的等价 href 只允许等待现有 repeat 方法；这里绝不生成固定 URL 绑定。
        dependencies.append(PrefixDependency(actionRef=action.id, kind='repeat_method',
            evidenceRefs=[candidate.resultRef, action.resultRef, *post.sourceRefs]))
        return True
    return False


def expired_dependencies(trace, dependencies, ledger):
    safe = {row.actionRef for row in ledger if row.exclusionRule == 'native_action_not_dispatched/v1'}
    positions = {action.id: index for index, action in enumerate(trace.actions)}
    issues = []
    for dependency in dependencies:
        if dependency.kind != 'consumer_readiness':
            continue
        following = trace.actions[positions[dependency.actionRef] + 1:]
        if any(action.name == 'done' or action.effect in DELAYED_EFFECTS and action.id not in safe
               for action in following):
            issues.append(gap('missing_effect_proof', [dependency.actionRef],
                'prefix_consumer_boundary_crossed', 'collect_evidence'))
    return issues
