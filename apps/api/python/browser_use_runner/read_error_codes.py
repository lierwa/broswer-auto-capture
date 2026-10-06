"""Stable, non-sensitive error codes for the managed hybrid read path."""
import re
from pathlib import Path

import workflow_use
from workflow_use.hybrid.page_content import SAFE_CONTENT_FAILURE_CODES


SAFE_ERROR_CODE = re.compile(r'[a-z][a-z_0-9]{1,100}')
SAFE_READ_FAILURE_CODES = frozenset({
    'read_container_resolution_failed', 'read_collection_limit', 'read_input_limit',
    'read_single_object_required', 'read_output_schema_mismatch', 'read_field_projection_failed',
    'read_field_projection_invalid', 'read_field_value_limit', 'ambiguous_or_missing_read_field',
    'read_field_not_text', 'read_text_affix_invalid', 'read_number_not_finite',
    'read_boolean_invalid', 'read_field_native_projection_failed',
}) | SAFE_CONTENT_FAILURE_CODES
SAFE_ACCOUNT_FAILURE_CODES = frozenset({
    'account_marker_stable_locator_missing', 'account_marker_not_unique_or_visible', 'account_marker_page_changed', 'account_marker_cancelled',
    'account_window_not_released', 'account_window_owner_unavailable', 'account_owned_page_unavailable',
    'account_transfer_target_changed', 'account_rollback_target_changed', 'account_rollback_owner_or_scope_changed',
    'account_rollback_owner_or_phase_changed', 'account_rollback_owner_or_version_changed', 'account_rollback_owner_changed',
    'account_rollback_snapshot_unavailable', 'account_rollback_snapshot_verification_failed', 'account_rollback_verification_failed',
    'account_authentication_scope_unverified', 'account_authentication_scope_denied', 'account_storage_scope_denied',
    'account_opaque_cookie_partition_unsupported', 'account_cookie_write_rejected', 'account_platform_version_changed',
    'account_platform_not_found', 'account_session_action_unavailable', 'account_secure_storage_unavailable',
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
    from pydantic import ValidationError
    if isinstance(error, ValidationError):
        # WHY：边界校验失败不能只剩类名；保留固定原因/字段路径，绝不回传 input 或异常正文。
        issue = error.errors(include_input=False, include_url=False)[0]
        cause = issue.get('ctx', {}).get('error')
        if isinstance(cause, ValueError) and re.fullmatch(
                r'(?:bounded_postcondition_|consumer_readiness_|postcondition_|content_)[a-z_0-9]{1,100}', str(cause)):
            return 'hybrid_contract_' + str(cause)
        parts = [str(part) for part in issue['loc'] if isinstance(part, (str, int))
                 and re.fullmatch(r'[A-Za-z_0-9]{1,60}', str(part))]
        return 'hybrid_contract_' + '_'.join([*parts[:5], issue['type']])
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
    return message if message in SAFE_ACCOUNT_FAILURE_CODES or message in SAFE_READ_FAILURE_CODES or re.fullmatch(
        r'(?:hybrid_|ordinary_|capture_|read_|target_selection_)[a-z_0-9]{1,100}', message) else ''
