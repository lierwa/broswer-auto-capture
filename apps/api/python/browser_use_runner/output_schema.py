"""Dynamic output adapter retained from the archived runner; final values use JSON Schema validation."""
from pydantic import BaseModel, ConfigDict, Field, create_model, model_serializer


def output_model_for(schema, name):
    if schema['type'] == 'object':
        model = object_model(schema, name)
        # Browser-Use serializes an omitted optional structured-output field as null. JSON Schema
        # optional means absent, not nullable, so restore the public contract at the adapter boundary.
        return model, lambda value: value.model_dump(mode='json', by_alias=True)
    model = create_model(name, value=(python_type(schema, name + 'Value'), ...), __config__=ConfigDict(extra='forbid'))
    # WHY：根数组里的对象仍是 Pydantic 子模型；必须先转成 JSON 值再交给 JSON Schema 核验。
    return model, lambda value: value.model_dump(mode='json', by_alias=True)['value']


def object_model(schema, name):
    fields, required = {}, set(schema['required'])
    for index, (key, value) in enumerate(schema['properties'].items()):
        annotation = python_type(value, name + key.title())
        # WHY：JSON 字段可带下划线或与 Pydantic 方法同名；宿主别名不能丢掉真实字段和记录身份。
        fields[f'field_{index}'] = (annotation, Field(alias=key)) if key in required \
            else (annotation | None, Field(default=None, alias=key))

    class ContractObject(BaseModel):
        model_config = ConfigDict(extra='allow' if schema['additionalProperties'] else 'forbid', serialize_by_alias=True)

        @model_serializer(mode='wrap')
        def serialize_contract(self, handler):
            # WHY：原生 done 和根数组嵌套对象都遵循同一缺省合同；真实 null 类型仍保留 null。
            value = handler(self)
            return {key: item for key, item in value.items()
                    if not (key not in required and item is None
                            and schema['properties'].get(key, {}).get('type') != 'null')}

    return create_model(name, **fields, __base__=ContractObject)


def python_type(schema, name):
    primitive = {'string': str, 'number': float, 'integer': int, 'boolean': bool, 'null': type(None)}
    if schema['type'] in primitive:
        return primitive[schema['type']]
    if schema['type'] == 'array':
        return list[python_type(schema['items'], name + 'Item')]
    if schema['type'] == 'object':
        return object_model(schema, name)
    raise ValueError('output_schema_unsupported')
