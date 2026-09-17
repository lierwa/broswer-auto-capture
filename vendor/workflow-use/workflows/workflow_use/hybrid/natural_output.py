"""Verified natural reads may assemble dynamic output; final values never become executable constants."""
from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue, model_validator

from .evidence import Contract, EvidenceRef, ObservationFact, digest, gap
from .natural_reads import VerifiedNaturalRead, schema_at_path, value_at_path
from .summary_compile import compiled_summary_fields, summary_capture_fields


class NaturalOutputField(Contract):
    binding: dict[str, JsonValue]
    path: list[str | int]

    @model_validator(mode='after')
    def dynamic_node_binding(self):
        if set(self.binding) != {'source', 'nodeId', 'path'} or self.binding.get('source') != 'node':
            raise ValueError('natural_output_dynamic_binding_required')
        if not isinstance(self.binding.get('nodeId'), str) or not self.binding['nodeId']:
            raise ValueError('natural_output_node_required')
        _validate_path(self.binding.get('path'))
        _validate_path(self.path)
        return self


class VerifiedOutputAssembly(Contract):
    fields: list[NaturalOutputField] = Field(min_length=1, max_length=100)
    schemaValue: dict[str, JsonValue] = Field(alias='schema')
    outputDigest: str = Field(pattern=r'^[a-f0-9]{64}$')


def build_verified_output_assembly(observations, final_output, output_schema, put_evidence):
    """Build one fact only when verified reads cover every final-output leaf exactly once."""
    facts = _facts(observations, 'verified_natural_read')
    summary_facts = _facts(observations, 'verified_natural_summary')
    actions = _action_refs([*facts, *summary_facts])
    try:
        Draft202012Validator.check_schema(output_schema)
        Draft202012Validator(output_schema).validate(final_output)
        reads = [_verified_read(fact) for _observation, fact in facts]
        summaries = summary_capture_fields(observations, output_schema)
        read_fields = [_field(value) for value in reads]
        fields = [*read_fields, *[field for field, _actual in summaries]]
        _distinct_paths([field['path'] for field in fields])
        for value, field in zip(reads, read_fields, strict=True):
            actual = value_at_path(value.output, value.readPath)
            expected = _value_at(final_output, field['path'])
            source_schema = schema_at_path(value.specification.outputSchema, value.readPath)
            target_schema = schema_at_path(output_schema, field['path'])
            if source_schema != target_schema:
                raise ValueError('natural_output_schema_mismatch')
            Draft202012Validator(value.specification.outputSchema).validate(value.output)
            Draft202012Validator(target_schema).validate(actual)
            if digest(actual) != digest(expected):
                raise ValueError('natural_output_value_mismatch')
        for field, actual in summaries:
            if digest(actual) != digest(_value_at(final_output, field['path'])):
                raise ValueError('natural_output_value_mismatch')
        _assert_leaf_coverage(final_output, [field['path'] for field in fields])
    except Exception:
        return None, [_assembly_gap(actions, 'natural_output_assembly_incomplete')]
    value = {'fields': fields, 'schema': output_schema, 'outputDigest': digest(final_output)}
    reference = EvidenceRef.model_validate(put_evidence('verified-output-assembly', value))
    if reference.digest != digest(value):
        return None, [_assembly_gap(actions, 'natural_output_assembly_invalid', invalid=True)]
    return ObservationFact(id='fact-' + digest(value), kind='verified_output_assembly', value=value,
                           sourceRefs=[reference]), []


def compile_natural_output_assembly(trace, output_schema, segments):
    """Compile a unique assembly fact only when every binding matches its read fact and segment."""
    matches = _facts(trace.observations, 'verified_output_assembly')
    if not matches:
        return None, [_assembly_gap([], 'natural_output_assembly_incomplete')]
    if len(matches) != 1:
        return None, [_assembly_gap([], 'natural_output_assembly_invalid', invalid=True)]
    _observation, fact = matches[0]
    try:
        value = VerifiedOutputAssembly.model_validate(fact.value)
        if value.schemaValue != output_schema or trace.finalResultRef is None \
                or value.outputDigest != trace.finalResultRef.digest:
            raise ValueError('natural_output_source_mismatch')
        _assert_fact_digest(fact)
        _distinct_paths([field.path for field in value.fields])
        compiled = _compiled_fields(trace, segments, output_schema)
        expected = [field for field, _actual in compiled]
        actual = [field.model_dump(mode='json') for field in value.fields]
        if sorted(map(digest, actual)) != sorted(map(digest, expected)):
            raise ValueError('natural_output_fields_mismatch')
        reconstructed = _assemble_verified_output(output_schema, compiled)
        Draft202012Validator(output_schema).validate(reconstructed)
        if digest(reconstructed) != value.outputDigest:
            raise ValueError('natural_output_digest_mismatch')
    except Exception:
        return None, [_assembly_gap([], 'natural_output_assembly_invalid', invalid=True)]
    return {'sourceRef': fact.id, 'fields': actual, 'schema': value.schemaValue,
            'proofRefs': [reference.model_dump(mode='json') for reference in fact.sourceRefs]}, []


