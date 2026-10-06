"""Keep an observed business selection count bound to its existing runtime input."""
from .evidence import digest
from .natural_facts import NaturalBindingFact


def bind_read_take(request, action, pre, specification, output_schema, output_path):
    from .natural_reads import runtime_read_specification, schema_at_path
    result = runtime_read_specification(specification)
    source_action, source_pre = _source_method(request, action, pre)
    action, pre = source_action, source_pre
    facts = [fact for fact in pre.facts if fact.kind == 'natural_binding' and isinstance(fact.value, dict)
             and fact.value.get('actionRef') == action.id and fact.value.get('argumentPath') == 'take']
    if not facts:
        return result, []
    if len(facts) != 1:
        raise ValueError('read_take_binding_ambiguous')
    fact = facts[0]
    value = NaturalBindingFact.model_validate(fact.value)
    if value.provenance != 'runtime_input':
        return result, []
    schema, binding = request.runtimeInputSchema, value.binding
    if binding.get('source') != 'input' or set(binding) != {'source', 'path'}:
        raise ValueError('read_take_binding_invalid')
    for part in binding['path']:
        if not isinstance(part, str) or part not in schema.get('required', []):
            raise ValueError('read_take_binding_invalid')
        schema = schema.get('properties', {}).get(part, {})
    maximum = schema.get('maximum')
    declared = schema_at_path(output_schema, output_path)
    if (schema.get('type') != 'integer' or schema.get('minimum', 0) < 1
            or type(maximum) is not int or not 1 <= maximum <= 300
            or declared.get('type') != 'array' or maximum > declared.get('maxItems', 300)
            or maximum > specification.maxItems
            or specification.outputSchema.get('type') != 'array'
            or type(action.args.get('take')) is not int or action.args['take'] != specification.take
            or not schema['minimum'] <= specification.take <= maximum
            or not fact.sourceRefs or any(ref.digest not in (digest(value.model_dump(mode='json')),
                digest(fact.value), digest({'kind': fact.kind, 'value': fact.value})) for ref in fact.sourceRefs)):
        raise ValueError('read_take_binding_invalid')
    # WHY：来源保留样本 take；正式节点只放宽到用户输入合同允许的上限，数量由同一 ValueBinding 决定。
    result['outputSchema'] = {**result['outputSchema'], 'maxItems': maximum}
    decision = {'id': f'b-{action.id}-take', 'actionRef': action.id, 'argumentPath': 'take',
        'kind': 'runtime_input', 'sourceRef': fact.id, 'transform': None,
        'proofRefs': [ref.model_dump(mode='json') for ref in fact.sourceRefs], 'binding': binding}
    return result, [decision]


def _source_method(request, action, pre):
    from .method_read_reference import earlier_method
    reference = action.args.get('readRef')
    while reference is not None:
        action, _ = earlier_method(reference, action, request.trace)
        pre = next(item for item in request.trace.observations if item.id == action.preObservationRef)
        reference = action.args.get('readRef')
    return action, pre
