"""Typed field binding over fixed browser-native values and scalar conversions."""
import json
import math
from typing import Annotated, Literal

from jsonschema import Draft202012Validator
from jsonschema import ValidationError as JsonSchemaValidationError
from pydantic import Field, JsonValue, model_serializer, model_validator

from .evidence import Contract, digest, gap
from .rendered_field_text import FieldReadError, replace_shadow_text
from .semantic import bounded_schema
from .targets import TargetResolver
from .visible_text import normalize_presentation_text


class ReadField(Contract):
    selector: str = Field(min_length=1, max_length=2000)
    attribute: str | None = Field(default=None, pattern=r'^[a-zA-Z][a-zA-Z0-9_-]*$')
    optionalAttribute: bool = False
    resolveUrl: bool = False
    textSource: Literal['rendered', 'textContent'] = 'rendered'
    valueType: Literal['string', 'number', 'integer', 'boolean'] = 'string'
    textPrefix: str | None = Field(default=None, min_length=1, max_length=100)
    textSuffix: str | None = Field(default=None, min_length=1, max_length=100)
    normalizeWhitespace: bool = False
    normalizePresentation: bool = False
    multiple: bool = False
    maxValues: int = Field(default=1, gt=0, le=300)

    @model_validator(mode='after')
    def bounded_cardinality(self):
        if self.optionalAttribute and (self.attribute is None or self.multiple):
            raise ValueError('optional_attribute_requires_single_attribute')
        if not self.multiple and self.maxValues != 1:
            raise ValueError('single_field_cardinality_required')
        if self.resolveUrl and self.attribute not in ('href', 'src'):
            raise ValueError('url_resolution_requires_link_attribute')
        if self.textSource != 'rendered' and self.attribute is not None:
            raise ValueError('text_source_requires_text_field')
        if (self.textPrefix is not None or self.textSuffix is not None) \
                and (self.valueType not in ('string', 'number', 'integer') or self.attribute is not None):
            raise ValueError('text_affix_projection_invalid')
        if self.normalizePresentation and (
                self.valueType != 'string' or self.attribute is not None or not self.normalizeWhitespace):
            raise ValueError('presentation_normalization_invalid')
        return self

    @model_serializer(mode='wrap')
    def preserve_single_value_digest(self, serialize):
        # WHY：扩展多值读取不能改变原有单值 ReadSpec 的字节摘要，破坏既存字段证据。
        value = serialize(self)
        if not self.optionalAttribute:
            value.pop('optionalAttribute', None)
        if not self.multiple:
            value.pop('multiple', None)
        if not self.resolveUrl:
            value.pop('resolveUrl', None)
        if self.textSource == 'rendered':
            value.pop('textSource', None)
        if self.maxValues == 1:
            value.pop('maxValues', None)
        if self.textPrefix is None:
            value.pop('textPrefix', None)
        if self.textSuffix is None:
            value.pop('textSuffix', None)
        if not self.normalizeWhitespace:
            value.pop('normalizeWhitespace', None)
        if not self.normalizePresentation:
            value.pop('normalizePresentation', None)
        return value


class ReadSampleCoverage(Contract):
    scope: Literal['current_dom_matches'] = 'current_dom_matches'
    total: int = Field(ge=0)
    sampled: int = Field(ge=0)
    sampleLimit: int = Field(gt=0, le=300)
    runtimeTruncated: bool


class ReadSpec(Contract):
    container: str = Field(min_length=1, max_length=2000)
    fields: dict[str, ReadField] = Field(min_length=1, max_length=100)
    maxItems: int = Field(gt=0, le=300)
    includeOrdinal: bool = False
    requireComplete: bool = False
    maxInputBytes: int | None = Field(default=None, gt=0)
    outputSchema: dict[str, JsonValue]

    @model_validator(mode='after')
    def ordinal_is_host_owned(self):
        if self.includeOrdinal and 'ordinal' in self.fields:
            raise ValueError('read_ordinal_field_reserved')
        return self

    @model_serializer(mode='wrap')
    def preserve_explicit_budget_digest(self, serialize):
        # WHY：缺省表示调用方未另设字节预算；旧调用方显式预算的 canonical bytes 必须保持不变。
        value = serialize(self)
        if not self.includeOrdinal:
            value.pop('includeOrdinal', None)
        if not self.requireComplete:
            value.pop('requireComplete', None)
        if self.maxInputBytes is None:
            value.pop('maxInputBytes', None)
        return value


