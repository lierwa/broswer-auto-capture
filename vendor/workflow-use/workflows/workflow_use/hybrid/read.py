"""Typed field binding over fixed browser-native values and scalar conversions."""
import json
import math
from typing import Literal

from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue, model_serializer, model_validator

from .evidence import Contract, digest, gap
from .rendered_field_text import FieldReadError, replace_shadow_text
from .semantic import bounded_schema
from .targets import TargetResolver


class ReadField(Contract):
    selector: str = Field(min_length=1, max_length=2000)
    attribute: str | None = Field(default=None, pattern=r'^[a-zA-Z][a-zA-Z0-9_-]*$')
    valueType: Literal['string', 'number', 'integer', 'boolean'] = 'string'
    multiple: bool = False
    maxValues: int = Field(default=1, gt=0, le=300)

    @model_validator(mode='after')
    def bounded_cardinality(self):
        if not self.multiple and self.maxValues != 1:
            raise ValueError('single_field_cardinality_required')
        return self

    @model_serializer(mode='wrap')
    def preserve_single_value_digest(self, serialize):
        # WHY：扩展多值读取不能改变原有单值 ReadSpec 的字节摘要，破坏既存字段证据。
        value = serialize(self)
        if not self.multiple:
            value.pop('multiple', None)
        if self.maxValues == 1:
            value.pop('maxValues', None)
        return value


class ReadSpec(Contract):
    container: str = Field(min_length=1, max_length=2000)
    fields: dict[str, ReadField] = Field(min_length=1, max_length=100)
    maxItems: int = Field(gt=0, le=300)
    maxInputBytes: int | None = Field(default=None, gt=0)
    outputSchema: dict[str, JsonValue]

    @model_serializer(mode='wrap')
    def preserve_explicit_budget_digest(self, serialize):
        # WHY：缺省表示调用方未另设字节预算；旧调用方显式预算的 canonical bytes 必须保持不变。
        value = serialize(self)
        if self.maxInputBytes is None:
            value.pop('maxInputBytes', None)
        return value


FIELD_PROJECTION_SCRIPT = """(fields) => {
  const projected = Object.create(null);
  for (const field of fields) {
    const name = field.name;
    const limit = field.multiple ? field.maxValues + 1 : 2;
    const matches = [];
    let selfMatched;
    let selected;
    try {
      selfMatched = this.matches(field.selector);
      selected = this.querySelectorAll(field.selector);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SyntaxError') return [name];
      throw error;
    }
    if (selfMatched) matches.push(this);
    for (const node of selected) {
      if (node !== this) matches.push(node);
      if (matches.length >= limit) break;
    }
    projected[name] = {
      selfMatched,
      values: matches.slice(0, limit).map((node) => {
        if (field.attribute) return {value: node.getAttribute(field.attribute), hasShadow: false};
        const hasShadow = Boolean(node.shadowRoot
          || Array.from(node.querySelectorAll('*')).some((child) => child.shadowRoot));
        if (!node.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) {
          return {value: null, hasShadow};
        }
        return {value: node.innerText, hasShadow};
      }),
    };
  }
  return projected;
}"""


async def read_fields(browser, specification: ReadSpec, *, scope=None):
    resolver = TargetResolver(browser)
    target_id = await resolver.assert_scope(scope) if scope is not None else None
    try:
        elements = await resolver.resolve_collection(specification.container, scope)
    except RuntimeError as error:
        if 'DOM Error while querying' not in str(error):
            raise
        # WHY：公开集合查询只证明容器无法定位，不能把 CDP 的泛化错误猜成 CSS 语法错误。
        raise FieldReadError('read_container_resolution_failed', field_name='container',
                             reason='container_not_resolved') from error
    if len(elements) > specification.maxItems:
        raise FieldReadError('read_item_limit', field_name='container', match_count=len(elements),
                             reason='exceeded_contract_max_items')
    output, consumed, native_context = [], 0, {}
    for element in elements:
        fragments = await project_fields(browser, element, specification.fields, native_context)
        consumed += sum(len(value.encode()) for values in fragments.values()
                        for value in values if isinstance(value, str))
        if specification.maxInputBytes is not None and consumed > specification.maxInputBytes:
            raise ValueError('read_input_limit')
        record = {name: read_projected_field(name, fragments.get(name), field)
                  for name, field in specification.fields.items()}
        output.append(record)
    if specification.outputSchema.get('type') == 'object':
        if specification.maxItems != 1 or len(output) != 1:
            raise ValueError('read_single_object_required')
        output = output[0]
    Draft202012Validator(specification.outputSchema).validate(output)
    if scope is not None:
        await resolver.assert_scope(scope, target_id)
    return output


