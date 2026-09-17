"""Prove a source action range equivalent to a pinned, verified ordinary subchain. No execution here."""
from copy import deepcopy
from pydantic import Field, JsonValue
from jsonschema import Draft202012Validator, ValidationError
from .evidence import Contract, digest, gap


class VerifiedChild(Contract):
    chain: dict[str, JsonValue]
    inputSchema: dict[str, JsonValue]
    outputSchema: dict[str, JsonValue]
    budget: dict[str, int]
    operations: list[dict[str, JsonValue]] = Field(min_length=1, max_length=500)


def compile_invokes(request, segments, ledger, children):
    result, issues = deepcopy(segments), []
    for intent in request.control.invokes:
        matches = [item for item in children if item.chain['id'] == intent.chainId and item.chain['version'] == intent.chainVersion]
        if len(matches) != 1:
            issues.append(gap('missing_control_intent', [], 'verified_child_mapping_required:' + intent.id, 'collect_evidence', intent.clauseRefs))
            continue
        child = matches[0]
        source = [clause for clause in request.requirement.clauses if clause.id in intent.clauseRefs
                  and isinstance(clause.expression, dict) and set(clause.expression) == {'invoke', 'actionRefs'}
                  and clause.expression['invoke'] == intent.model_dump(exclude={'id', 'clauseRefs'})]
        if (len(source) != 1 or intent.mode != 'once' or intent.onItemFailure != 'stop' or len(intent.inputBindings) != 1
                or intent.outputBindings != [{'source': 'node', 'nodeId': intent.id, 'path': []}]):
            issues.append(gap('missing_control_intent', [], 'bounded_once_invoke_contract_required', 'confirm_intent', intent.clauseRefs))
            continue
        ids = ['s-' + action for action in source[0].expression['actionRefs']]
        by_id = {segment['id']: segment for segment in result}
        body = [by_id[identity] for identity in ids if identity in by_id]
        start = next((index for index, segment in enumerate(result) if segment['id'] == ids[0]), -1) if ids else -1
        if (not ids or len(body) != len(ids) or len(ids) != len(set(ids)) or start < 0
                or [segment['id'] for segment in result[start:start + len(ids)]] != ids):
            issues.append(gap('incomplete_action_coverage', [], 'invoke_body_not_contiguous', 'reject_trace', intent.clauseRefs))
            continue
        try:
            equivalent = prove_equivalence(request, intent, child, body, result)
        except (ValueError, KeyError, TypeError, StopIteration, ValidationError):
            equivalent = False
        if not equivalent or leaks_internal_output(request, result, body):
            issues.append(gap('missing_effect_proof', [], 'invoke_body_not_equivalent_to_verified_child', 'collect_evidence', intent.clauseRefs))
            continue
        consumed = {source[0].id}
        for segment in body:
            consumed.update(binding['sourceRef'] for binding in segment['bindings'])
            consumed.update(output['sourceRef'] for output in segment['outputs'])
            consumed.update(item['clauseRef'] for item in segment['postconditions'] if 'clauseRef' in item)
        for selection in request.control.selections:
            if set(selection.actionRefs).intersection(source[0].expression['actionRefs']):
                expected = {'strategy': selection.strategy, 'target': selection.target}
                consumed.update(clause.id for clause in request.requirement.clauses if clause.id in selection.clauseRefs
                                and clause.kind == 'selection' and clause.expression == expected)
        identifier = 'invoke-' + intent.id
        segment = dict(id=identifier, kind='deterministic', operation={'name': 'task-chain.invoke', 'version': 1,
                       'chain': child.chain, 'input': intent.inputBindings[0], 'budget': child.budget}, target=None, bindings=[],
                       preconditions=[], expectedEffect={'kind': 'external_write' if any(s['expectedEffect']['kind'] == 'external_write' for s in body) else 'read'},
                       postconditions=[{'kind': 'verified_child_output', 'schemaDigest': digest(child.outputSchema)}],
                       outputs=[{'schema': child.outputSchema, 'sourceRef': source[0].id}],
                       requirementClauseRefs=sorted(consumed), proofRefs=[ref for s in body for ref in s['proofRefs']])
        result[start:start + len(ids)] = [segment]
        for row in ledger:
            if row.ownerSegmentId in ids:
                row.ownerSegmentId = identifier
    return result, issues


