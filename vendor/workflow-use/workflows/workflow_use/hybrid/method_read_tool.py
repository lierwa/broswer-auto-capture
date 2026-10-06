"""Adapt a model-selected DOM read method to the existing deterministic ReadSpec."""
import copy
import json
import traceback
import sys
from pathlib import Path

from browser_use.agent.views import ActionResult
from browser_use.browser.session import BrowserSession
from jsonschema import Draft202012Validator
from pydantic import Field, PositiveInt, ValidationError, create_model, model_serializer, model_validator
from pydantic.json_schema import SkipJsonSchema
from typing import Literal

from .evidence import Contract
from .field_read_params import FieldReadMapping, _expanded_field, _read_shape, bind_root_read_path
from .field_read_params import LEGACY_ROOT_ARRAY_PATH_GUIDANCE
from .natural_reads import NaturalReadFailure, schema_at_path, value_at_path
from .read import ReadField
from .read_sampling import ReadSample, sample_read_fields
from .rendered_field_text import FieldReadError
from .page_content import CONTENT_SCHEMA, CONTENT_LIMIT, SAFE_CONTENT_FAILURE_CODES, content_schema, content_summary
from .element_entry import entry_field
from .entry_selection import EntryObservation, EntrySelection, assert_entry_sample, capture_entry_indices, select_entry_container
from .content_read_params import ContentReadToolParams

# WHY：字段类型与多值形状只有最终合同一个事实源；复用投影配置，避免默认值经持久化变成模型声明。
MethodReadField = create_model('MethodReadField', __base__=Contract, **{
    name: (field.annotation, copy.deepcopy(field))
    for name, field in ReadField.model_fields.items()
    if name not in {'valueType', 'multiple', 'maxValues', 'allowMissing', 'contentSource'}
})

class MethodReadToolParams(Contract):
    captureContent: bool = False
    readRef: str | None = Field(default=None, pattern=r'^r[1-9][0-9]*$', description=(
        'Reuse a successful method from this session. Supply only readRef, with no other parameters.'))
    outputPath: list[str | int] | None = Field(default=None, max_length=40, description=(
        'A real location in the confirmed output contract.'))
    container: str | None = Field(default=None, min_length=1, max_length=2000, description=(
        'Reusable CSS selector for records in the current page.'))
    regions: str | None = Field(default=None, min_length=1, max_length=2000)
    regionMode: Literal['selected-regions'] | None = None
    indices: list[PositiveInt] | None = Field(default=None, min_length=1, max_length=300)
    fields: dict[str, MethodReadField] | None = Field(default=None, min_length=1, max_length=100, description=(
        'Relative DOM field projections. Types and cardinality come from the output contract.'))
    maxItems: int = Field(default=300, ge=1, le=300, description=(
        'Maximum current-page records allowed in one runtime read, not the final collection count.'))
    take: int | None = Field(default=None, ge=1, le=300, description=(
        'Select the first N records in the observed DOM order only when required by the confirmed task. '
        'This is a business selection, independent of the host page budget.'))

    @model_validator(mode='before')
    @classmethod
    def exclusive_method_or_reference(cls, value):
        if not isinstance(value, dict):
            return value
        if value.get('regionMode') is not None and value.get('regions') is None:
            raise ValueError('method_read_region_mode_requires_regions')
        if 'readRef' in value:
            if set(value) != {'readRef'} or not isinstance(value['readRef'], str):
                raise ValueError('method_read_reference_parameters_mixed')
        elif any(name in value for name in ('container', 'indices', 'regions')) and set(value) <= {'container', 'indices', 'regions', 'take', 'regionMode'}:
            if 'regions' in value and set(value) - {'regions', 'regionMode'}:
                raise ValueError('method_read_reference_parameters_mixed')
            return {**value, 'captureContent': True}
        elif value.get('captureContent') is not True and any(value.get(name) is None for name in ('outputPath', 'container', 'fields')):
            raise ValueError('method_read_definition_required')
        return value

    @model_serializer(mode='wrap')
    def serialize_method_or_reference(self, handler):
        # WHY：引用是互斥参数形态；默认字段不得在原生 action 历史中伪装成覆盖参数。
        if self.readRef is not None:
            return {'readRef': self.readRef}
        if self.captureContent:
            if self.regions is not None:
                return {'regions': self.regions, **({'regionMode': self.regionMode} if self.regionMode else {})}
            return {**({'indices': self.indices} if self.indices is not None else {'container': self.container}),
                    **({'take': self.take} if self.take is not None else {})}
        return {key: value for key, value in handler(self).items()
                if key not in {'readRef', 'captureContent'} and (key not in {'take', 'indices', 'regions', 'regionMode'} or value is not None)}

