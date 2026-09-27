"""Resolve a captured method reference through earlier successful actions in the same trace."""
from .evidence import digest
from .field_read_params import FieldReadMapping
from .method_read_tool import MethodReadToolParams, expand_method_read_params
from .natural_reads import VerifiedNaturalRead, validate_compiled_read_identity


def referenced_method_mapping(reference, action, trace, output_schema):
    if trace is None:
        raise ValueError('verified_read_reference_owner_required')
    current, expected = action, None
    # WHY：沿原生参数引用向前验证，不把 readRef 改写成模型未提交的参数，也不信任孤立事实。
    while reference is not None:
        prior, value = earlier_method(reference, current, trace)
        mapping = FieldReadMapping(specification=value.specification,
                                   outputPath=value.outputPath, readPath=value.readPath)
        if expected is not None and digest(expected) != digest(mapping):
            raise ValueError('verified_read_mapping_mismatch')
        expected = mapping
        params = MethodReadToolParams.model_validate(prior.args)
        if params.readRef is None:
            if digest(expand_method_read_params(params, output_schema)) != digest(mapping):
                raise ValueError('verified_read_mapping_mismatch')
        current, reference = prior, params.readRef
    return expected


def earlier_method(reference, action, trace):
    from .method_read_evidence import _validate_sample_output
    facts = [(observation, fact.value) for observation in trace.observations for fact in observation.facts
             if fact.kind == 'verified_natural_read' and isinstance(fact.value, dict)
             and fact.value.get('readRef') == reference]
    if len(facts) != 1:
        raise ValueError('verified_read_reference_missing')
    post, raw = facts[0]
    value = VerifiedNaturalRead.model_validate(raw)
    positions = [index for index, item in enumerate(trace.actions) if item.id == action.id]
    earlier = [(index, item) for index, item in enumerate(trace.actions) if item.id == value.actionRef]
    if len(positions) != 1 or len(earlier) != 1 or earlier[0][0] >= positions[0]:
        raise ValueError('verified_read_reference_order_invalid')
    prior = earlier[0][1]
    pre = [observation for observation in trace.observations if observation.id == prior.preObservationRef]
    if (prior.name != 'bat_read_fields' or prior.status != 'succeeded'
            or prior.postObservationRef != post.id or len(pre) != 1):
        raise ValueError('verified_read_reference_action_invalid')
    validate_compiled_read_identity(value, prior, pre[0], post)
    _validate_sample_output(value.specification, value.output, value.coverage,
                            value.documentRootId, value.readPath)
    return prior, value
