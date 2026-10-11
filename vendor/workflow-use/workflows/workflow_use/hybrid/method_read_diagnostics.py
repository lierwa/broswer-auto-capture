"""Safe correction feedback derived from the confirmed field-read contract."""
import json
import sys
import traceback
from pathlib import Path
from pydantic import ValidationError
from .field_read_params import _read_shape
from .natural_reads import schema_at_path
from .rendered_field_text import FieldReadError
from .page_content import SAFE_CONTENT_FAILURE_CODES

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

def _base_read_error(error, field_names, *, phase=None):
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


def _safe_read_error(error, field_names, *, phase=None, output_schema=None, params=None):
    message = _base_read_error(error, field_names, phase=phase)
    code = str(error)
    if output_schema is None or params is None or code not in {
            'natural_read_schema_mismatch', 'natural_read_output_path_invalid',
            'ambiguous_or_missing_read_field'}:
        return message
    correction = _contract_correction(output_schema, params, error)
    if correction is None:
        return message
    # WHY：纠错只派生合同字段、类型和固定建议；不回传页面值、选择器或原始异常。
    detail = json.loads(message.split(': ', 1)[1]) if ': ' in message else {}
    return code + ': ' + json.dumps({**detail, 'correction': correction}, ensure_ascii=False, separators=(',', ':'))


def _contract_correction(output_schema, params, error):
    path = params.outputPath if params.outputPath is not None else []
    try:
        target = schema_at_path(output_schema, path)
        if target.get('type') == 'array':
            target = {'type': 'array', 'items': target.get('items'), 'minItems': 0, 'maxItems': params.maxItems}
        _, properties, required, _, _ = _read_shape(target)
    except ValueError:
        return {'instruction': 'Choose a real outputPath from the confirmed contract; do not invent fields.',
                'rootFields': list(output_schema.get('properties', {}))}
    selected = set(params.fields or {})
    result = {'outputPath': path, 'requiredFields': [name for name in properties if name in required],
        'allowedFields': list(properties), 'missingFields': [name for name in properties if name in required - selected],
        'unknownFieldCount': len(selected - set(properties)),
        'fieldTypes': {name: ('array<' + value['items']['type'] + '>' if value.get('type') == 'array'
                             else value['type']) for name, value in properties.items()},
        'instruction': ('Supply outputPath, one observed record container, and fields using these exact contract names; '
            'container alone is content capture and cannot read this field contract. '
            'For each array field, its selector may match all requested values inside the one record container; '
            'the host derives cardinality. For each scalar field, select exactly one observed node. '
            'A scalar outputPath uses fields.value. Do not change the output schema or invent extra fields.')}
    if isinstance(error, FieldReadError):
        # WHY：字段选择器在记录容器内解析；零匹配不证明页面不存在，错误可能同时来自容器和投影。
        result.update(matchScope='record-container', pageWideAbsenceProven=False,
                      repairableParameters=['container', 'fields'])
        result['instruction'] = ('The named field is matched inside the selected record container, not page-wide. '
            'Inspect the observed field and its ancestors. If it is outside the container, choose an observed '
            'common ancestor containing all required DOM fields and adjust their relative projections. '
            'Otherwise correct the field projection. A scalar must match exactly one node; an array reads '
            'its requested values. Do not use an arbitrary first match or change the output contract. '
            'Call bat_read_fields with the corrected method on the existing page; retrying a failed read '
            'does not require repeating navigation, submission or other completed actions. '
            'For a field requesting the current document address, use selector=:scope with valueSource=page-url; '
            'the document need not contain a hyperlink to itself. This does not replace a requested different target URL.')
    return result