async def project_fields(browser, element, fields, native_context):
    projection = [{'name': name, 'selector': field.selector, 'multiple': field.multiple,
                   'maxValues': field.maxValues, 'attribute': field.attribute}
                  for name, field in fields.items()]
    try:
        raw = await element.evaluate(FIELD_PROJECTION_SCRIPT, projection)
        result = json.loads(raw)
    except Exception as error:
        raise ValueError('read_field_projection_failed') from error
    if isinstance(result, list) and len(result) == 1 and result[0] in fields:
        raise FieldReadError('read_field_projection_failed', field_name=result[0],
                             reason='invalid_selector')
    if not isinstance(result, dict) or set(result) != set(fields):
        raise ValueError('read_field_projection_invalid')
    if any(not _projected_values_valid(value) for value in result.values()):
        raise ValueError('read_field_projection_invalid')
    result = await replace_shadow_text(browser, element, projection, result, native_context)
    return {name: [item['value'] for item in value['values']] for name, value in result.items()}


def _projected_values_valid(value):
    return (isinstance(value, dict) and set(value) == {'selfMatched', 'values'}
            and isinstance(value['selfMatched'], bool) and isinstance(value['values'], list)
            and all(isinstance(item, dict) and set(item) == {'value', 'hasShadow'}
                    and isinstance(item['value'], (str, type(None)))
                    and isinstance(item['hasShadow'], bool) for item in value['values']))


def read_projected_field(name, fragments, field):
    if not isinstance(fragments, list):
        raise ValueError('read_field_projection_invalid')
    if field.multiple:
        if len(fragments) > field.maxValues:
            raise FieldReadError('read_field_value_limit', field_name=name, match_count=len(fragments),
                                 reason='exceeded_max_values')
        return [read_value(name, value, field) for value in fragments]
    if len(fragments) != 1:
        raise FieldReadError('ambiguous_or_missing_read_field', field_name=name, match_count=len(fragments),
                             reason='expected_exactly_one_match')
    return read_value(name, fragments[0], field)


def read_value(name, value, field):
    # WHY：普通文本由 innerText、shadow 文本由原生 DOM 投影拥有；这里仅做缺值检查和确定性标量转换。
    if not isinstance(value, str):
        raise FieldReadError('read_field_not_text', field_name=name, match_count=1,
                             reason='selected_value_not_text')
    if field.valueType == 'string':
        return value
    if field.valueType == 'integer':
        return int(value)
    if field.valueType == 'number':
        result = float(value)
        if not math.isfinite(result):
            raise ValueError('read_number_not_finite')
        return result
    if value not in ('true', 'false'):
        raise FieldReadError('read_boolean_invalid', field_name=name, match_count=1,
                             reason='invalid_boolean_text')
    return value == 'true'


def compile_read(request, action, pre, post):
    clauses = [clause for clause in request.requirement.clauses if clause.kind == 'output'
               and isinstance(clause.expression, dict) and set(clause.expression) == {'read'}]
    matches = []
    for clause in clauses:
        specification = ReadSpec.model_validate(clause.expression['read'])
        proof = {'actionRef': action.id, 'specificationDigest': digest(specification),
                 'resultDigest': action.resultRef.digest}
        if any(fact.kind == 'verified_field_read' and fact.value == proof for fact in post.facts):
            matches.append((clause, specification))
    if not matches:
        return None, []
    if len(matches) != 1:
        return None, [gap('ambiguous_clause_alignment', [action.id], 'multiple_field_read_sources', 'confirm_intent')]
    clause, specification = matches[0]
    if not bounded_schema(specification.outputSchema):
        return None, [gap('missing_binding', [action.id], 'bounded_read_schema_required', 'confirm_intent')]
    Draft202012Validator.check_schema(specification.outputSchema)
    return dict(id='s-' + action.id, kind='deterministic',
                operation={'name': 'browser.read-fields', 'version': 2, 'specification': specification.model_dump()},
                target={'strategy': 'css', 'value': specification.container}, bindings=[],
                preconditions=[{'kind': 'source_observation', 'evidenceRef': pre.id}],
                expectedEffect={'kind': 'read'}, postconditions=[{'kind': 'output_schema', 'schemaDigest': digest(specification.outputSchema)}],
                outputs=[{'schema': specification.outputSchema, 'sourceRef': clause.id}],
                proofRefs=[ref.model_dump() for ref in [action.resultRef, *pre.sourceRefs, *post.sourceRefs]]), []
