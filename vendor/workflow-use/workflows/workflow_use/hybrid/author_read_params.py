"""Small current authoring interface over the host-owned runtime read contract."""
from copy import deepcopy
from typing import ClassVar, Literal

from jsonschema import Draft202012Validator
from pydantic import Field, create_model, model_serializer, model_validator

from .evidence import Contract
from .field_read_params import _read_shape
from .read_parts import ReadPart


class AuthorReadField(Contract):
    selector: str = Field(min_length=1, max_length=2000)
    attribute: str | None = Field(default=None, pattern=r'^[a-zA-Z][a-zA-Z0-9_-]*$')
    resolveUrl: bool = Field(default=False, description='Resolve an observed href/src only when the requested value is an absolute URL.')
    textPrefix: str | None = Field(default=None, min_length=1, max_length=100)
    textSuffix: str | None = Field(default=None, min_length=1, max_length=100)
    valueSource: Literal['page-url'] | None = None


def readable_paths(schema, path=()):
    result = []
    try:
        current = {**schema, 'minItems': 0, 'maxItems': 300} if schema.get('type') == 'array' else schema
        _read_shape(current)
        result.append(list(path))
    except ValueError:
        pass
    if schema.get('type') == 'object':
        for name in schema.get('required', []):
            result.extend(readable_paths(schema['properties'][name], (*path, name)))
    return result


class AuthorReadRequest(Contract):
    paths: ClassVar[list[list[str]]] = []
    readRef: str | None = Field(default=None, pattern=r'^r[1-9][0-9]*$')
    container: str | None = Field(default=None, min_length=1, max_length=2000,
        description='Observed record container for THIS read. Different output paths may use different regions.')
    fields: dict[str, AuthorReadField] | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode='before')
    @classmethod
    def validate_public_contract(cls, value):
        # WHY：模型实际看到的互斥形态同时用于入口校验，不能继承旧 parser 的内容模式推断。
        failure = next(Draft202012Validator(cls.model_json_schema()).iter_errors(value), None)
        if failure is not None:
            raise ValueError('method_read_request_invalid: supply container and fields, or only readRef; '
                             'use an allowed outputPath and no host-owned parameters')
        return value

    @model_serializer(mode='wrap')
    def internal_method(self, handler):
        if self.readRef is not None:
            return {'readRef': self.readRef}
        return {key: value for key, value in handler(self).items() if value is not None}


def _projection_rules(document):
    document['allOf'] = [
        {'if': {'required': ['attribute'], 'properties': {'attribute': {'type': 'string'}}},
         'then': {'properties': {name: {'type': 'null'} for name in ('textPrefix', 'textSuffix', 'valueSource')}}},
        {'if': {'required': ['resolveUrl'], 'properties': {'resolveUrl': {'const': True}}},
         'then': {'required': ['attribute'], 'properties': {'attribute': {'enum': ['href', 'src']}}}},
        {'if': {'required': ['valueSource'], 'properties': {'valueSource': {'const': 'page-url'}}},
         'then': {'properties': {'selector': {'const': ':scope'}, 'resolveUrl': {'const': False},
                    **{name: {'type': 'null'} for name in ('attribute', 'textPrefix', 'textSuffix', 'parts')}}}},
    ]


def _path_fields(schema, path):
    target = schema
    for name in path:
        target = target['properties'][name]
    if target.get('type') == 'array':
        target = {**target, 'minItems': 0, 'maxItems': 300}
    _, properties, _, _, _ = _read_shape(target)
    restrictions = {}
    for name, value in properties.items():
        scalar = value.get('items', {}) if value.get('type') == 'array' else value
        absent = ([] if value.get('type') == 'string' else ['valueSource'])
        absent += [] if scalar.get('type') == 'string' else ['parts']
        absent += ['textPrefix', 'textSuffix'] if scalar.get('type') == 'boolean' else []
        restrictions[name] = {'properties': {key: {'type': 'null'} for key in absent}}
    allowed = [name for name in properties if name != '__batRecordKey' or target.get('type') != 'array']
    return {'propertyNames': {'enum': allowed}, 'properties': restrictions,
            **({'required': ['value']} if target.get('type') not in ('object',)
               and not (target.get('type') == 'array' and target.get('items', {}).get('type') == 'object') else {})}


def author_read_params(schema, *, joined=True, projection_rules=True):
    paths = readable_paths(schema)
    if not paths:
        raise ValueError('natural_read_schema_unsupported')
    # WHY：固定路径只在宿主序列化时绑定；多路径选择使用合同枚举，不允许任意地址。
    def interface(document):
        definition = ['container', 'fields'] + (['outputPath'] if len(paths) > 1 else [])
        document['oneOf'] = [
            {'required': ['readRef'], 'properties': {'readRef': {'type': 'string'}},
             'not': {'anyOf': [{'required': [key]} for key in definition]}},
            {'required': definition, 'not': {'required': ['readRef']},
             'properties': {'container': {'type': 'string'}, 'fields': {'type': 'object'}}},
        ]
        if projection_rules:
            document['allOf'] = [
                {'if': {'required': ['outputPath'], 'properties': {'outputPath': {'const': path}}},
                 'then': {'properties': {'fields': _path_fields(schema, path)}}}
                for path in paths] if len(paths) > 1 else [{'properties': {'fields': _path_fields(schema, paths[0])}}]
    arguments = {'outputPath': (list[str] | None, Field(default=None,
        json_schema_extra={'enum': deepcopy(paths)}, description='Choose the result path supplied by this read.'))} if len(paths) > 1 else {}
    if joined:
        def part_shape(document):
            document['oneOf'] = [
                {'not': {'required': ['parts']}},
                {'required': ['parts'], 'properties': {'parts': {'type': 'array'}}, 'not': {'anyOf': [{'required': [name]} for name in
                    ('attribute', 'resolveUrl', 'valueSource', 'textPrefix', 'textSuffix')]}}]
            if projection_rules:
                _projection_rules(document)
        field = create_model('AuthorReadField', __base__=AuthorReadField,
            __config__={'json_schema_extra': part_shape},
            parts=(list[ReadPart] | None, Field(default=None, min_length=2, max_length=10, description=(
                'Only when one output string combines separate observed nodes (for example a label and a status icon): '
                'selector selects each row; parts select exactly one text/attribute each WITHIN that row. '
                'The host joins parts with newlines. Preserve actual icon attributes, do not infer status from names. '
                'Exclude unrelated or sensitive values. Cannot combine parts with other projection options.'))))
        arguments['fields'] = (dict[str, field] | None, Field(default=None, min_length=1, max_length=100))
    if projection_rules:
        arguments['container'] = (str | None, Field(default=None, min_length=1, max_length=2000, description=(
            'Observed region for THIS read. For an array of objects, select each record. For a scalar, select one region. '
            'For an array of scalars, either select each item with fields.value.selector=:scope, or select one '
            'common region with fields.value.selector selecting all items inside it. The host normalizes these '
            'equivalent forms without truncation. Different output paths may use different regions.')))
    model = create_model('AuthorFieldRead', __base__=AuthorReadRequest,
        __config__={'json_schema_extra': interface}, **arguments)
    model.paths = paths
    return model
