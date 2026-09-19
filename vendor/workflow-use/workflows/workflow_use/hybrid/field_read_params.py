"""Expand model-selected DOM node refs into the existing internal read mapping."""
from pydantic import Field, JsonValue

from .evidence import Contract
from .read import ReadSpec

_SCALAR_TYPES = frozenset({'string', 'number', 'integer', 'boolean'})


class FieldReadNodeRefs(Contract):
    refs: list[str] = Field(min_length=1, max_length=300)
    attribute: str | None = Field(default=None, pattern=r'^[a-zA-Z][a-zA-Z0-9_-]*$')


class FieldReadRecordSelection(Contract):
    fields: dict[str, FieldReadNodeRefs] = Field(min_length=1, max_length=100)


class FieldReadToolParams(Contract):
    outputPath: list[str | int] = Field(description=(
        'Real final location inside the confirmed output contract, not an arbitrary temporary variable.'))
    records: list[FieldReadRecordSelection] = Field(min_length=1, max_length=300, description=(
        'DOM-order records selected only from refs returned by bat_inspect_dom. B-A-T derives each record scope '
        'from the selected field nodes; the model does not choose a parent container. Object and object-array targets '
        'require every required contract field; scalar and scalar-array targets use the field name value.'))


class FieldReadMapping(Contract):
    specification: ReadSpec
    outputPath: list[str | int]
    readPath: list[str]


def field_read_mapping_payload(params: FieldReadToolParams, target_schema: dict[str, JsonValue], *,
                               container: str, fields: dict[str, dict[str, JsonValue]]):
    """Return the exact ReadSpec-shaped payload implied by one confirmed output field."""
    output_schema, properties, required, max_items, read_path = _read_shape(target_schema)
    selected = [set(record.fields) for record in params.records]
    if (not selected or any(names != selected[0] for names in selected[1:])
            or not selected[0] <= set(properties) or not required <= selected[0]
            or set(fields) != selected[0] or len(params.records) > max_items
            or (target_schema.get('type') == 'object' and len(params.records) != 1)):
        raise ValueError('natural_read_schema_mismatch')
    expanded = {name: _expanded_field(fields[name], properties[name]) for name in fields}
    return {
        'specification': {
            'container': container,
            'fields': expanded,
            'maxItems': max_items,
            'outputSchema': output_schema,
        },
        'outputPath': params.outputPath,
        'readPath': read_path,
    }


def expand_field_read_params(params: FieldReadToolParams, target_schema: dict[str, JsonValue], *,
                             container: str, fields: dict[str, dict[str, JsonValue]]):
    """Validate the derived payload against the existing FieldReadMapping contract."""
    return FieldReadMapping.model_validate(field_read_mapping_payload(
        params, target_schema, container=container, fields=fields))


def revalidate_field_read_mapping(params: FieldReadToolParams, target_schema: dict[str, JsonValue], mapping):
    """Rebuild a generated mapping without trusting model-visible arguments to contain locators."""
    specification = mapping.specification
    fields = {name: {'selector': field.selector, 'attribute': field.attribute}
              for name, field in specification.fields.items()}
    return expand_field_read_params(
        params, target_schema, container=specification.container, fields=fields)


def field_read_contract_fields(target_schema):
    """Return required and allowed field names from the existing shape derivation."""
    _, properties, required, _, _ = _read_shape(target_schema)
    return [name for name in properties if name in required], list(properties)


def _read_shape(target_schema):
    kind = target_schema.get('type') if isinstance(target_schema, dict) else None
    if kind == 'object':
        return target_schema, _object_properties(target_schema), _required_fields(target_schema), 1, []
    if kind == 'array':
        items = target_schema.get('items')
        if isinstance(items, dict) and items.get('type') == 'object':
            return (target_schema, _object_properties(items), _required_fields(items),
                    _collection_cardinality(target_schema), [])
        if _scalar_schema(items):
            return _value_wrapper(target_schema), {'value': target_schema}, {'value'}, 1, ['value']
        raise ValueError('natural_read_schema_unsupported')
    if _scalar_schema(target_schema):
        return _value_wrapper(target_schema), {'value': target_schema}, {'value'}, 1, ['value']
    raise ValueError('natural_read_schema_unsupported')


def _object_properties(schema):
    properties = schema.get('properties')
    if not isinstance(properties, dict) or not 0 < len(properties) <= 100:
        raise ValueError('natural_read_schema_unsupported')
    if any(not _field_schema(value) for value in properties.values()):
        raise ValueError('natural_read_schema_unsupported')
    return properties


def _required_fields(schema):
    required = schema.get('required', [])
    if not isinstance(required, list) or any(not isinstance(name, str) for name in required):
        raise ValueError('natural_read_schema_unsupported')
    return set(required)


def _expanded_field(locator, schema):
    multiple = schema.get('type') == 'array'
    scalar = schema.get('items') if multiple else schema
    maximum = _field_cardinality(schema) if multiple else 1
    return {
        **locator,
        'valueType': scalar['type'],
        'multiple': multiple,
        'maxValues': maximum,
    }


def _field_schema(schema):
    return _scalar_schema(schema) or (
        isinstance(schema, dict)
        and schema.get('type') == 'array'
        and _scalar_schema(schema.get('items'))
        and _field_cardinality_supported(schema)
    )


def _scalar_schema(schema):
    return isinstance(schema, dict) and schema.get('type') in _SCALAR_TYPES


def _field_cardinality_supported(schema):
    maximum = schema.get('maxItems')
    return maximum is None or type(maximum) is int and 0 < maximum <= 300


def _field_cardinality(schema):
    maximum = schema.get('maxItems', 300)
    if type(maximum) is not int or not 0 < maximum <= 300:
        raise ValueError('natural_read_schema_unsupported')
    return maximum


def _collection_cardinality(schema):
    maximum = schema.get('maxItems')
    if type(maximum) is not int or not 0 < maximum <= 300:
        raise ValueError('natural_read_schema_unsupported')
    return maximum


def _value_wrapper(target_schema):
    # WHY：ReadSpec 只读取对象记录；标量合同以固定 value 字段适配，不增加第二种 DOM 读取语义。
    return {
        'type': 'object',
        'properties': {'value': target_schema},
        'required': ['value'],
        'additionalProperties': False,
    }