class EntryReadToolParams(Contract):
    container: str | None = Field(default=None, min_length=1, max_length=2000)
    indices: list[PositiveInt] | None = Field(default=None, min_length=1, max_length=300,
        description='Current native browser indices of the selected clickable entries in DOM order. The host derives the reusable selector.')
    take: int | None = Field(default=None, ge=1, le=300)
    readRef: str | None = Field(default=None, pattern=r'^r[1-9][0-9]*$')

    @model_validator(mode='after')
    def one_method(self):
        if sum(item is not None for item in (self.container, self.indices, self.readRef)) != 1 \
                or self.readRef is not None and self.take is not None:
            raise ValueError('method_read_container_or_reference_required')
        return self

    @model_serializer(mode='wrap')
    def omit_absent(self, handler):
        return {key: value for key, value in handler(self).items() if value is not None}

class AuthorMethodReadToolParams(MethodReadToolParams):
    # WHY：模型只决定业务选择，300 项技术预算由宿主持有；旧来源的显式预算仍可解析和离线校验。
    maxItems: SkipJsonSchema[Literal[300]] = Field(default=300, exclude=True)
    indices: SkipJsonSchema[Literal[None]] = Field(default=None, exclude=True)
    regions: SkipJsonSchema[Literal[None]] = Field(default=None, exclude=True)
    regionMode: SkipJsonSchema[Literal[None]] = Field(default=None, exclude=True)

ROOT_ARRAY_PATH_GUIDANCE = ('The confirmed business output is a root array. The host binds its output path. '
    'Return only the record container and field projections, or reuse a readRef.')

class RootArrayMethodReadToolParams(AuthorMethodReadToolParams):
    outputPath: SkipJsonSchema[list[str | int] | None] = Field(default=None, max_length=40, exclude=True)

    @model_validator(mode='before')
    @classmethod
    def bind_root_path(cls, value):
        if not isinstance(value, dict) or 'readRef' in value:
            return value
        # WHY：根数组的固定路径来自确认合同；旧显式错误仍拒绝，不能默默修正来源证据。
        if value.get('outputPath') not in (None, []):
            raise ValueError('root_array_output_path_invalid')
        return {**value, 'outputPath': []} if 'fields' in value else value

def method_read_params_for(output_schema, legacy_model_fields=False):
    if output_schema.get('type') != 'array':
        return AuthorMethodReadToolParams
    if legacy_model_fields:
        return create_model('RootArrayMethodReadToolParams', __base__=AuthorMethodReadToolParams,
            outputPath=(list[str | int] | None, Field(default=None, max_length=40,
                description=LEGACY_ROOT_ARRAY_PATH_GUIDANCE, examples=[[]])))
    return RootArrayMethodReadToolParams

class MethodReadRecord(Contract):
    readRef: str = Field(pattern=r'^r[1-9][0-9]*$')
    parameters: MethodReadToolParams
    mapping: FieldReadMapping
    sample: ReadSample
    selection: EntrySelection | None = None

