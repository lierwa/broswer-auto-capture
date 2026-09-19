"""Persist only proven host read specifications and final-output mappings."""
from copy import deepcopy

from jsonschema import Draft202012Validator

from .evidence import digest
from .natural_reads import schema_at_path, value_at_path
from .record_projection_capture import HostReadMapping, matching_output_paths
from .record_projection_snapshot import derive_host_read


def attach_host_read_facts(collector, final_output):
    captured = []
    for item in collector.host_read_captures:
        try:
            capture = item.get('capture') or derive_host_read(
                item['snapshots'], collector.output_schema, final_output)
        except Exception:
            continue
        mappings = list(capture.mappings) or [
            {'outputPath': path, 'readPath': []} for path in matching_output_paths(
                collector.output_schema, final_output,
                capture.specification.outputSchema, capture.output)
        ]
        captured.append((item, capture, mappings))
    final_output = _canonical_output(captured, collector.output_schema, final_output)
    _attach_cross_output_mappings(captured, collector.output_schema, final_output)
    by_action = {}
    for item, capture, mappings in captured:
        for mapping in mappings:
            value = mapping.model_dump(mode='json') if hasattr(mapping, 'model_dump') else mapping
            by_action.setdefault(item['actionRef'], []).append((item, capture, value))
    for action_ref, options in by_action.items():
        _attach_action_facts(collector, action_ref, options)
    return final_output


def _canonical_output(captured, output_schema, final_output):
    replacements = {}
    for _item, capture, mappings in captured:
        for mapping in mappings:
            value = _mapping_value(mapping)
            try:
                projected = value_at_path(capture.output, value['readPath'])
            except Exception:
                continue
            replacements.setdefault(tuple(value['outputPath']), {})[digest(projected)] = projected
    canonical = deepcopy(final_output)
    for path, options in replacements.items():
        if len(options) == 1:
            canonical = _replace_path(canonical, list(path), next(iter(options.values())))
    Draft202012Validator(output_schema).validate(canonical)
    return canonical


def _replace_path(value, path, replacement):
    if not path:
        return deepcopy(replacement)
    current = value
    for item in path[:-1]:
        current = current[item]
    current[path[-1]] = deepcopy(replacement)
    return value


def _attach_cross_output_mappings(captured, output_schema, final_output):
    covered = [list(_mapping_value(mapping)['outputPath'])
               for _item, _capture, mappings in captured for mapping in mappings]
    for output_path in _leaf_paths(final_output):
        if any(output_path[:len(owner)] == owner for owner in covered):
            continue
        try:
            target_schema = schema_at_path(output_schema, output_path)
            expected = value_at_path(final_output, output_path)
        except Exception:
            continue
        candidates = {}
        for index, (item, capture, _mappings) in enumerate(captured):
            for read_path, actual in _leaf_values(capture.output):
                try:
                    source_schema = schema_at_path(capture.specification.outputSchema, read_path)
                except Exception:
                    continue
                if source_schema == target_schema and digest(actual) == digest(expected):
                    candidates[(item['actionRef'], tuple(read_path))] = (index, read_path)
        if len(candidates) != 1:
            continue
        index, read_path = next(iter(candidates.values()))
        captured[index][2].append(HostReadMapping(outputPath=output_path, readPath=read_path))
        covered.append(output_path)


def _mapping_value(mapping):
    return mapping.model_dump(mode='json') if hasattr(mapping, 'model_dump') else mapping


def _leaf_paths(value, path=None):
    path = [] if path is None else path
    return [path] if not isinstance(value, (dict, list)) else [
        leaf for key, child in (sorted(value.items()) if isinstance(value, dict) else enumerate(value))
        for leaf in _leaf_paths(child, [*path, key])]


def _leaf_values(value, path=None):
    path = [] if path is None else path
    if not isinstance(value, (dict, list)):
        return [(path, value)]
    items = sorted(value.items()) if isinstance(value, dict) else enumerate(value)
    return [leaf for key, child in items for leaf in _leaf_values(child, [*path, key])]


def _attach_action_facts(collector, action_ref, options):
    specifications = {digest(capture.specification) for _item, capture, _mapping in options}
    if len(specifications) != 1:
        return
    unique = {(tuple(mapping['outputPath']), tuple(mapping['readPath'])):
              (item, capture, mapping) for item, capture, mapping in options}
    item = next(iter(unique.values()))[0]
    observation = next((value for value in collector.observations
                        if value.id == item['postObservationRef']), None)
    if observation is None:
        return
    for _key, (source, capture, mapping) in sorted(unique.items(), key=lambda item: repr(item[0])):
        value = {
            'actionRef': action_ref,
            'specification': capture.specification.model_dump(mode='json'),
            'outputPath': mapping['outputPath'],
            'readPath': mapping['readPath'],
            'output': capture.output,
            'resultDigest': source['resultDigest'],
            'urlDigest': capture.urlDigest,
            'targetId': capture.targetId,
            'containerIdsDigest': capture.containerIdsDigest,
            'stable': capture.stable,
        }
        observation.facts.append(collector.value_fact('verified_natural_read', value))
