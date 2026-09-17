"""Compile verified natural summaries into the existing explicit LLM segment contract."""
from jsonschema import Draft202012Validator

from .evidence import digest, gap
from .natural_reads import VerifiedNaturalRead, paths_conflict, schema_at_path, value_at_path
from .summary_evidence import VerifiedNaturalSummary
from .summary_tool import SUMMARY_TIMEOUT_MS, SummaryToolParams


def compile_verified_summary(request, action, pre, post, output_schema, prior_segments, prior_paths=()):
    if post is None:
        return None, None, [gap('missing_observation', [action.id], 'summary_post_observation_required')]
    facts = [fact for fact in post.facts if fact.kind == 'verified_natural_summary'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if len(facts) != 1:
        return None, None, [gap('missing_effect_proof', [action.id],
                                'verified_natural_summary_required', 'collect_evidence')]
    fact = facts[0]
    try:
        _assert_value_fact(fact)
        value = VerifiedNaturalSummary.model_validate(fact.value)
        params = SummaryToolParams.model_validate(action.args)
        target_schema = schema_at_path(output_schema, params.outputPath)
        Draft202012Validator(target_schema).validate(value.summary)
        if (target_schema.get('type') != 'string' or params.outputPath != value.outputPath
                or target_schema != value.outputSchema or value.resultDigest != action.resultRef.digest
                or any(paths_conflict(params.outputPath, path) for path in prior_paths)):
            raise ValueError('summary_output_mismatch')
        expected_input = _validate_sources(request, action, pre, value, prior_segments)
        if value.inputSchema != expected_input:
            raise ValueError('summary_input_schema_mismatch')
        _validate_completed_facts(request, action, pre, value, prior_segments)
    except Exception:
        return None, None, [gap('invalid_source', [action.id],
                                'verified_natural_summary_invalid', 'reject_trace')]
    segment = {'id': 's-' + action.id, 'kind': 'explicit_llm', 'purpose': 'summarize',
        'sourceRef': fact.id, 'inputSchema': value.inputSchema,
        'inputBindings': [{'source': 'node', 'nodeId': 'summary-input-' + action.id, 'path': []}],
        'outputSchema': value.outputSchema,
        'validation': {'schema': value.outputSchema, 'candidateIds': None},
        'budget': {'maxCalls': 1, 'timeoutMs': SUMMARY_TIMEOUT_MS}}
    return segment, params.outputPath, []


def summary_capture_fields(observations, output_schema):
    output = []
    for _observation, fact, value in _summary_facts(observations):
        target = schema_at_path(output_schema, value.outputPath)
        if target != value.outputSchema:
            raise ValueError('summary_output_schema_mismatch')
        Draft202012Validator(target).validate(value.summary)
        output.append(({'binding': {'source': 'node', 'nodeId': value.actionRef, 'path': []},
                       'path': value.outputPath}, value.summary))
    return output


def compiled_summary_fields(trace, segments, output_schema):
    output = []
    for observation, fact, value in _summary_facts(trace.observations):
        action = next((item for item in trace.actions if item.id == value.actionRef), None)
        segment = next((item for item in segments if _item(item, 'id') == 's-' + value.actionRef), None)
        if (action is None or action.postObservationRef != observation.id or _item(segment, 'kind') != 'explicit_llm'
                or _item(segment, 'purpose') != 'summarize' or _item(segment, 'sourceRef') != fact.id
                or _item(segment, 'outputSchema') != value.outputSchema):
            raise ValueError('summary_output_segment_mismatch')
        target = schema_at_path(output_schema, value.outputPath)
        if target != value.outputSchema:
            raise ValueError('summary_output_schema_mismatch')
        Draft202012Validator(target).validate(value.summary)
        output.append(({'binding': {'source': 'node', 'nodeId': value.actionRef, 'path': []},
                       'path': value.outputPath}, value.summary))
    return output


def _validate_sources(request, action, pre, value, prior_segments):
    if pre is None:
        raise ValueError('summary_pre_observation_missing')
    properties = {'runtimeInput': request.runtimeInputSchema}
    seen = set()
    action_order = {item.id: index for index, item in enumerate(request.trace.actions)}
    current = action_order.get(action.id)
    if current is None:
        raise ValueError('summary_action_missing')
    for index, source in enumerate(value.sources):
        if source.name != f'source{index}' or source.sourceRef in seen:
            raise ValueError('summary_source_order_invalid')
        seen.add(source.sourceRef)
        matches = [(observation, fact) for observation in request.trace.observations for fact in observation.facts
                   if fact.id == source.sourceRef and fact.kind == 'verified_natural_read']
        if len(matches) != 1:
            raise ValueError('summary_source_fact_missing')
        observation, fact = matches[0]
        _assert_value_fact(fact)
        read = VerifiedNaturalRead.model_validate(fact.value)
        source_action = next((item for item in request.trace.actions if item.id == read.actionRef), None)
        source_segment = next((item for item in prior_segments if _item(item, 'id') == 's-' + read.actionRef), None)
        outputs = _item(source_segment, 'outputs')
        operation = _item(source_segment, 'operation')
        actual_schema = schema_at_path(read.specification.outputSchema, read.readPath)
        actual_value = value_at_path(read.output, read.readPath)
        if (source_action is None or _item(source_action, 'status') != 'succeeded'
                or _item(_item(source_action, 'resultRef'), 'digest') != read.resultDigest
                or action_order.get(read.actionRef, current) >= current
                or source_action.postObservationRef != observation.id
                or observation.sequence >= pre.sequence
                or _item(operation, 'name') != 'browser.read-fields'
                or not isinstance(outputs, list) or len(outputs) != 1
                or _item(outputs[0], 'sourceRef') != fact.id
                or _item(outputs[0], 'schema') != read.specification.outputSchema
                or source.binding != {'source': 'node', 'nodeId': read.actionRef, 'path': read.readPath}
                or source.valueSchema != actual_schema or source.outputPath != read.outputPath
                or digest(source.value) != digest(actual_value)
                or source.proofRefs != fact.sourceRefs):
            raise ValueError('summary_source_mismatch')
        Draft202012Validator(actual_schema).validate(actual_value)
        properties[source.name] = actual_schema
    return {'type': 'object', 'properties': properties, 'required': list(properties),
            'additionalProperties': False}


def _validate_completed_facts(request, action, pre, value, prior_segments):
    action_order = {item.id: index for index, item in enumerate(request.trace.actions)}
    current = action_order[action.id]
    expected_actions = {'verified_target_scroll': 'bat_scroll_to',
                        'verified_visible_wait': 'bat_wait_for'}
    for completed in value.completedFacts:
        matches = [(observation, fact) for observation in request.trace.observations for fact in observation.facts
                   if fact.id == completed.sourceRef and fact.kind == completed.kind]
        if len(matches) != 1:
            raise ValueError('summary_completed_fact_missing')
        observation, fact = matches[0]
        source_index = action_order.get(completed.actionRef)
        source_action = next((item for item in request.trace.actions if item.id == completed.actionRef), None)
        source_segment = next((item for item in prior_segments
                               if _item(item, 'id') == 's-' + completed.actionRef), None)
        operation = _item(source_segment, 'operation')
        result_digest = completed.value.get('resultDigest') if isinstance(completed.value, dict) else None
        if (source_index is None or source_index >= current or source_action is None
                or _item(source_action, 'status') != 'succeeded'
                or _item(_item(source_action, 'resultRef'), 'digest') != result_digest
                or _item(source_action, 'postObservationRef') != observation.id
                or _item(operation, 'name') != 'browser.workflow-step'
                or completed.actionName != expected_actions[completed.kind]
                or _item(operation, 'actionName') != completed.actionName
                or observation.sequence >= pre.sequence
                or fact.value != completed.value or fact.sourceRefs != completed.proofRefs
                or not fact.sourceRefs or any(reference.digest != digest(fact.value) for reference in fact.sourceRefs)):
            raise ValueError('summary_completed_fact_mismatch')


def _summary_facts(observations):
    output = []
    for observation in observations:
        for fact in observation.facts:
            if fact.kind != 'verified_natural_summary':
                continue
            _assert_value_fact(fact)
            output.append((observation, fact, VerifiedNaturalSummary.model_validate(fact.value)))
    return output


def _assert_value_fact(fact):
    if not fact.sourceRefs or any(reference.digest != digest(fact.value) for reference in fact.sourceRefs):
        raise ValueError('summary_fact_digest_mismatch')


def _item(value, name):
    return value.get(name) if isinstance(value, dict) else getattr(value, name, None)