class MethodReadRecords:
    def __init__(self, output_schema=None, *, capture_content=False):
        self.records: list[MethodReadRecord] = []
        self.output_schema = copy.deepcopy(output_schema)
        self.capture_content = capture_content
        self._owned_records = {}
        self.feedback_provider = None
        self._entry_observation = None

    def bind_entry_observation(self, summary=None, indices=None, target_id=None):
        self._entry_observation = None
        if indices is not None:
            try:
                self._entry_observation = capture_entry_indices(summary, indices, target_id)
            except ValueError as error:
                self._entry_observation = str(error)

    def consume_entry_observation(self, indices):
        observation, self._entry_observation = self._entry_observation, None
        if isinstance(observation, str):
            raise ValueError(observation)
        if not isinstance(observation, EntryObservation) or observation.indices != tuple(indices):
            raise ValueError('native_entry_observation_unavailable')
        return observation

    @property
    def output_paths(self):
        return [record.mapping.outputPath for record in self.records]

    def append_verified(self, record):
        self.records.append(record)
        self._owned_records[record.readRef] = record

    def resolve(self, params, *, before=None, selection=None):
        if params.captureContent and not self.capture_content and entry_field(self.output_schema) is None:
            raise NaturalReadFailure('natural_read_schema_mismatch')
        if params.readRef is None:
            inherited = getattr(self, 'input_value', None)
            schema = getattr(self, 'input_schema', None)
            names = list(schema.get('properties', {})) if isinstance(schema, dict) and schema.get('type') == 'object' else []
            raw_parameters = bind_root_read_path(params.model_dump(mode='json'), self.output_schema)
            parameters = MethodReadToolParams.model_validate(raw_parameters)
            mapping_params = parameters
            if parameters.indices is not None:
                if not isinstance(selection, EntrySelection) or selection.indices != parameters.indices \
                        or entry_field(self.output_schema) is None:
                    raise NaturalReadFailure('native_entry_selector_unavailable')
                mapping_params = parameters.model_copy(update={'indices': None, 'container': selection.container})
            return parameters, expand_method_read_params(mapping_params, self.output_schema,
                inherit_fields=names, input_schema=schema)
        candidates = [record for record in self.records[:before] if record.readRef == params.readRef]
        # WHY：只能复用本工具实际成功登记的记录；复制另一个 owner 的列表不能转移方法所有权。
        if len(candidates) != 1 or self._owned_records.get(params.readRef) is not candidates[0]:
            raise NaturalReadFailure('method_read_reference_missing')
        record = candidates[0]
        return record.parameters.model_copy(deep=True), record.mapping.model_copy(deep=True)

    def feedback(self, params, record, *, observation=None):
        if any(field.contentSource for field in record.mapping.specification.fields.values()):
            # WHY：完整采集仅证明所选区域的字节，不能替模型断言选对了业务范围。
            return json.dumps({'contentScopeGuidance': (
                'coverage.complete verifies capture of the selected region only, not that its scope satisfies the task. '
                'Review textPreview and current page evidence against the confirmed requirement. '
                'Include all requested related text, tables and images in one reusable region; '
                'an image-only subregion does not include configuration text in its siblings. '
                'Correct the scope with the existing tools before finishing if necessary. '
                f'This successful method is {record.readRef}; if it supplies the confirmed result, '
                f'finish using readRefs=["{record.readRef}"]. Earlier exploratory reads remain audit evidence. '
                'Capture raw content; do not extract individual business fields or clean the data.')})
        if record.mapping.specification.entryField is not None:
            # WHY：来源只验证入口读取方法；首/尾样本不能被误解成漏掉中间输入。
            entries = value_at_path(record.sample.output, record.mapping.readPath)
            backends = {entry[record.mapping.specification.entryField]['backendNodeId']
                        for entry in entries} if isinstance(entries, list) else set()
            selection = getattr(record, 'selection', None)
            if selection and selection.selectedBackendNodeIds is not None:
                backends = {leaf for leaf, root in zip(selection.selectedBackendNodeIds,
                    selection.backendNodeIds, strict=True) if root in backends}
            previews = [{'index': preview.index, 'tag': preview.tag, 'name': preview.name,
                         'destinationOrigin': preview.destination_origin}
                        for preview in observation.previews if preview.backend in backends] \
                if isinstance(observation, EntryObservation) else []
            return json.dumps({'sourceMethodGuidance': (
                f'The DOM reading method is verified for {record.sample.coverage.total} selected current-DOM entries. '
                'This technical proof does not establish that they are the intended business entries. '
                'Review the native entry previews and current page evidence; clickable controls may lead to unrelated workflows. '
                'If the selection is wrong, correct it with the existing tools before finishing this source step. '
                f'The {record.sample.coverage.sampled} representative records verify the method, not a partial selection. '
                'Middle ordinals omitted from this sample are not missing entries. Re-reading still returns a bounded sample. '
                'The ordinary runtime re-queries the complete selected range using this method. '
                'Entry activation and detail processing are verified by the next representative item step. '
                'If the observed source order and selection satisfy this source step, finish it with success=true and '
                f'readRefs=["{record.readRef}"]. Do not copy all values or enter details in this source step. '
                'This does not declare the full task or all detail content completed.'), 'entryPreviews': previews},
                ensure_ascii=False, separators=(',', ':'))
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

