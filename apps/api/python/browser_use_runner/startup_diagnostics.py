"""Fixed attached-startup metadata; dependency error text is never serialized."""
import asyncio
import sys
from pathlib import Path

STARTUP_STAGES = frozenset({'reserve', 'sdk_connect', 'task_target_prepare', 'task_target_focus'})
STARTUP_ERROR_KINDS = frozenset({'timeout_error', 'os_error', 'runtime_error', 'value_error',
                                'cancelled_error', 'other_error'})
STARTUP_CODES = frozenset({'external_error', 'hybrid_attached_window_endpoint_invalid',
    'hybrid_attached_window_endpoint_required', 'hybrid_attached_window_lease_missing',
    'hybrid_attached_window_owner_mismatch', 'hybrid_attached_window_profile_changed',
    'hybrid_attached_window_endpoint_changed', 'hybrid_attached_window_busy',
    'hybrid_attached_window_target_missing', 'hybrid_attached_window_sdk_mismatch',
    'hybrid_attached_window_scope_busy', 'hybrid_attached_window_cdp_unavailable',
    'hybrid_attached_window_storage_state_disallowed', 'hybrid_managed_window_resume_unavailable'})
SOURCE_MODULES = {
    'browser_use_runner.attached_window': 'bat_attached_window',
    'browser_use_runner.target_scope': 'bat_target_scope',
    'browser_use.browser.session': 'sdk_browser_session',
    'browser_use.browser.session_manager': 'sdk_session_manager',
    'cdp_use.client': 'sdk_cdp_client',
}
STARTUP_SOURCES = frozenset(SOURCE_MODULES.values())


def _kind(error):
    for error_type, kind in ((TimeoutError, 'timeout_error'), (OSError, 'os_error'),
            (RuntimeError, 'runtime_error'), (ValueError, 'value_error'),
            (asyncio.CancelledError, 'cancelled_error')):
        if isinstance(error, error_type):
            return kind
    return 'other_error'


def _locations(error):
    # WHY：只把可信模块文件映射到固定名称；用户路径、动态函数名和 SDK 消息均不进入诊断。
    sources = {Path(module.__file__).resolve(): source for name, source in SOURCE_MODULES.items()
               if (module := sys.modules.get(name)) is not None and getattr(module, '__file__', None)}
    locations, frame = [], error.__traceback__
    while frame is not None:
        source = sources.get(Path(frame.tb_frame.f_code.co_filename).resolve())
        if source is not None and 1 <= frame.tb_lineno <= 1000000:
            locations.append({'source': source, 'line': frame.tb_lineno})
        frame = frame.tb_next
    return locations[-3:]


def startup_causes(error):
    causes, seen, current = [], set(), error
    while current is not None and id(current) not in seen and len(causes) < 4:
        seen.add(id(current))
        args = current.args
        code = args[0] if len(args) == 1 and isinstance(args[0], str) and args[0] in STARTUP_CODES else 'external_error'
        causes.append({'errorKind': _kind(current), 'code': code, 'locations': _locations(current)})
        current = current.__cause__ or current.__context__
    return causes


def valid_startup_event(event):
    if event.get('stage') not in STARTUP_STAGES or event.get('status') not in {'started', 'completed', 'failed'}:
        return False
    if event['status'] != 'failed':
        return set(event) == {'phase', 'status', 'stage'}
    causes = event.get('causes')
    if set(event) != {'phase', 'status', 'stage', 'causes'} or not isinstance(causes, list) or not 1 <= len(causes) <= 4:
        return False
    return all(_valid_cause(cause) for cause in causes)


def _valid_cause(cause):
    if (not isinstance(cause, dict) or set(cause) != {'errorKind', 'code', 'locations'}
            or cause.get('errorKind') not in STARTUP_ERROR_KINDS or cause.get('code') not in STARTUP_CODES):
        return False
    locations = cause.get('locations')
    return (isinstance(locations, list) and len(locations) <= 3
            and all(isinstance(location, dict) and set(location) == {'source', 'line'}
                    and location.get('source') in STARTUP_SOURCES and type(location.get('line')) is int
                    and 1 <= location['line'] <= 1000000 for location in locations))
