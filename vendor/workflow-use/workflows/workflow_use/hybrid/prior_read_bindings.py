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
    candidates, visited = {}, 0
    for fact in prior_facts:
        try:
            read = VerifiedNaturalRead.model_validate(fact.value)
        except Exception:
            continue
        for path, value in _values(read.output):
            visited += 1
            if visited > MAX_BINDING_VALUES:
                return None
            if digest(value) != digest(expected):
                continue
            key = (read.actionRef, tuple(path))
            candidates[key] = (fact.id, read.actionRef, path)
    if len(candidates) != 1:
        return None
    source_ref, node_id, path = next(iter(candidates.values()))
    return NaturalBindingFact(
        actionRef=action_ref, argumentPath=argument_path,
        binding={'source': 'node', 'nodeId': node_id, 'path': path},
        provenance='node_output', sourceReadRef=source_ref)


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