def prove_equivalence(request, intent, child, body, segments):
    if len(body) != len(child.operations) or any(segment['kind'] != 'deterministic' for segment in body):
        return False
    clauses = {clause.id: clause for clause in request.requirement.clauses}
    source = intent.inputBindings[0]
    if source.get('source') == 'constant' and set(source) == {'source', 'value'}:
        Draft202012Validator(child.inputSchema).validate(source['value'])
    else:
        if source.get('source') == 'input' and set(source) == {'source', 'path'}:
            schema = request.runtimeInputSchema
        elif source.get('source') == 'node' and set(source) == {'source', 'nodeId', 'path'}:
            preceding = segments[:segments.index(body[0])]
            owner = next(item for item in preceding if item['id'] == 's-' + source['nodeId'])
            schema = owner['outputSchema'] if owner['kind'] == 'explicit_llm' else owner['outputs'][0]['schema']
        else:
            return False
        for key in source['path']:
            schema = schema['properties'][key]
        if schema != child.inputSchema:
            return False
    for index, (segment, operation) in enumerate(zip(body, child.operations, strict=True)):
        arguments = {binding['argumentPath']: clauses[binding['sourceRef']].expression['binding'] for binding in segment['bindings']}
        expected = {key: substitute(value, intent.inputBindings[0], child.operations, body) for key, value in operation['arguments'].items()}
        actual_conditions = [{key: value for key, value in item.items() if key != 'clauseRef'} for item in segment['postconditions']]
        expected_conditions = operation['postconditions']
        if segment['operation']['name'] == 'browser.read-fields':
            expected_conditions = [{'kind': 'output_schema', 'schemaDigest': digest(operation['outputSchema'])}]
        effect = segment['expectedEffect']['kind']
        effect = 'read' if effect in ('none', 'read') else 'external_write' if effect == 'external_write' else 'idempotent_write'
        if (segment['operation'] != operation['operation'] or segment['target'] != operation['target'] or arguments != expected
                or actual_conditions != expected_conditions or effect != operation['effect']):
            return False
    output = body[-1]['outputs'][0]['schema'] if body[-1]['outputs'] else {'type': 'null'}
    return output == child.outputSchema


def substitute(binding, source, operations, body):
    if binding['source'] == 'constant':
        return binding
    if binding['source'] == 'input':
        if source['source'] == 'constant':
            value = source['value']
            for key in binding['path']:
                value = value[key]
            return {'source': 'constant', 'value': value}
        return {**source, 'path': [*source['path'], *binding['path']]}
    if binding['source'] == 'node':
        position = next(index for index, operation in enumerate(operations) if operation['id'] == binding['nodeId'])
        return {**binding, 'nodeId': body[position]['id'].removeprefix('s-')}
    raise ValueError('unsupported_child_binding')


def leaks_internal_output(request, segments, body):
    internal = {segment['id'].removeprefix('s-') for segment in body[:-1]}
    for segment in segments:
        if segment in body:
            continue
        clauses = {clause.id: clause for clause in request.requirement.clauses}
        bindings = [*segment.get('inputBindings', []), *(clauses[item['sourceRef']].expression.get('binding', {})
                    for item in segment.get('bindings', []))]
        for binding in bindings:
            if binding.get('source') == 'node' and binding.get('nodeId') in internal:
                return True
    for clause in request.requirement.clauses:
        if isinstance(clause.expression, dict) and 'assemble' in clause.expression:
            if any(field['binding'].get('nodeId') in internal for field in clause.expression['assemble']['fields']):
                return True
    return False