def expand_method_read_params(params: MethodReadToolParams, output_schema, *, inherit_fields=(), input_schema=None):
    """Derive one runtime method from the selected output-contract shape."""
    if params.readRef is not None:
        raise NaturalReadFailure('method_read_reference_owner_required')
    entry_name = entry_field(output_schema)
    if entry_name is not None and params.captureContent:
        if output_schema.get('type') != 'array' or params.container is None:
            raise NaturalReadFailure('natural_read_schema_mismatch')
        maximum = output_schema.get('maxItems', 300)
        if params.take is not None and params.take > maximum:
            raise NaturalReadFailure('natural_read_schema_mismatch')
        inherited = [name for name in inherit_fields if name in output_schema['items']['properties']]
        return FieldReadMapping.model_validate({'specification': {'container': params.container,
            'fields': {}, 'entryField': entry_name, 'keyField': '__batRecordKey', 'inheritFields': inherited,
            'maxItems': 300, 'requireComplete': True, 'maxInputBytes': 128000,
            'outputSchema': {**output_schema, 'minItems': 0, 'maxItems': params.take or maximum},
            'take': params.take or maximum}, 'outputPath': [], 'readPath': []})
    if params.captureContent:
        container = params.regions or params.container
        if not content_schema(output_schema) or container is None:
            raise NaturalReadFailure('natural_read_schema_mismatch')
        return FieldReadMapping.model_validate({'specification': {'container': container,
            **({'contentRegion': params.regionMode or 'common-ancestor'} if params.regions is not None else {}),
            'fields': {'content': {'selector': ':scope', 'attribute': None, 'valueType': 'string',
                                   'contentSource': 'page-content'}},
            'maxItems': 1, 'requireComplete': True, 'maxInputBytes': CONTENT_LIMIT * 2,
            'outputSchema': CONTENT_SCHEMA}, 'outputPath': [], 'readPath': []})
    try:
        target = schema_at_path(output_schema, params.outputPath)
    except Exception as error:
        raise NaturalReadFailure('natural_read_output_path_invalid') from error
    if params.outputPath and output_schema.get('type') == 'object' \
            and params.outputPath[0] not in output_schema.get('required', []):
        raise NaturalReadFailure('natural_read_optional_object_required')
    # WHY：业务全集可能跨页；方法预算只约束当前页，不能继承最终总数或把样本数量写成执行上限。
    if target.get('type') == 'array':
        target = {'type': 'array', 'items': target.get('items'), 'minItems': 0, 'maxItems': params.maxItems}
    schema, properties, required, maximum, read_path = _read_shape(target)
    inherited = [name for name in inherit_fields if not params.outputPath and target.get('type') in {'object', 'array'} and name in properties
                 and isinstance(input_schema, dict)
                 and input_schema.get('properties', {}).get(name) == properties[name]]
    # WHY：代表项拥有值不证明其他项必有；可选输入满足必填输出必须有已经验证的 DOM 后备。
    inherited = [name for name in inherited if name not in required or name in params.fields
                 or name in input_schema.get('required', [])]
    key_field = '__batRecordKey' if target.get('type') == 'array' and '__batRecordKey' in properties else None
    if key_field is not None:
        required = required - {key_field}
    if not set(params.fields) <= set(properties) or not required <= set(params.fields) | set(inherited) or key_field in params.fields:
        raise NaturalReadFailure('natural_read_schema_mismatch')
    fields = {name: _expanded_field(field.model_dump(mode='json'), properties[name])
              for name, field in params.fields.items()}
    for name, field in fields.items():
        if name in required and field.get('optionalAttribute'):
            raise NaturalReadFailure('natural_read_schema_mismatch')
        if name not in required:
            field['allowMissing'] = True
    if params.take is not None:
        if schema.get('type') != 'array' or params.take > maximum:
            raise NaturalReadFailure('natural_read_schema_mismatch')
        schema = {**schema, 'maxItems': params.take}
    return FieldReadMapping.model_validate({
        'specification': {'container': params.container, 'fields': fields, 'maxItems': maximum,
                          'requireComplete': True, 'maxInputBytes': 128000, 'outputSchema': schema,
                          **({'take': params.take} if params.take is not None else {}),
                          **({'inheritFields': inherited} if inherited else {}),
                          **({'keyField': key_field} if key_field is not None else {})},
        'outputPath': params.outputPath, 'readPath': read_path,
    })

