"""Bind plan-owned result fields and lower typed derivations to existing data capabilities."""

from .evidence import digest, gap


def build_result_derivation_fields(result_spec, final_output, output_schema, fields):
    """Prove declared counts from the E1 result without inferring them from names or sample coincidence."""
    spec = _spec(result_spec)
    if spec.get('mode') != 'data' or not spec.get('derivations'):
        return []
    output = []
    for derivation in spec['derivations']:
        target = _derivation_target(spec, derivation)
        source_field = _field_at(fields, derivation['sourcePath'])
        source_value = _value_at(final_output, derivation['sourcePath'])
        target_value = _value_at(final_output, target['path'])
        if (source_field is None or not isinstance(source_value, list) or target_value != len(source_value)):
            raise ValueError('natural_result_derivation_sample_mismatch')
        if _schema_at(output_schema, derivation['sourcePath']).get('type') != 'array' \
                or _schema_at(output_schema, target['path']).get('type') != 'integer':
            raise ValueError('natural_result_derivation_schema_mismatch')
        output.append({'binding': {'source': 'node', 'nodeId': _derivation_id(derivation['producerRef']),
                                   'path': []}, 'path': target['path']})
    return output


def compile_result_derivation_segments(result_spec, trace, segments, output_schema):
    """Insert ordinary ``data.transform/count`` segments immediately after their verified array source."""
    spec = _spec(result_spec)
    if spec.get('mode') != 'data' or not spec.get('derivations'):
        return segments, []
    facts = [fact for observation in trace.observations for fact in observation.facts
             if fact.kind == 'verified_output_assembly']
    if len(facts) != 1 or not isinstance(facts[0].value, dict):
        return segments, [_binding_gap('natural_result_derivation_evidence_missing')]
    fact, fields = facts[0], facts[0].value.get('fields')
    if not isinstance(fields, list):
        return segments, [_binding_gap('natural_result_derivation_evidence_invalid', invalid=True)]
    compiled = list(segments)
    try:
        for derivation in spec['derivations']:
            target = _derivation_target(spec, derivation)
            source_field = _field_at(fields, derivation['sourcePath'])
            target_field = _field_at(fields, target['path'])
            if source_field is None or target_field is None:
                raise ValueError('natural_result_derivation_field_missing')
            identifier = _derivation_id(derivation['producerRef'])
            if target_field.get('binding') != {'source': 'node', 'nodeId': identifier, 'path': []}:
                raise ValueError('natural_result_derivation_binding_mismatch')
            source_binding = source_field.get('binding')
            if not isinstance(source_binding, dict) or source_binding.get('source') not in ('node', 'input'):
                raise ValueError('natural_result_derivation_dynamic_source_required')
            source_schema = _schema_at(output_schema, derivation['sourcePath'])
            target_schema = _schema_at(output_schema, target['path'])
            if source_schema.get('type') != 'array' or target_schema.get('type') != 'integer':
                raise ValueError('natural_result_derivation_schema_mismatch')
            proof_refs = [reference.model_dump(mode='json') for reference in fact.sourceRefs]
            segment = {'id': identifier, 'kind': 'deterministic',
                'operation': {'name': 'data.transform', 'version': 1, 'dataOperation': 'count'},
                'target': None, 'preconditions': [], 'expectedEffect': {'kind': 'read'},
                'postconditions': [{'kind': 'output_schema', 'schemaDigest': digest(target_schema)}],
                'outputs': [{'schema': target_schema, 'sourceRef': fact.id}], 'proofRefs': proof_refs,
                'bindings': [{'id': 'binding-' + digest({'id': identifier, 'source': source_binding})[:16],
                              'actionRef': identifier, 'argumentPath': 'source',
                              'kind': 'prior_output' if source_binding['source'] == 'node' else 'runtime_input',
                              'sourceRef': fact.id, 'transform': None, 'proofRefs': proof_refs,
                              'binding': source_binding}]}
            _insert_after_source(compiled, segment, source_binding)
    except Exception:
        return segments, [_binding_gap('natural_result_derivation_invalid', invalid=True)]
    return compiled, []


