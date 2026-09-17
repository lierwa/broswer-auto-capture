"""Every structured requirement clause must have a proven compiler consumer."""
from .evidence import gap
from .output import output_assembly


def segment_clause_refs(segment):
    consumed = set(segment.get('requirementClauseRefs', []))
    if segment['kind'] == 'deterministic':
        consumed.update(binding['sourceRef'] for binding in segment['bindings'])
        consumed.update(output['sourceRef'] for output in segment['outputs'])
        consumed.update(item['clauseRef'] for item in segment['postconditions'] if 'clauseRef' in item)
    return consumed


def validate_alignment(request, segments, graph):
    consumed, output_issues = output_assembly(request, segments)
    compiled_actions = {segment['id'].removeprefix('s-') for segment in segments}
    for segment in segments:
        consumed.update(segment_clause_refs(segment))
    for intent in request.control.selections:
        if not compiled_actions.intersection(intent.actionRefs):
            invoked = any(segment['kind'] == 'deterministic' and segment['operation']['name'] == 'task-chain.invoke'
                          and set(intent.clauseRefs).intersection(segment.get('requirementClauseRefs', [])) for segment in segments)
            if not invoked:
                output_issues.append(gap('missing_control_intent', intent.actionRefs, 'selection_not_observed', 'collect_evidence', intent.clauseRefs))
            continue
        expected = {'strategy': intent.strategy, 'target': intent.target}
        consumed.update(clause.id for clause in request.requirement.clauses
                        if clause.id in intent.clauseRefs and clause.kind == 'selection' and clause.expression == expected)
    nodes = {graph['entry'], *(edge['from'] for edge in graph['edges'])}
    for key, intents in [('loop', request.control.loops), ('branch', request.control.branches)]:
        for intent in intents:
            if key + '-' + intent.id not in nodes:
                continue
            expected = {key: intent.model_dump(exclude={'id', 'clauseRefs'})}
            consumed.update(clause.id for clause in request.requirement.clauses
                            if clause.id in intent.clauseRefs and clause.expression == expected)
            if key == 'loop':
                consumed.add(intent.bodyRef)
    return output_issues + [gap('missing_control_intent', [], 'unconsumed_requirement_clause', 'confirm_intent', [clause.id])
            for clause in request.requirement.clauses if clause.id not in consumed]