def register_method_read_tool(tools, *, output_schema, capture_content=False, legacy_model_fields=False):
    Draft202012Validator.check_schema(output_schema)
    successful = MethodReadRecords(output_schema, capture_content=capture_content)

    @tools.action(
        ('Read actual clickable entries from the current ordered/filtered list. Prefer indices containing '
         'the native browser indices of the selected clickable titles/controls in DOM order; the host derives '
         'the reusable collection selector, so you need not know CSS. Alternatively supply an observed container '
         'CSS selector. Supply take '
         'only when the confirmed task selects the first N. Do not require href, do not declare output '
         'fields or read final business parameters. The host reads the complete collection and creates '
         'typed entries with actual tab, query and text identity. Leave the source list open and finish '
         'with this readRef; the next step processes one representative entry using the native actions.'
         if entry_field(output_schema) else
         'Capture the task-relevant raw page content. Supply regions selecting one or more observed related '
         'regions; only these regions and their descendants are saved, excluding unrelated siblings. '
         'You may omit regions to capture the whole current page body. Reuse a successful readRef alone. '
         'Do not declare business fields. '
         'Expand and load images first. The host saves raw HTML, Markdown and original image bytes; '
         'only a small content preview and coverage are returned to you. No data cleaning is performed.'
         if capture_content else
        'Describe and verify a reusable DOM field-reading method for one real output-contract path. '
        'Reuse current native observations for DOM projections; do not use remembered website CSS. '
        'For a field without observed DOM evidence, use native search_page on its visible text and '
        'find_elements on the returned paths, or find_elements directly for observed attributes. '
        'A combined query matching some fields does not verify the others. Missing or ambiguous matches '
        'need inspection of that field and scope on the current page, not leaving a valid detail page. '
        'page-url, inherited input and successful readRef reuse need no repeated DOM discovery. '
        'Provide a CSS record container and relative field projections; types come from the output contract. '
        'Fields read visible text by default. Use attribute only for an attribute observed on the page. '
        'After a real navigation, selector=:scope with valueSource=page-url reads the current document URL. '
        'This does not discover target URLs from a list or synthesize any URL. '
        'For object or root array results, use outputPath=[]; the host inherits same-named typed input '
        'fields into each record without page reads. Optional fields may be absent on later records; do not use scalar '
        'methods for them. Required output fields not guaranteed by input.required need real DOM fallback '
        'projections even when the representative input already has a value. The runtime prefers that '
        'item input and reads the fallback only if absent. '
        'Input entry links must be navigated directly, never replaced by fixed list clicks. '
        'Use :scope to read the container itself; . is not a CSS selector. '
        'Object targets use contract field names, scalar targets use value. maxItems is a current-page runtime '
        'budget, not the final collection count. The host returns a readRef and at most three representative '
        'records with current DOM coverage; these samples do not prove the complete business collection. '
        'To read the same method on another page, supply only {"readRef":"r1"} using its successful '
        'reference; never repeat or override its fields, container, outputPath or maxItems. '
        'The host preserves the exact method and returns a new readRef for the new sample. '
        'Select the intended readRef when finishing. '
        + ((LEGACY_ROOT_ARRAY_PATH_GUIDANCE if legacy_model_fields else ROOT_ARRAY_PATH_GUIDANCE)
           if output_schema.get('type') == 'array' else '')).replace(
               'For object or root array results, use outputPath=[];',
               'For object or root array results, use outputPath=[];' if legacy_model_fields else
               'For object results, use outputPath=[]; root array paths are host-bound.'),
        param_model=EntryReadToolParams if entry_field(output_schema) else
            ContentReadToolParams if capture_content else method_read_params_for(output_schema, legacy_model_fields),
    )
    async def bat_read_fields(params: MethodReadToolParams, browser_session: BrowserSession) -> ActionResult:
        params = MethodReadToolParams.model_validate(bind_root_read_path(params.model_dump(mode='json'), output_schema))
        field_names = params.fields or {}
        phase = 'entry_selection'
        try:
            observation = successful.consume_entry_observation(params.indices) if params.indices is not None else None
            selection = await select_entry_container(browser_session, params.indices,
                observation=observation) if params.indices is not None else None
            phase = 'mapping'
            expanded, mapping = successful.resolve(params, selection=selection)
            field_names = expanded.fields or {}
            phase = 'sample'
            sample = await sample_read_fields(browser_session, mapping.specification, sample_limit=3,
                                             read_path=mapping.readPath,
                                             **({'inherited': successful.input_value} if mapping.specification.inheritFields else {}))
            assert_entry_sample(selection, sample)
            # WHY：空匹配不能验证字段投影；先拒绝，避免登记一个无法被编译的成功 readRef。
            if sample.coverage.sampled == 0:
                raise NaturalReadFailure('read_sample_empty_unproven')
            phase = 'result'
            record = MethodReadRecord(readRef='r' + str(len(successful.records) + 1),
                parameters=expanded, mapping=mapping, sample=sample, selection=selection)
            content = json.dumps(method_read_model_result(record), ensure_ascii=False,
                                 separators=(',', ':'), allow_nan=False)
            phase = 'feedback'
            feedback = successful.feedback(params, record, observation=observation)
        except Exception as error:
            message = _safe_read_error(error, field_names, phase=phase)
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
        'representative': content_summary(sample.output) if any(field.contentSource for field in record.mapping.specification.fields.values())
            else value_at_path(sample.output, record.mapping.readPath),
        'coverage': {'scope': sample.coverage.scope, 'total': sample.coverage.total,
                     'sampled': sample.coverage.sampled},
        'coverageNote': 'Current DOM matches only; this does not prove the full business collection.',
    }

