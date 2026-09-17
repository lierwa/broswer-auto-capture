"""Authorize output bindings. Actual JSON assembly is the existing B-A-T data capability."""
from .bindings import classify_binding
from .evidence import digest, gap
from .semantic import bounded_schema


def output_assembly(request, segments):
    clauses = [clause for clause in request.requirement.clauses if clause.kind == 'output'
               and isinstance(clause.expression, dict) and 'assemble' in clause.expression]
    if not clauses:
        return set(), []
    if len(clauses) != 1 or set(clauses[0].expression) != {'assemble'}:
        return set(), [gap('ambiguous_clause_alignment', [], 'one_output_assembly_required', 'confirm_intent')]
    clause = clauses[0]
    configuration = clause.expression['assemble']
    if (not isinstance(configuration, dict) or set(configuration) != {'fields', 'schema'}
            or not bounded_schema(configuration['schema']) or digest(configuration['schema']) != request.plan.outputSchemaDigest
            or not isinstance(configuration['fields'], list) or not 0 < len(configuration['fields']) <= 100):
        return set(), [gap('missing_binding', [], 'invalid_output_assembly', 'confirm_intent', [clause.id])]
    prior = {segment['id'].removeprefix('s-'): segment['outputSchema'] if segment['kind'] == 'explicit_llm'
             else segment['outputs'][0]['schema'] if segment['outputs'] else {'type': 'null'} for segment in segments}
    for segment in segments:
        if segment['kind'] == 'deterministic' and segment['operation']['name'] == 'task-chain.invoke':
            source = next(clause for clause in request.requirement.clauses if clause.id == segment['outputs'][0]['sourceRef'])
            prior[source.expression['actionRefs'][-1]] = segment['outputs'][0]['schema']
    paths = []
    for field in configuration['fields']:
        if (not isinstance(field, dict) or set(field) != {'binding', 'path'} or not isinstance(field['binding'], dict)
                or classify_binding(field['binding'], request.runtimeInputSchema, prior) is None
                or not valid_path(field['path']) or any(overlaps(field['path'], path) for path in paths)):
            return set(), [gap('missing_binding', [], 'output_assembly_source_or_path_invalid', 'confirm_intent', [clause.id])]
        paths.append(field['path'])
    return {clause.id}, []


def valid_path(path):
    return isinstance(path, list) and all((isinstance(part, str) and part not in ('__proto__', 'constructor', 'prototype'))
                                        or (type(part) is int and part >= 0) for part in path)


def overlaps(left, right):
    size = min(len(left), len(right))
    return left[:size] == right[:size]
