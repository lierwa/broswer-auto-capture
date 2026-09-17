"""Bounded semantic values only. No browser, tools, selectors, or graph generation interface."""
from jsonschema import Draft202012Validator

from .evidence import gap
from .request import SemanticOperationAnnotation


def bounded_schema(schema, depth=0):
    if depth > 12 or not isinstance(schema, dict) or '$ref' in schema:
        return False
    kind = schema.get('type')
    if kind == 'object':
        properties = schema.get('properties', {})
        return (schema.get('additionalProperties') is False and len(properties) <= 100
                and set(schema.get('required', [])) <= properties.keys()
                and all(bounded_schema(value, depth + 1) for value in properties.values()))
    if kind == 'array':
        return type(schema.get('maxItems')) is int and 0 <= schema['maxItems'] <= 300 and bounded_schema(schema.get('items'), depth + 1)
    if kind == 'string':
        return (type(schema.get('maxLength')) is int and 0 <= schema['maxLength'] <= 32000
                or isinstance(schema.get('enum'), list) and 0 < len(schema['enum']) <= 300
                and all(isinstance(value, str) and len(value) <= 1000 for value in schema['enum']))
    return kind in ('null', 'boolean', 'number', 'integer')


def compile_semantic(request, action, prior_outputs):
    annotations = [a for a in request.acceptedAnnotations if isinstance(a, SemanticOperationAnnotation)
                   and action.resultRef in a.segmentEvidenceRefs]
    if len(annotations) != 1:
        return None, [gap('unbounded_semantic_operation', [action.id], 'one_source_backed_semantic_annotation_required', 'confirm_intent')]
    annotation = annotations[0]
    clauses = [clause for clause in request.requirement.clauses if clause.id in annotation.clauseRefs]
    authority = [clause for clause in clauses if isinstance(clause.expression, dict)
                 and clause.expression.get('purpose') == annotation.purpose]
    if len(authority) != 1:
        return None, [gap('ambiguous_clause_alignment', [action.id], 'semantic_purpose_not_authorized', 'confirm_intent')]
    operation = authority[0].expression
    if set(operation) != {'purpose', 'outputSchema', 'budget'} or operation['outputSchema'] != annotation.proposedOutputSchema:
        return None, [gap('unbounded_semantic_operation', [action.id], 'semantic_schema_not_authorized', 'confirm_intent')]
    budget = operation['budget']
    if (not isinstance(budget, dict) or set(budget) != {'maxCalls', 'maxInputBytes', 'timeoutMs'}
            or type(budget.get('maxCalls')) is not int or budget.get('maxCalls') != 1
            or type(budget.get('maxInputBytes')) is not int or not 0 < budget['maxInputBytes'] <= 128000
            or type(budget.get('timeoutMs')) is not int or not 0 < budget['timeoutMs'] <= 120000):
        return None, [gap('unbounded_semantic_operation', [action.id], 'invalid_semantic_budget', 'confirm_intent')]
    if len(annotation.inputFieldRefs) != 1 or annotation.inputFieldRefs[0] not in prior_outputs:
        return None, [gap('missing_binding', [action.id], 'semantic_input_requires_prior_read_output')]
    source = annotation.inputFieldRefs[0]
    schema = annotation.proposedOutputSchema
    input_schema = prior_outputs[source]
    if not bounded_schema(schema) or not bounded_schema(input_schema) or input_schema.get('type') == 'null':
        return None, [gap('unbounded_semantic_operation', [action.id], 'unbounded_input_or_output_schema', 'confirm_intent')]
    if schema_byte_bound(input_schema) > budget['maxInputBytes']:
        return None, [gap('unbounded_semantic_operation', [action.id], 'input_schema_exceeds_byte_budget', 'confirm_intent')]
    Draft202012Validator.check_schema(schema)
    if annotation.purpose == 'rank_candidates':
        if not annotation.candidateIds or schema != {'type': 'string', 'enum': annotation.candidateIds}:
            return None, [gap('unbounded_semantic_operation', [action.id], 'candidate_id_enum_required', 'confirm_intent')]
    return dict(id='s-' + action.id, kind='explicit_llm', purpose=annotation.purpose,
                requirementClauseRefs=[authority[0].id], inputSchema=input_schema,
                inputBindings=[{'source': 'node', 'nodeId': source, 'path': []}], outputSchema=schema,
                validation={'schema': schema, 'candidateIds': annotation.candidateIds}, budget=budget), []


def schema_byte_bound(schema):
    """Conservative JSON UTF-8 upper bound; existing runtime validates the source output schema."""
    kind = schema['type']
    if kind == 'object':
        return 2 + sum(6 * len(key) + 4 + schema_byte_bound(value) for key, value in schema['properties'].items())
    if kind == 'array':
        return 2 + schema['maxItems'] * (1 + schema_byte_bound(schema['items']))
    if kind == 'string':
        length = schema.get('maxLength', max((len(value) for value in schema.get('enum', [])), default=0))
        return 2 + 6 * length
    return 5 if kind in ('boolean', 'null') else 32