_READ_ERRORS = frozenset({
    'native_entry_indices_invalid', 'native_entry_selector_unavailable',
    'native_entry_observation_unavailable', 'native_entry_document_changed',
    'native_entry_dom_unavailable', 'native_entry_query_failed', 'native_entry_record_scope_unavailable',
    'content_page_missing', 'content_scope_requires_supported_observation', 'content_byte_limit',
    'content_image_not_loaded', 'content_image_resource_missing', 'content_image_resource_type_invalid',
    'content_page_identity_changed', 'content_scope_field_invalid',
    'natural_read_optional_object_required',
    'method_read_reference_missing', 'method_read_reference_owner_required',
    'natural_read_output_path_invalid', 'natural_read_schema_mismatch', 'natural_read_schema_unsupported',
    'natural_read_page_identity_changed', 'natural_read_container_identity_changed',
    'natural_read_output_changed', 'read_collection_limit', 'read_sample_limit_invalid',
    'read_sample_empty_unproven', 'read_sample_method_changed', 'read_sample_document_identity_unavailable',
    'read_sample_document_changed', 'read_sample_schema_unsupported', 'read_single_object_required',
    'read_output_schema_mismatch', 'ambiguous_or_missing_read_field', 'read_boolean_invalid',
    'read_field_not_text', 'read_field_projection_failed', 'read_field_projection_invalid',
    'read_field_value_limit', 'read_field_native_projection_failed', 'read_container_resolution_failed',
    'read_input_limit', 'read_number_not_finite', 'read_number_invalid', 'read_text_affix_invalid',
}) | SAFE_CONTENT_FAILURE_CODES

