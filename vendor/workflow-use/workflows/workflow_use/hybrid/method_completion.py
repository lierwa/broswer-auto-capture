"""Assemble representative output from host read receipts, never model-written values."""
from jsonschema import Draft202012Validator

from .natural_reads import paths_conflict, schema_at_path, value_at_path
from .natural_output import _assemble_verified_output
from .method_read_schema import compatible_read_schema, representative_schema


def complete_from_read_refs(records, read_refs, output_schema, result_spec):
    if output_schema == {'type': 'null'}:
        if read_refs:
            raise ValueError('completion_read_reference_invalid')
        return None
    if not read_refs or len(set(read_refs)) != len(read_refs) or records is None:
        raise ValueError('completion_read_reference_invalid')
    by_ref = {record.readRef: record for record in records.records}
    if any(reference not in by_ref for reference in read_refs):
        raise ValueError('completion_read_reference_invalid')
    selected = [by_ref[reference] for reference in read_refs]
    paths = [record.mapping.outputPath for record in selected]
    if any(paths_conflict(left, right) for i, left in enumerate(paths) for right in paths[i + 1:]):
        raise ValueError('completion_read_path_conflict')
    compiled = []
    for record in selected:
        mapping = record.mapping
        target = schema_at_path(output_schema, mapping.outputPath)
        source = schema_at_path(mapping.specification.outputSchema, mapping.readPath)
        if not compatible_read_schema(source, target):
            raise ValueError('completion_read_schema_mismatch')
        actual = value_at_path(record.sample.output, mapping.readPath)
        compiled.append(({'path': mapping.outputPath}, actual))
    _append_derivations(compiled, result_spec)
    output = _assemble_verified_output(output_schema, compiled)
    Draft202012Validator(representative_schema(
        output_schema, paths, result_spec=result_spec, output=output)).validate(output)
    records.selected_refs = tuple(read_refs)
    return output


def _append_derivations(compiled, result_spec):
    if getattr(result_spec, 'mode', None) != 'data':
        return
    for derivation in result_spec.derivations:
        sources = [actual for field, actual in compiled if field['path'] == derivation.sourcePath]
        targets = [field.path for field in result_spec.fields if field.producerRef == derivation.producerRef]
        if derivation.operation != 'count' or len(sources) != 1 or len(targets) != 1:
            raise ValueError('completion_derivation_source_missing')
        if not isinstance(sources[0], list):
            raise ValueError('completion_derivation_source_invalid')
        compiled.append(({'path': targets[0]}, len(sources[0])))
