"""Owner-local fixed traceback metadata; no messages, frame locals or browser calls."""
import re

from browser_use_runner.startup_diagnostics import SOURCE_MODULES, startup_causes, _valid_cause

# WHY：复用连接诊断的脱敏提取器，扩充可信源码范围；不序列化动态路径或异常文本。
RUNTIME_MODULES = {**SOURCE_MODULES,
    'browser_use_runner.hybrid_main': 'bat_runner',
    'workflow_use.hybrid.capability': 'bat_capability',
    'workflow_use.hybrid.targets': 'bat_targets',
    'workflow_use.hybrid.target_preparation': 'bat_target_preparation',
    'workflow_use.hybrid.postconditions': 'bat_postconditions',
    'workflow_use.hybrid.native_event_capture': 'bat_event_capture',
    'browser_use.tools.service': 'sdk_tools',
    'browser_use.actor.element': 'sdk_element',
    'browser_use.actor.page': 'sdk_page',
    'browser_use.browser.watchdogs.default_action_watchdog': 'sdk_action_watchdog',
}
RUNTIME_SOURCES = frozenset(RUNTIME_MODULES.values())


def command_failure(request, error):
    if request.get('type') != 'hybrid_execute':
        return None
    event = {'phase': 'runtime_command_failure', 'status': 'failed',
             'actionRef': request.get('actionRef'),
             'causes': startup_causes(error, source_modules=RUNTIME_MODULES, location_limit=8)}
    return event if valid_command_failure(event) else None


def valid_command_failure(event):
    causes, reference = event.get('causes'), event.get('actionRef')
    return (set(event) == {'phase', 'status', 'actionRef', 'causes'}
            and event.get('phase') == 'runtime_command_failure' and event.get('status') == 'failed'
            and isinstance(reference, str) and re.fullmatch(r'[A-Za-z0-9._:-]{1,256}', reference) is not None
            and isinstance(causes, list) and 1 <= len(causes) <= 4
            and all(_valid_cause(cause, RUNTIME_SOURCES, 8) for cause in causes))