def compile_result_binding(result_spec, assembly, output_schema):
    spec = _spec(result_spec)
    if spec['mode'] == 'execution':
        if assembly is not None or output_schema != {'type': 'null'}:
            return None, [_binding_gap('execution_result_binding_forbidden', invalid=True)]
        return None, []
    if assembly is None:
        return None, [_binding_gap('natural_result_binding_incomplete')]
    if spec['schema'] != output_schema or assembly['schema'] != output_schema:
        return None, [_binding_gap('natural_result_binding_schema_mismatch', invalid=True)]
    fields = spec['fields']
    assignments = []
    try:
        _distinct_paths([field['path'] for field in fields])
        _assert_required_coverage(output_schema, [field['path'] for field in fields])
        for source in assembly['fields']:
            owners = [field for field in fields if _prefix(field['path'], source['path'])]
            if len(owners) > 1:
                raise ValueError('natural_result_binding_owner_ambiguous')
            if len(owners) == 1:
                owner = owners[0]
                assignments.append({'to': source['path'], 'from': source['binding'],
                                    'producerRef': owner['producerRef']})
                continue
            covered = [field for field in fields if _prefix(source['path'], field['path'])]
            if not covered:
                raise ValueError('natural_result_binding_owner_missing')
            # WHY: one verified root-object read may satisfy several plan-owned fields. Preserve each
            # producerRef and lower it to a child ValueBinding instead of inventing a shared producer.
            for owner in covered:
                relative = owner['path'][len(source['path']):]
                assignments.append({'to': owner['path'], 'from': _binding_at_path(source['binding'], relative),
                                    'producerRef': owner['producerRef']})
        # WHY：可选字段未在本次真实结果中出现时没有可绑定来源；只核验实际赋值覆盖全部必需路径。
        _assert_required_coverage(output_schema, [assignment['to'] for assignment in assignments])
    except Exception:
        return None, [_binding_gap('natural_result_binding_invalid', invalid=True)]
    return {'contractVersion': 'bat-result-binding/v1', 'schema': output_schema,
            'assignments': assignments, 'sourceRef': assembly['sourceRef'],
            'proofRefs': assembly['proofRefs']}, []


def compile_empty_list_branches(result_spec, result_binding, segments):
    """Lower proven indexed consumers to ordinary branches before their first path read."""
    spec = _spec(result_spec)
    indexed = _indexed_consumers(segments)
    if not indexed:
        return [], []
    edges = spec.get('edgeCases', []) if spec['mode'] == 'data' else []
    # WHY：未声明空结果也算成功时，缺失值由普通绑定明确失败；不能强要一个用户未定义的成功分支。
    if not edges:
        return [], []
    if result_binding is None or len(edges) != len(indexed):
        return [], [_binding_gap('natural_empty_list_control_required')]
    branches = []
    for edge, guard in zip(edges, indexed, strict=True):
        missing_producer = _missing_collection_producer(segments, guard)
        skipped = [segment['id'] for segment in segments[guard['consumerIndex']:]]
        skipped_actions = {item[2:] for item in skipped if item.startswith('s-')}
        assignments = [_empty_collection_assignment(item, guard) if missing_producer else item
                       for item in result_binding['assignments']
                       if item['from'].get('source') != 'node'
                       or item['from'].get('nodeId') not in skipped_actions]
        try:
            if not assignments:
                raise ValueError('natural_empty_branch_output_missing')
            _assert_required_coverage(result_binding['schema'], [item['to'] for item in assignments])
        except Exception:
            return [], [_binding_gap('natural_empty_branch_output_incomplete')]
        branches.append({
            'id': 'branch-result-' + edge['controlRef'], 'controlRef': edge['controlRef'],
            'sourceActionRef': guard['sourceActionRef'], 'sourceSegmentId': guard['sourceSegmentId'],
            'consumerSegmentId': guard['consumerSegmentId'], 'skippedSegmentIds': skipped,
            'predicate': {'operator': 'array_length_at_least',
                          'value': {'source': 'node', 'nodeId': guard['sourceSegmentId'],
                                    'path': guard['collectionPath']},
                          'minimum': {'source': 'constant', 'value': guard['minimum']}},
            'falseResult': {**result_binding, 'assignments': assignments},
            'falseTerminalId': 'completed-empty-' + edge['controlRef'],
            **({'missingProducerSegmentId': missing_producer} if missing_producer else {}),
        })
    return branches, []


