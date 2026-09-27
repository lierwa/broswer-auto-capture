"""Adapt a model-selected DOM read method to the existing deterministic ReadSpec."""
import copy
import json

from browser_use.agent.views import ActionResult
from browser_use.browser.session import BrowserSession
from jsonschema import Draft202012Validator
from pydantic import Field, create_model, model_serializer, model_validator

from .evidence import Contract
from .field_read_params import FieldReadMapping, _expanded_field, _read_shape
from .natural_reads import NaturalReadFailure, schema_at_path, value_at_path
from .read import ReadField
from .read_sampling import ReadSample, sample_read_fields
from .rendered_field_text import FieldReadError


# WHY：字段类型与多值形状只有最终合同一个事实源；复用投影配置，避免默认值经持久化变成模型声明。
MethodReadField = create_model('MethodReadField', __base__=Contract, **{
    name: (field.annotation, copy.deepcopy(field))
    for name, field in ReadField.model_fields.items()
    if name not in {'valueType', 'multiple', 'maxValues'}
})


class MethodReadToolParams(Contract):
    readRef: str | None = Field(default=None, pattern=r'^r[1-9][0-9]*$', description=(
        'Reuse a successful method from this session. Supply only readRef, with no other parameters.'))
    outputPath: list[str | int] | None = Field(default=None, max_length=40, description=(
        'A real location in the confirmed output contract.'))
    container: str | None = Field(default=None, min_length=1, max_length=2000, description=(
        'Reusable CSS selector for records in the current page.'))
    fields: dict[str, MethodReadField] | None = Field(default=None, min_length=1, max_length=100, description=(
        'Relative DOM field projections. Types and cardinality come from the output contract.'))
    maxItems: int = Field(default=300, ge=1, le=300, description=(
        'Maximum current-page records allowed in one runtime read, not the final collection count.'))

    @model_validator(mode='before')
    @classmethod
    def exclusive_method_or_reference(cls, value):
        if not isinstance(value, dict):
            return value
        if 'readRef' in value:
            if set(value) != {'readRef'} or not isinstance(value['readRef'], str):
                raise ValueError('method_read_reference_parameters_mixed')
        elif any(value.get(name) is None for name in ('outputPath', 'container', 'fields')):
            raise ValueError('method_read_definition_required')
        return value

    @model_serializer(mode='wrap')
    def serialize_method_or_reference(self, handler):
        # WHY：引用是互斥参数形态；默认字段不得在原生 action 历史中伪装成覆盖参数。
        return {'readRef': self.readRef} if self.readRef is not None else {
            key: value for key, value in handler(self).items() if key != 'readRef'}


ROOT_ARRAY_PATH_GUIDANCE = (
    'The confirmed business output is a root array. Read the record list with outputPath=[]. '
    'Do not use outputPath=["value"] or ["value",0]: value is the structured-response wrapper, '
    'not a location in this business output contract. Put record property names in fields.')


def method_read_params_for(output_schema):
    if output_schema.get('type') != 'array':
        return MethodReadToolParams
    # WHY：响应模型的 value 包装不属于业务合同；只明确根路径，禁止自动改写模型提交的路径。
    return create_model('RootArrayMethodReadToolParams', __base__=MethodReadToolParams,
        outputPath=(list[str | int] | None, Field(default=None, max_length=40,
            description=ROOT_ARRAY_PATH_GUIDANCE, examples=[[]])))


class MethodReadRecord(Contract):
    readRef: str = Field(pattern=r'^r[1-9][0-9]*$')
    parameters: MethodReadToolParams
    mapping: FieldReadMapping
    sample: ReadSample