FIELD_PROJECTION_SCRIPT = """(fields) => {
  const projected = Object.create(null);
  for (const field of fields) {
    const name = field.name;
    const limit = field.sampleLimit ?? (field.multiple ? field.maxValues + 1 : 2);
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
      ...(field.sampleLimit === undefined ? {} : {totalMatches: selected.length + (selfMatched ? 1 : 0)}),
      values: matches.slice(0, limit).map((node) => {
        if (field.resolveUrl) {
          const resolved = node[field.attribute];
          return {value: typeof resolved === 'string' && resolved !== ''
            ? resolved : node.getAttribute(field.attribute), hasShadow: false};
        }
        if (field.attribute) return {value: node.getAttribute(field.attribute), hasShadow: false};
        if (field.textSource === 'textContent') {
          return {value: (node.textContent || '').trim(), hasShadow: false};
        }
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


ReadPaths = list[Annotated[list[str | Annotated[int, Field(strict=True, ge=0)]], Field(min_length=1)]]


def assert_read_paths(output, paths):
    """WHY：运行绑定需要哪一个值就检查哪一个值，不要求其它行具有同样的可选字段。"""
    for path in paths:
        value = output
        for key in path:
            present = (isinstance(value, list) and isinstance(key, int) and 0 <= key < len(value)
                       or isinstance(value, dict) and isinstance(key, str) and key in value)
            if not present:
                raise FieldReadError('read_output_schema_mismatch', reason='projected_output_invalid')
            value = value[key]


async def read_fields(browser, specification: ReadSpec, *, scope=None, page=None, required_paths=()):
    resolver = TargetResolver(browser)
    target_id = None
    if page is not None:
        info = await page.get_target_info()
        target_id = info.get('targetId') if isinstance(info, dict) else None
        if not isinstance(target_id, str) or not target_id:
            raise ValueError('page_identity_unavailable')
        scope = scope if scope is not None else {'url': await page.get_url()}
    if scope is not None:
        try:
            target_id = await resolver.assert_scope(scope, target_id)
        except Exception as error:
            # WHY：页面身份读取失败不能被报告为字段投影失败；保留原异常交给 owner 安全投影。
            error.add_note('bat_read_scope_pre')
            raise
    try:
        elements = await resolver.resolve_collection(specification.container, scope, page=page)
    except RuntimeError as error:
        if ('bat_read_collection_query' not in getattr(error, '__notes__', ())
                or 'DOM Error while querying' not in str(error)):
            raise
        # WHY：公开集合查询只证明容器无法定位，不能把 CDP 的泛化错误猜成 CSS 语法错误。
        raise FieldReadError('read_container_resolution_failed', field_name='container',
                             reason='container_not_resolved') from error
    # WHY：列表容器应描述完整稳定集合；输出合同的 maxItems 负责确定性选择 DOM 顺序前缀，
    # 不应把“前 N 条”再次推给模型编码成依赖页面包装层的 nth-child selector。
    if (specification.includeOrdinal or specification.requireComplete) and len(elements) > specification.maxItems:
        # WHY：动态选择必须读取完整集合；截断会把“已读末项”误当成真实末项。
        raise FieldReadError('read_collection_limit', field_name='container',
                             match_count=len(elements), reason='complete_collection_required')
    elements = elements[:specification.maxItems]
    output = await project_field_records(browser, specification, elements)
    if specification.outputSchema.get('type') == 'object':
        if specification.maxItems != 1 or len(output) != 1:
            raise FieldReadError('read_single_object_required', field_name='container',
                                 match_count=len(output), reason='expected_exactly_one_record')
        output = output[0]
    try:
        Draft202012Validator(specification.outputSchema).validate(output)
    except JsonSchemaValidationError as error:
        # WHY：字段类型/长度等投影结果不符合合同是可修复的 selector 结果，不应折叠成未知工具失败。
        raise FieldReadError('read_output_schema_mismatch', reason='projected_output_invalid') from error
    assert_read_paths(output, required_paths)
    if scope is not None:
        try:
            await resolver.assert_scope(scope, target_id)
        except Exception as error:
            error.add_note('bat_read_scope_post')
            raise
    return output


async def project_field_records(browser, specification: ReadSpec, elements, *, field_samples=None):
    """Share field projection without changing the caller-owned collection boundary."""
    output, consumed, native_context = [], 0, {}
    for ordinal, element in enumerate(elements, start=1):
        fragments = await project_fields(browser, element, specification.fields, native_context,
                                         field_samples=field_samples)
        consumed += sum(len(value.encode()) for values in fragments.values()
                        for value in values if isinstance(value, str))
        if specification.maxInputBytes is not None and consumed > specification.maxInputBytes:
            raise ValueError('read_input_limit')
        record = {name: read_projected_field(name, fragments.get(name), field)
                  for name, field in specification.fields.items()
                  if not (field.optionalAttribute and fragments.get(name) == [None])}
        if specification.includeOrdinal:
            # WHY：纯函数筛选/排序后仍返回原集合身份，不能将过滤后下标当成 DOM ordinal。
            record['ordinal'] = ordinal
        output.append(record)
    return output


async def project_fields(browser, element, fields, native_context, *, field_samples=None):
    projection = [{'name': name, 'selector': field.selector, 'multiple': field.multiple,
                   'maxValues': field.maxValues, 'attribute': field.attribute,
                   'resolveUrl': field.resolveUrl, 'textSource': field.textSource}
                  for name, field in fields.items()]
    # WHY：采样只限制宿主本次投影，不改写正式 ReadSpec 或把业务值全部取回后再截取。
    if field_samples is not None:
        for field in projection:
            if field['name'] in field_samples:
                field['sampleLimit'] = field_samples[field['name']]['limit']
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
    if any(not _projected_values_valid(value, sampling=field_samples is not None and name in field_samples)
           for name, value in result.items()):
        raise ValueError('read_field_projection_invalid')
    if field_samples is not None:
        for name, sample in field_samples.items():
            total = result[name]['totalMatches']
            if len(result[name]['values']) != min(total, sample['limit']):
                raise ValueError('read_field_projection_invalid')
            sample['total'] = total
    result = await replace_shadow_text(browser, element, projection, result, native_context)
    return {name: [item['value'] for item in value['values']] for name, value in result.items()}


def _projected_values_valid(value, *, sampling=False):
    keys = {'selfMatched', 'values', 'totalMatches'} if sampling else {'selfMatched', 'values'}
    return (isinstance(value, dict) and set(value) == keys
            and (not sampling or type(value['totalMatches']) is int and value['totalMatches'] >= 0)
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
    if field.normalizeWhitespace:
        value = ' '.join(value.split())
    if field.normalizePresentation:
        value = normalize_presentation_text(value)
    if field.textPrefix is not None:
        if not value.startswith(field.textPrefix):
            raise FieldReadError('read_text_affix_invalid', field_name=name, match_count=1,
                                 reason='text_prefix_mismatch')
        value = value[len(field.textPrefix):]
    if field.textSuffix is not None:
        if not value.endswith(field.textSuffix):
            raise FieldReadError('read_text_affix_invalid', field_name=name, match_count=1,
                                 reason='text_suffix_mismatch')
        value = value[:-len(field.textSuffix)]
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
