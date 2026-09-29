"""Stable, non-sensitive error codes for the managed hybrid read path."""
import re
from pathlib import Path

import workflow_use


SAFE_ERROR_CODE = re.compile(r'[a-z][a-z_0-9]{1,100}')
SAFE_READ_FAILURE_CODES = frozenset({
    'read_container_resolution_failed', 'read_collection_limit', 'read_input_limit',
    'read_single_object_required', 'read_output_schema_mismatch', 'read_field_projection_failed',
    'read_field_projection_invalid', 'read_field_value_limit', 'ambiguous_or_missing_read_field',
    'read_field_not_text', 'read_text_affix_invalid', 'read_number_not_finite',
    'read_boolean_invalid', 'read_field_native_projection_failed',
})
READ_STAGE_NOTES = {
    'bat_read_scope_pre': 'inner_pre_scope', 'bat_read_scope_post': 'inner_post_scope',
    'bat_read_collection_snapshot': 'target_snapshot', 'bat_read_collection_query': 'target_query',
}


def read_stage_code(stage, error):
    # WHY：阶段和异常类都来自固定枚举；第三方异常名、消息与页面内容不能进入 fd3。
    if isinstance(error, TimeoutError):
        kind = 'timeout_error'
    elif isinstance(error, OSError):
        kind = 'os_error'
    elif isinstance(error, RuntimeError):
        kind = 'runtime_error'
    elif isinstance(error, ValueError):
        kind = 'value_error'
    else:
        kind = 'other_error'
    return f'hybrid_read_{stage}_{kind}'


def safe_runtime_error_code(error):
    """Expose only stable identifiers raised by B-A-T's managed hybrid adapter."""
    message = str(error)
    if SAFE_ERROR_CODE.fullmatch(message) is None:
        return ''
    managed = (Path(workflow_use.__file__).resolve().parent / 'hybrid').resolve()
    traceback = error.__traceback__
    while traceback is not None:
        source = Path(traceback.tb_frame.f_code.co_filename).resolve()
        if source == managed or managed in source.parents:
            return message
        traceback = traceback.tb_next
    return message if message in SAFE_READ_FAILURE_CODES or re.fullmatch(
        r'(?:hybrid_|ordinary_|capture_|read_|target_selection_)[a-z_0-9]{1,100}', message) else ''