class MethodReadRecords:
    def __init__(self, output_schema=None):
        self.records: list[MethodReadRecord] = []
        self.output_schema = copy.deepcopy(output_schema)
        self._owned_records = {}
        self.feedback_provider = None

    @property
    def output_paths(self):
        return [record.mapping.outputPath for record in self.records]

    def append_verified(self, record):
        self.records.append(record)
        self._owned_records[record.readRef] = record

    def resolve(self, params, *, before=None):
        if params.readRef is None:
            return params.model_copy(deep=True), expand_method_read_params(params, self.output_schema)
        candidates = [record for record in self.records[:before] if record.readRef == params.readRef]
        # WHY：只能复用本工具实际成功登记的记录；复制另一个 owner 的列表不能转移方法所有权。
        if len(candidates) != 1 or self._owned_records.get(params.readRef) is not candidates[0]:
            raise NaturalReadFailure('method_read_reference_missing')
        record = candidates[0]
        return record.parameters.model_copy(deep=True), record.mapping.model_copy(deep=True)

    def feedback(self, params, record):
        if not isinstance(value_at_path(record.sample.output, record.mapping.readPath), list):
            return None
        value = {'repeatGuidance': (
            'If the task repeats this collection, establish a complete continuation query after this read. '
            'For click, the queried control must be enabled and visible, including its ancestors. '
            'For scroll, the query is a condition, not a click target: an observed end marker may be hidden while '
            'more results remain and shown only at completion. Query that marker in its nonterminal state; '
            'do not exclude it merely because it is hidden. Require its existence and observed state semantics. '
            'Runtime uses ONLY query match count, never interprets returned attributes: encode the nonterminal '
            'state in the CSS selector itself. A bare marker selector cannot stop when its attributes change. '
            'After advancing and reusing readRef, repeat its exact selector, attributes, include_text and max_results. '
            'Historical queries below are candidates, not certified continuation or stopping rules. '
            'Choose using page evidence; this representative sample does not prove task completion.')}
        if params.readRef is not None and self.feedback_provider is not None:
            candidates = self.feedback_provider(params.readRef)
            if candidates:
                value['historicalQueries'] = candidates
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def expand_method_read_params(params: MethodReadToolParams, output_schema):
    """Derive one runtime method from the selected output-contract shape."""
    if params.readRef is not None:
        raise NaturalReadFailure('method_read_reference_owner_required')
    try:
        target = schema_at_path(output_schema, params.outputPath)
    except Exception as error:
        raise NaturalReadFailure('natural_read_output_path_invalid') from error
    # WHY：业务全集可能跨页；方法预算只约束当前页，不能继承最终总数或把样本数量写成执行上限。
    if target.get('type') == 'array':
        target = {'type': 'array', 'items': target.get('items'), 'minItems': 0, 'maxItems': params.maxItems}
    schema, properties, required, maximum, read_path = _read_shape(target)
    if not set(params.fields) <= set(properties) or not required <= set(params.fields):
        raise NaturalReadFailure('natural_read_schema_mismatch')
    fields = {name: _expanded_field(field.model_dump(mode='json'), properties[name])
              for name, field in params.fields.items()}
    return FieldReadMapping.model_validate({
        'specification': {'container': params.container, 'fields': fields, 'maxItems': maximum,
                          'requireComplete': True, 'maxInputBytes': 128000, 'outputSchema': schema},
        'outputPath': params.outputPath, 'readPath': read_path,
    })


