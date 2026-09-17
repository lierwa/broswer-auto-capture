"""Only source-backed values may enter executable parameters; history equality alone is not authority."""
from typing import Literal

from pydantic import JsonValue

from .evidence import Contract, EvidenceRef, digest, gap


class BindingDecision(Contract):
    id: str
    actionRef: str
    argumentPath: str
    kind: Literal['runtime_input', 'prior_output', 'authorized_constant', 'sample_evidence']
    sourceRef: str
    transform: str | None = None
    proofRefs: list[EvidenceRef]


class ValueAuthority(Contract):
    """Structured Requirement expression. No action list, control edges, selector inference, or scripts."""
    actionName: str
    argumentPath: str
    binding: dict[str, JsonValue]
    actionRefs: list[str] | None = None
    selectionRef: str | None = None


def decide_bindings(action, requirement, runtime_schema, prior_actions, selection_ids=(), prior_values=None):
    decisions, issues = [], []
    args = action.args if isinstance(action.args, dict) else {}
    for key in sorted(args):
        candidates = []
        for clause in requirement.clauses:
            if (not isinstance(clause.expression, dict) or not {'actionName', 'argumentPath', 'binding'} <= set(clause.expression)
                    or set(clause.expression) - {'actionName', 'argumentPath', 'binding', 'actionRefs', 'selectionRef'}):
                continue
            authority = ValueAuthority.model_validate(clause.expression)
            if (authority.actionName == action.name and authority.argumentPath == key
                    and (authority.actionRefs is None or action.id in authority.actionRefs)
                    and (authority.selectionRef is None or authority.selectionRef in selection_ids)):
                candidates.append((clause, authority.binding))
        if len(candidates) != 1:
            code = 'ambiguous_clause_alignment' if candidates else 'missing_binding'
            issues.append(gap(code, [action.id], 'argument_requires_one_authority:' + key, 'confirm_intent'))
            decisions.append(BindingDecision(id=f'b-{action.id}-{key}', actionRef=action.id, argumentPath=key,
                             kind='sample_evidence', sourceRef=f'{action.id}/args/{key}', proofRefs=[]))
            continue
        clause, binding = candidates[0]
        kind = classify_binding(binding, runtime_schema, prior_actions)
        if kind is None:
            issues.append(gap('missing_binding', [action.id], 'invalid_binding_source:' + key, 'confirm_intent', [clause.id]))
            continue
        if kind == 'prior_output' and not prior_value_matches(binding, args[key], prior_values or {}):
            issues.append(gap('missing_binding', [action.id], 'prior_output_value_not_proven:' + key, 'collect_evidence', [clause.id]))
        if binding['source'] == 'constant' and digest(binding['value']) != digest(args[key]):
            issues.append(gap('sample_value_leak', [action.id], 'constant_not_equal_to_authorized_value', 'reject_trace', [clause.id]))
        # 原始 index 没有跨输入身份，只能由已确认 SelectionIntent 消耗。
        if key in ('index', 'element_index', 'xpath'):
            issues.append(gap('sample_value_leak', [action.id], 'ephemeral_target_argument', 'confirm_intent', [clause.id]))
        decisions.append(BindingDecision(id=f'b-{action.id}-{key}', actionRef=action.id, argumentPath=key,
                         kind=kind, sourceRef=clause.id, proofRefs=[EvidenceRef(
                             ref=f'requirement:{requirement.id}/{clause.id}', digest=digest(clause))]))
    return decisions, issues


def prior_value_matches(binding, expected, values):
    if binding['nodeId'] not in values:
        return False
    value = values[binding['nodeId']]
    for key in binding['path']:
        if not isinstance(value, dict) or key not in value:
            return False
        value = value[key]
    return digest(value) == digest(expected)


def classify_binding(binding, runtime_schema, prior_actions):
    if binding.get('source') == 'constant' and set(binding) == {'source', 'value'}:
        return 'authorized_constant'
    if binding.get('source') == 'input' and set(binding) == {'source', 'path'}:
        path, schema = binding['path'], runtime_schema
        if not isinstance(path, list):
            return None
        for item in path:
            if not isinstance(item, str) or item in ('__proto__', 'constructor', 'prototype'):
                return None
            schema = schema.get('properties', {}).get(item, {})
        return 'runtime_input' if schema else None
    if binding.get('source') == 'node' and set(binding) == {'source', 'nodeId', 'path'}:
        schema = prior_actions.get(binding['nodeId'])
        path = binding['path']
        if not schema or not isinstance(path, list):
            return None
        for item in path:
            if not isinstance(item, str) or item in ('__proto__', 'constructor', 'prototype'):
                return None
            schema = schema.get('properties', {}).get(item, {})
        return 'prior_output' if schema else None
    return None
