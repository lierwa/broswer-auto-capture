"""Dynamic output adapter retained from the archived runner; final values use JSON Schema validation."""
from pydantic import ConfigDict, create_model


def output_model_for(schema, name):
    if schema['type'] == 'object':
        model = object_model(schema, name)
        return model, lambda value: value.model_dump(mode='json', exclude_unset=True)
    model = create_model(name, value=(python_type(schema, name + 'Value'), ...), __config__=ConfigDict(extra='forbid'))
    return model, lambda value: value.value


def object_model(schema, name):
    fields, required = {}, set(schema['required'])
    for key, value in schema['properties'].items():
        annotation = python_type(value, name + key.title())
        fields[key] = (annotation, ...) if key in required else (annotation | None, None)
    return create_model(name, **fields, __config__=ConfigDict(extra='allow' if schema['additionalProperties'] else 'forbid'))


def python_type(schema, name):
    primitive = {'string': str, 'number': float, 'integer': int, 'boolean': bool, 'null': type(None)}
    if schema['type'] in primitive:
        return primitive[schema['type']]
    if schema['type'] == 'array':
        return list[python_type(schema['items'], name + 'Item')]
    if schema['type'] == 'object':
        return object_model(schema, name)
    raise ValueError('output_schema_unsupported')