def register_method_read_tool(tools, *, output_schema):
    Draft202012Validator.check_schema(output_schema)
    successful = MethodReadRecords(output_schema)

    @tools.action(
        'Describe and verify a reusable DOM field-reading method for one real output-contract path. '
        'Provide a CSS record container and relative field projections; types come from the output contract. '
        'Fields read visible text by default. Use attribute only for an attribute observed on the page. '
        'Use :scope to read the container itself; . is not a CSS selector. '
        'Object targets use contract field names, scalar targets use value. maxItems is a current-page runtime '
        'budget, not the final collection count. The host returns a readRef and at most three representative '
        'records with current DOM coverage; these samples do not prove the complete business collection. '
        'To read the same method on another page, supply only {"readRef":"r1"} using its successful '
        'reference; never repeat or override its fields, container, outputPath or maxItems. '
        'The host preserves the exact method and returns a new readRef for the new sample. '
        'Select the intended readRef when finishing. '
        + (ROOT_ARRAY_PATH_GUIDANCE if output_schema.get('type') == 'array' else ''),
        param_model=method_read_params_for(output_schema),
    )
    async def bat_read_fields(params: MethodReadToolParams, browser_session: BrowserSession) -> ActionResult:
        field_names = params.fields or {}
        try:
            expanded, mapping = successful.resolve(params)
            field_names = expanded.fields
            sample = await sample_read_fields(browser_session, mapping.specification, sample_limit=3,
                                             read_path=mapping.readPath)
            # WHY：空匹配不能验证字段投影；先拒绝，避免登记一个无法被编译的成功 readRef。
            if sample.coverage.sampled == 0:
                raise NaturalReadFailure('read_sample_empty_unproven')
            record = MethodReadRecord(readRef='r' + str(len(successful.records) + 1),
                parameters=expanded, mapping=mapping, sample=sample)
            content = json.dumps(method_read_model_result(record), ensure_ascii=False,
                                 separators=(',', ':'), allow_nan=False)
            feedback = successful.feedback(params, record)
        except Exception as error:
            message = _safe_read_error(error, field_names)
            if message == 'natural_read_output_path_invalid' and output_schema.get('type') == 'array':
                message += ': ' + ROOT_ARRAY_PATH_GUIDANCE
            return ActionResult(error=message)
        successful.append_verified(record)
        # WHY：读取证据精确校验 extracted_content；沿用原生记忆通道提供提示，不改样本合同。
        return ActionResult(extracted_content=content,
                            long_term_memory=content + '\n' + feedback if feedback else None)

    return successful


def method_read_model_result(record: MethodReadRecord):
    """Show representative values; keep identity, digests and document proof in the host record."""
    sample = record.sample
    return {
        'readRef': record.readRef, 'outputPath': record.mapping.outputPath,
        'representative': value_at_path(sample.output, record.mapping.readPath),
        'coverage': {'scope': sample.coverage.scope, 'total': sample.coverage.total,
                     'sampled': sample.coverage.sampled},
        'coverageNote': 'Current DOM matches only; this does not prove the full business collection.',
    }


_READ_ERRORS = frozenset({
    'method_read_reference_missing', 'method_read_reference_owner_required',
    'natural_read_output_path_invalid', 'natural_read_schema_mismatch', 'natural_read_schema_unsupported',
    'natural_read_page_identity_changed', 'natural_read_container_identity_changed',
    'natural_read_output_changed', 'read_collection_limit', 'read_sample_limit_invalid',
    'read_sample_empty_unproven', 'read_sample_method_changed', 'read_sample_document_identity_unavailable',
    'read_sample_document_changed', 'read_sample_schema_unsupported', 'read_single_object_required',
    'read_output_schema_mismatch', 'ambiguous_or_missing_read_field', 'read_boolean_invalid',
    'read_field_not_text', 'read_field_projection_failed', 'read_field_projection_invalid',
    'read_field_value_limit', 'read_field_native_projection_failed', 'read_container_resolution_failed',
    'read_input_limit', 'read_number_not_finite', 'read_text_affix_invalid',
})


_READ_ERROR_REASONS = frozenset({
    'complete_collection_required', 'container_not_resolved', 'exceeded_max_values',
    'expected_exactly_one_match', 'expected_exactly_one_record', 'invalid_boolean_text',
    'invalid_selector', 'projected_output_invalid', 'selected_value_not_text',
    'text_prefix_mismatch', 'text_suffix_mismatch', 'container_identity_unavailable',
    'container_mapping_failed', 'field_identity_ambiguous', 'page_identity_changed',
    'page_unavailable', 'selector_mapping_changed',
})


def _safe_read_error(error, field_names):
    code = str(error)
    if code not in _READ_ERRORS:
        return 'bat_read_fields_failed'
    if not isinstance(error, FieldReadError):
        return code
    # WHY：模型需要定位失败投影；只返回合同字段和固定原因，禁止拼接异常正文或 selector。
    detail = {}
    if isinstance(error.field_name, str) and error.field_name in field_names:
        detail['field_name'] = error.field_name
    if type(error.match_count) is int and error.match_count >= 0:
        detail['match_count'] = error.match_count
    if isinstance(error.reason, str) and error.reason in _READ_ERROR_REASONS:
        detail['reason'] = error.reason
    return code + ': ' + json.dumps(detail, ensure_ascii=False, separators=(',', ':')) if detail else code