_READ_ERROR_REASONS = frozenset({
    'complete_collection_required', 'container_not_resolved', 'exceeded_max_values',
    'expected_exactly_one_match', 'expected_exactly_one_record', 'invalid_boolean_text', 'invalid_number_text',
    'invalid_selector', 'projected_output_invalid', 'selected_value_not_text',
    'text_prefix_mismatch', 'text_suffix_mismatch', 'container_identity_unavailable',
    'container_mapping_failed', 'field_identity_ambiguous', 'page_identity_changed',
    'page_unavailable', 'selector_mapping_changed',
    'image_scheme_http', 'image_scheme_https', 'image_scheme_blob', 'image_scheme_other',
})

def _safe_read_error(error, field_names, *, phase=None):
    code = str(error)
    if code not in _READ_ERRORS:
        phase_code = {'entry_selection': 'native_entry_selection_failed', 'mapping': 'method_read_mapping_failed',
                'sample': 'method_read_sample_failed', 'result': 'method_read_result_failed',
                'feedback': 'method_read_feedback_failed'}.get(phase)
        return phase_code + ': ' + json.dumps(_safe_failure_detail(error), separators=(',', ':')) \
            if phase_code else 'bat_read_fields_failed'
    if not isinstance(error, FieldReadError):
        if code == 'native_entry_record_scope_unavailable':
            return code + ': ' + json.dumps(_safe_failure_detail(error), separators=(',', ':'))
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

def _safe_failure_detail(error):
    # WHY：宿主错误必须能定位，禁止异常正文、页面值、局部变量或完整路径进入诊断。
    kinds = {'ValidationError', 'AttributeError', 'KeyError', 'TypeError', 'ValueError', 'RuntimeError', 'TimeoutError'}
    frames = traceback.extract_tb(error.__traceback__)
    result = {'type': type(error).__name__ if type(error).__name__ in kinds else 'upstream_error',
              'frames': [[frame.name, frame.lineno] for frame in frames
                         if '/hybrid/' in frame.filename.replace('\\', '/')][-4:]}
    modules = ('method_read_tool', 'entry_selection', 'entry_record_scope', 'record_projection_dom',
               'read_sampling', 'natural_reads', 'page_content', 'content_region', 'read', 'targets')
    sources = {Path(module.__file__).resolve(): name for name in modules
               if (module := sys.modules.get('workflow_use.hybrid.' + name)) is not None}
    # WHY：标准 traceback 提供调用链，持久化只保留固定模块名/行号，禁止动态路径、异常正文及 locals。
    result['sources'] = [{'source': sources[Path(frame.filename).resolve()], 'line': frame.lineno}
                         for frame in frames if Path(frame.filename).resolve() in sources][-4:]
    if isinstance(error, ValidationError):
        names = {'kind', 'tabId', 'url', 'selector', 'ordinal', 'text'}
        result['validation'] = [{'field': '.'.join(str(part) for part in item['loc'] if part in names),
                                 'type': item['type']} for item in error.errors(include_input=False,
                                     include_context=False, include_url=False)[:4]]
    return result