def wire_empty_list_branches(graph, branches):
    for branch in branches:
        incoming = [edge for edge in graph['edges'] if edge['to'] == branch['consumerSegmentId']]
        if len(incoming) != 1:
            raise ValueError('natural_empty_list_consumer_edge_ambiguous')
        incoming[0]['to'] = branch['id']
        graph['edges'].extend([
            {'from': branch['id'], 'outcome': 'true', 'to': branch['consumerSegmentId']},
            {'from': branch['id'], 'outcome': 'false', 'to': branch['falseTerminalId']},
        ])
        graph['terminals'].append({'id': branch['falseTerminalId'], 'status': 'completed'})
        producer = branch.get('missingProducerSegmentId')
        if producer is not None:
            missing = [edge for edge in graph['edges']
                       if edge['from'] == producer and edge['outcome'] == 'missing']
            if len(missing) != 1:
                raise ValueError('natural_empty_list_missing_edge_ambiguous')
            missing[0]['to'] = branch['falseTerminalId']
    return graph


def _missing_collection_producer(segments, guard):
    source_index = next((index for index, item in enumerate(segments)
                         if item['id'] == guard['sourceSegmentId']), -1)
    if source_index < 1:
        return None
    producer = segments[source_index - 1]
    readiness = [item for item in producer.get('postconditions', [])
                 if item.get('kind') == 'read_fields'
                 and item.get('consumerRef') == guard['sourceSegmentId']]
    operation = producer.get('operation') or {}
    target = producer.get('target')
    if (len(readiness) != 1 or operation.get('name') != 'browser.workflow-step'
            or not isinstance(target, dict)
            or target.get('strategy') not in {'history', 'css', 'xpath', 'structure'}):
        return None
    return producer['id']


def _empty_collection_assignment(assignment, guard):
    source = assignment.get('from') or {}
    if (source.get('source') == 'node' and source.get('nodeId') == guard['sourceActionRef']
            and source.get('path') == guard['collectionPath']):
        return {**assignment, 'from': {'source': 'constant', 'value': []}}
    return assignment


def _indexed_consumers(segments):
    segment_index = {segment['id']: index for index, segment in enumerate(segments)}
    guards = {}
    for consumer_index, segment in enumerate(segments):
        for item in segment.get('bindings', []):
            binding = item.get('binding')
            if not isinstance(binding, dict) or binding.get('source') != 'node':
                continue
            source_id = 's-' + binding.get('nodeId', '')
            source_index = segment_index.get(source_id)
            if source_index is None or source_index >= consumer_index:
                continue
            source = segments[source_index]
            source_schema = source.get('outputs', [{}])[0].get('schema') if source.get('outputs') else None
            guarded = _first_unproven_array_index(source_schema, binding.get('path'))
            if guarded is None:
                continue
            collection_path, minimum = guarded
            current = guards.get(source_id)
            candidate = {'sourceActionRef': binding['nodeId'], 'sourceSegmentId': source_id,
                         'consumerSegmentId': segment['id'], 'consumerIndex': consumer_index,
                         'collectionPath': collection_path, 'minimum': minimum}
            if current is None or consumer_index < current['consumerIndex']:
                guards[source_id] = candidate
            elif consumer_index == current['consumerIndex']:
                current['minimum'] = max(current['minimum'], minimum)
    return sorted(guards.values(), key=lambda item: item['consumerIndex'])


