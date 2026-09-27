"""Require a paired DOM collection and a complete native query before accepting list output."""

from .evidence import digest
from .natural_reads import schema_at_path, value_at_path
from .record_projection_snapshot import derive_host_read
from .method_read_schema import compatible_read_schema


def record_list_paths(schema, output):
    """Find present arrays of records without interpreting business field names."""
    found, pending = [], [([], schema, output)]
    while pending:
        path, current, value = pending.pop()
        if not isinstance(current, dict):
            continue
        if current.get('type') == 'array' and isinstance(value, list):
            item = current.get('items')
            if isinstance(item, dict) and item.get('type') == 'object':
                found.append(path)
            continue
        if current.get('type') != 'object' or not isinstance(value, dict):
            continue
        for name, child in current.get('properties', {}).items():
            if name in value and len(path) < 40:
                pending.append(([*path, name], child, value[name]))
    return sorted(found, key=repr)


def collection_proof_candidates(collector, output_schema, final_output):
    """Join a stable host projection to the same complete Browser-Use element set."""
    result = []
    for path in record_list_paths(output_schema, final_output):
        rows = value_at_path(final_output, path)
        schema = schema_at_path(output_schema, path)
        refs = _method_refs(collector, path, schema, rows)
        for source in collector.host_read_captures:
            try:
                capture = source.get('capture') or derive_host_read(
                    source['snapshots'], output_schema, final_output, collector.completed_queries)
                if not _paired_source(capture, path, schema, rows):
                    continue
                refs.update(_matching_queries(collector.completed_queries, capture, len(rows)))
            except Exception:
                # WHY：不完整或有歧义的宿主投影不能凭模型最终文本补成来源证明。
                continue
        result.append({'path': path, 'count': len(rows), 'queryActionRefs': sorted(refs)})
    return result


def _method_refs(collector, path, schema, rows):
    selected = set(getattr(getattr(collector, 'field_read_records', None), 'selected_refs', ()))
    refs = set()
    for observation in collector.observations:
        for fact in observation.facts:
            value = fact.value if fact.kind == 'verified_natural_read' else None
            if not isinstance(value, dict) or value.get('readRef') not in selected:
                continue
            coverage = value.get('coverage')
            if (not isinstance(coverage, dict) or coverage.get('runtimeTruncated') is not False
                    or coverage.get('sampled', 0) <= 0 or value.get('stable') is not True):
                continue
            if (value.get('outputPath') == path and value.get('readPath') == []
                    and compatible_read_schema(value['specification']['outputSchema'], schema)
                    and digest(value['output']) == digest(rows)):
                refs.add(value['actionRef'])
    return refs


def _paired_source(capture, path, schema, rows):
    mappings = [item.model_dump(mode='json') if hasattr(item, 'model_dump') else item
                for item in capture.mappings]
    item = schema.get('items') if isinstance(schema, dict) else None
    properties = item.get('properties') if isinstance(item, dict) else None
    return (bool(rows) and capture.stable is True and capture.specification.outputSchema == schema
            and digest(capture.output) == digest(rows) and isinstance(properties, dict)
            and len(properties) >= 1 and set(capture.specification.fields) == set(properties)
            and any(value == {'outputPath': path, 'readPath': []} for value in mappings))


def _matching_queries(queries, capture, expected_count):
    output = []
    for query, verified in queries:
        if (query.complete is True and query.truncated is False
                and query.total == expected_count and query.total > 0
                and verified.stable is True and verified.targetId == capture.targetId
                and verified.urlDigest == capture.urlDigest
                and verified.containerIdsDigest == capture.containerIdsDigest):
            output.append(query.actionRef)
    return output


def review_collection_refs(review, candidates):
    """Every present record list needs one cited, source-backed cohort query."""
    if not candidates:
        return True
    cited = set(review.collectionActionRefs)
    return all(cited.intersection(item['queryActionRefs']) for item in candidates)