def _compiled_fields(trace, segments, output_schema):
    output = []
    for observation, fact in _facts(trace.observations, 'verified_natural_read'):
        value = _verified_read(fact)
        action = next((item for item in trace.actions if item.id == value.actionRef), None)
        if action is None or action.postObservationRef != observation.id:
            raise ValueError('natural_output_read_observation_mismatch')
        segment = next((item for item in segments if _item(item, 'id') == 's-' + value.actionRef), None)
        operation = _item(segment, 'operation') if segment is not None else None
        outputs = _item(segment, 'outputs') if segment is not None else None
        if (_item(operation, 'name') != 'browser.read-fields' or not isinstance(outputs, list) or len(outputs) != 1
                or _item(outputs[0], 'sourceRef') != fact.id
                or _item(outputs[0], 'schema') != value.specification.outputSchema):
            raise ValueError('natural_output_read_segment_mismatch')
        field = _field(value)
        source_schema = schema_at_path(value.specification.outputSchema, value.readPath)
        target_schema = schema_at_path(output_schema, field['path'])
        actual = value_at_path(value.output, value.readPath)
        if source_schema != target_schema:
            raise ValueError('natural_output_schema_mismatch')
        Draft202012Validator(value.specification.outputSchema).validate(value.output)
        Draft202012Validator(target_schema).validate(actual)
        output.append((field, actual))
    if not output:
        raise ValueError('natural_output_reads_missing')
    compiled_reads = [item for item in segments if _item(_item(item, 'operation'), 'name') == 'browser.read-fields']
    if len(compiled_reads) != len(output):
        raise ValueError('natural_output_read_segment_mismatch')
    return [*output, *compiled_summary_fields(trace, segments, output_schema)]


def _verified_read(fact):
    _assert_fact_digest(fact)
    return VerifiedNaturalRead.model_validate(fact.value)


def _assert_fact_digest(fact):
    if not fact.sourceRefs or any(reference.digest != digest(fact.value) for reference in fact.sourceRefs):
        raise ValueError('natural_output_fact_digest_mismatch')


def _field(value):
    return NaturalOutputField(binding={'source': 'node', 'nodeId': value.actionRef, 'path': value.readPath},
                              path=value.outputPath).model_dump(mode='json')


def _facts(observations, kind):
    return [(observation, fact) for observation in observations for fact in observation.facts if fact.kind == kind]


def _action_refs(facts):
    return sorted({fact.value.get('actionRef') for _observation, fact in facts
                   if isinstance(fact.value, dict) and isinstance(fact.value.get('actionRef'), str)})


def _validate_path(path):
    if not isinstance(path, list) or any(not isinstance(item, str) and (type(item) is not int or item < 0) for item in path):
        raise ValueError('natural_output_path_invalid')


def _distinct_paths(paths):
    for index, left in enumerate(paths):
        for right in paths[index + 1:]:
            if left[:len(right)] == right or right[:len(left)] == left:
                raise ValueError('natural_output_path_conflict')


def _value_at(value, path):
    for item in path:
        if isinstance(value, dict) and isinstance(item, str) and item in value:
            value = value[item]
        elif isinstance(value, list) and type(item) is int and 0 <= item < len(value):
            value = value[item]
        else:
            raise ValueError('natural_output_value_path_missing')
    return value


def _leaf_paths(value, path=None):
    path = [] if path is None else path
    if isinstance(value, dict) and value:
        return [leaf for key in sorted(value) for leaf in _leaf_paths(value[key], [*path, key])]
    if isinstance(value, list) and value:
        return [leaf for index, item in enumerate(value) for leaf in _leaf_paths(item, [*path, index])]
    return [path]


def _assert_leaf_coverage(value, fields):
    for leaf in _leaf_paths(value):
        if sum(leaf[:len(path)] == path for path in fields) != 1:
            raise ValueError('natural_output_leaf_uncovered')


def _assemble_verified_output(schema, compiled):
    values = {tuple(field['path']): actual for field, actual in compiled}

    def build(current, path):
        key = tuple(path)
        if key in values:
            return values[key]
        descendants = [candidate for candidate in values if candidate[:len(key)] == key]
        if current.get('type') == 'object':
            result = {}
            for name, child in current.get('properties', {}).items():
                child_path = (*key, name)
                if any(candidate[:len(child_path)] == child_path for candidate in descendants):
                    result[name] = build(child, list(child_path))
            if any(name not in result for name in current.get('required', [])):
                raise ValueError('natural_output_leaf_uncovered')
            return result
        if current.get('type') == 'array':
            indices = sorted({candidate[len(key)] for candidate in descendants
                              if len(candidate) > len(key) and type(candidate[len(key)]) is int})
            if indices != list(range(len(indices))) or not indices:
                raise ValueError('natural_output_array_uncovered')
            maximum = current.get('maxItems')
            if type(maximum) is not int or len(indices) > maximum:
                raise ValueError('natural_output_array_unbounded')
            return [build(current['items'], [*path, index]) for index in indices]
        raise ValueError('natural_output_leaf_uncovered')

    return build(schema, [])


def _item(value, name):
    return value.get(name) if isinstance(value, dict) else getattr(value, name, None)


def _assembly_gap(actions, reason, invalid=False):
    return gap('invalid_source' if invalid else 'missing_effect_proof', actions, reason,
               'reject_trace' if invalid else 'collect_evidence')
