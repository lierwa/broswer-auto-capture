"""Source-backed completion facts shared by capture and compilation, never inferred from a page."""
from .evidence import digest
from .postconditions import Postcondition
from jsonschema.exceptions import SchemaError, ValidationError


URL_FACT_KINDS = frozenset({'url', 'url_digest'})


def completion_conditions(clauses, action_id, selection_ids):
    for clause in clauses:
        expression = clause.expression
        if clause.kind != 'completion' or not isinstance(expression, dict):
            continue
        reference = 'selectionRef' if 'selectionRef' in expression else 'actionRef'
        authority = 'changed' if 'changed' in expression else 'bindingArgument' if 'bindingArgument' in expression else 'equals'
        keys = {reference, 'factKind', authority}
        if expression.get('factKind') == 'read_fields':
            keys.add('read')
        if 'settle' in expression:
            keys.add('settle')
        if set(expression) != keys:
            continue
        if (expression[reference] not in selection_ids if reference == 'selectionRef' else expression[reference] != action_id):
            continue
        try:
            condition = Postcondition.model_validate({'kind': expression['factKind'], authority: expression[authority],
                        'clauseRef': clause.id, **{key: expression[key] for key in ('read', 'settle') if key in expression}})
        except (ValueError, SchemaError, ValidationError):
            continue  # The unconsumed requirement remains a compiler gap.
        yield condition.model_dump(exclude_none=True)


def fact_values(condition, observation):
    if condition['kind'] != 'read_fields':
        return [fact.value for fact in observation.facts if fact.kind == condition['kind']]
    fingerprint = digest(condition['read'])
    return [fact.value['output'] for fact in observation.facts if fact.kind == 'read_fields'
            and isinstance(fact.value, dict) and fact.value.get('specificationDigest') == fingerprint
            and set(fact.value) == {'specificationDigest', 'output'}]


def allows_url_change(conditions):
    return any(condition.get('kind') in URL_FACT_KINDS for condition in conditions)