def _first_unproven_array_index(schema, path):
    if not isinstance(schema, dict) or not isinstance(path, list):
        return None
    current, prefix = schema, []
    for item in path:
        if current.get('type') == 'array' and type(item) is int:
            minimum = item + 1
            bound = current.get('minItems')
            # WHY：输出合同已保证该索引时，空集合必须由运行时合同判失败，不能走正常完成分支。
            if type(bound) is not int or bound < minimum:
                return prefix, minimum
            current = current.get('items', {})
        elif current.get('type') == 'object' and isinstance(item, str):
            current = current.get('properties', {}).get(item, {})
        else:
            return None
        prefix.append(item)
    return None


def _assert_required_coverage(schema, owners, path=None):
    path = [] if path is None else path
    if any(_prefix(owner, path) for owner in owners):
        return
    if schema.get('type') != 'object':
        raise ValueError('natural_result_binding_required_path_missing')
    properties = schema.get('properties', {})
    for name in schema.get('required', []):
        child = properties.get(name)
        if not isinstance(child, dict):
            raise ValueError('natural_result_binding_required_path_missing')
        _assert_required_coverage(child, owners, [*path, name])


def _distinct_paths(paths):
    for index, left in enumerate(paths):
        for right in paths[index + 1:]:
            if _prefix(left, right) or _prefix(right, left):
                raise ValueError('natural_result_binding_path_conflict')


def _prefix(left, right):
    return len(left) <= len(right) and left == right[:len(left)]


def _spec(result_spec):
    if result_spec is None:
        return {}
    return result_spec if isinstance(result_spec, dict) else result_spec.model_dump(mode='json', by_alias=True)


def _derivation_target(spec, derivation):
    targets = [field for field in spec['fields'] if field['producerRef'] == derivation['producerRef']]
    sources = [field for field in spec['fields'] if field['producerRef'] == derivation['sourceProducerRef']
               and field['path'] == derivation['sourcePath']]
    if len(targets) != 1 or len(sources) != 1:
        raise ValueError('natural_result_derivation_owner_invalid')
    return targets[0]


def _derivation_id(producer_ref):
    return 'result-' + producer_ref


def _field_at(fields, path):
    matches = [field for field in fields if isinstance(field, dict) and field.get('path') == path]
    if len(matches) > 1:
        raise ValueError('natural_result_derivation_source_ambiguous')
    return matches[0] if matches else None


def _value_at(value, path):
    for item in path:
        if isinstance(item, str) and isinstance(value, dict) and item in value:
            value = value[item]
        elif type(item) is int and isinstance(value, list) and 0 <= item < len(value):
            value = value[item]
        else:
            raise ValueError('natural_result_derivation_value_missing')
    return value


def _binding_at_path(binding, path):
    if not path:
        return binding
    if binding.get('source') in ('node', 'input'):
        return {**binding, 'path': [*binding.get('path', []), *path]}
    if binding.get('source') == 'constant':
        return {'source': 'constant', 'value': _value_at(binding.get('value'), path)}
    raise ValueError('natural_result_binding_source_invalid')


def _schema_at(schema, path):
    current = schema
    for item in path:
        if isinstance(item, str) and current.get('type') == 'object':
            current = current.get('properties', {}).get(item, {})
        elif type(item) is int and current.get('type') == 'array':
            current = current.get('items', {})
        else:
            return {}
    return current


def _insert_after_source(segments, derived, binding):
    if any(segment.get('id') == derived['id'] for segment in segments):
        raise ValueError('natural_result_derivation_id_conflict')
    if binding['source'] == 'input':
        segments.insert(0, derived)
        return
    candidates = [index for index, segment in enumerate(segments)
                  if segment.get('id') in (binding['nodeId'], 's-' + binding['nodeId'])]
    if len(candidates) != 1:
        raise ValueError('natural_result_derivation_source_segment_missing')
    index = candidates[0] + 1
    while index < len(segments) and segments[index].get('operation', {}).get('name') == 'data.transform':
        index += 1
    segments.insert(index, derived)


def _binding_gap(reason, invalid=False):
    return gap('invalid_source' if invalid else 'missing_effect_proof', [], reason,
               'reject_trace' if invalid else 'collect_evidence')
