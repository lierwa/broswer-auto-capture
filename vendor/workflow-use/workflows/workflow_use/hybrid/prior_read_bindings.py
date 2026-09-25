"""Link later action arguments to uniquely matching earlier verified read outputs."""

from .action_identity import history_action_refs
from .evidence import digest
from .natural_facts import IGNORED_TECHNICAL_PARAMETERS, NaturalBindingFact
from .natural_reads import VerifiedNaturalRead

MAX_BINDING_VALUES = 5000
UNSAFE_KEYS = frozenset({'__proto__', 'constructor', 'prototype'})


def attach_prior_read_bindings(collector, history):
    references = history_action_refs(history)
    prior_facts = []
    for step, item in enumerate(history.history):
        actions = item.model_output.action if item.model_output else []
        for index, model_action in enumerate(actions):
            action_ref = references[(step, index)]
            raw = model_action.model_dump(exclude_unset=True)
            if len(raw) != 1:
                continue
            action_name, arguments = next(iter(raw.items()))
            pre = _observation(collector, collector.links.get((step, index, 'pre')))
            if pre is not None and isinstance(arguments, dict):
                _attach_action_bindings(
                    collector, pre, action_ref, action_name, arguments, prior_facts)
            post = _observation(collector, collector.links.get((step, index, 'post')))
            if post is not None:
                prior_facts.extend(fact for fact in post.facts if fact.kind == 'verified_natural_read')


def binding_from_prior_reads(action_ref, argument_path, expected, prior_facts):
    visited = 0
    for fact in reversed(prior_facts):
        try:
            read = VerifiedNaturalRead.model_validate(fact.value)
        except Exception:
            continue
        if read.stable is not True:
            continue
        matches = {}
        for path, value in _values(read.output):
            visited += 1
            if visited > MAX_BINDING_VALUES:
                return None
            if digest(value) != digest(expected):
                continue
            matches[tuple(path)] = path
        if matches:
            # WHY：先前宽查询可重复包含同一地址；最近的精确重读若唯一，
            # 就以该读取为可复跑来源。同一次读取里的重复值仍没有确定字段身份。
            if len(matches) != 1:
                return None
            path = next(iter(matches.values()))
            return NaturalBindingFact(
                actionRef=action_ref, argumentPath=argument_path,
                binding={'source': 'node', 'nodeId': read.actionRef, 'path': path},
                provenance='node_output', sourceReadRef=fact.id)
    return None


def _attach_action_bindings(collector, observation, action_ref, action_name, arguments, prior_facts):
    existing = {fact.value.get('argumentPath') for fact in observation.facts
                if fact.kind == 'natural_binding' and isinstance(fact.value, dict)
                and fact.value.get('actionRef') == action_ref}
    for argument_path, expected in sorted(arguments.items()):
        if argument_path in existing or argument_path in ('index', 'element_index', 'xpath'):
            continue
        if argument_path in IGNORED_TECHNICAL_PARAMETERS.get(action_name, frozenset()):
            continue
        binding = binding_from_prior_reads(action_ref, argument_path, expected, prior_facts)
        if binding is not None:
            observation.facts.append(collector.value_fact(
                'natural_binding', binding.model_dump(mode='json')))


def _values(value, path=None):
    path = [] if path is None else path
    yield path, value
    if len(path) >= 40:
        return
    if isinstance(value, dict):
        for key in sorted(value):
            if isinstance(key, str) and key not in UNSAFE_KEYS:
                yield from _values(value[key], [*path, key])
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _values(item, [*path, index])


def _observation(collector, identity):
    return next((item for item in collector.observations if item.id == identity), None)
