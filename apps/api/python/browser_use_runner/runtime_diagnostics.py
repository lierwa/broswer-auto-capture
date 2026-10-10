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


def pointer_counts(browser):
    client = getattr(browser, '_cdp_client_root', None)
    channel = getattr(getattr(client, 'send', None), 'Input', None)
    counts = getattr(channel, '_bat_input_acknowledgements', None)
    if not isinstance(counts, dict): return None
    outcomes = getattr(channel, '_bat_input_outcomes', None)
    return {**counts, **({'outcomes': {key: dict(value) for key, value in outcomes.items()}}
                        if isinstance(outcomes, dict) else {})}


def attach_pointer_counts(error, before, after):
    capture = getattr(error, 'event_capture', None)
    if not isinstance(capture, dict) or before is None or after is None: return
    # WHY：ACK与DOM事件分别保存；ACK只表示协议应答，不当送达证明，不重放或查询浏览器。
    capture['inputAcknowledgements'] = {key: max(0, after.get(key, 0) - before.get(key, 0))
        for key in ('mouseMoved', 'mousePressed', 'mouseReleased')}
    if isinstance(before.get('outcomes'), dict) and isinstance(after.get('outcomes'), dict):
        capture['inputDispatch'] = {key: {outcome: max(0,
            after['outcomes'][key][outcome] - before['outcomes'][key][outcome])
            for outcome in ('attempted', 'cancelled', 'failed')}
            for key in ('mouseMoved', 'mousePressed', 'mouseReleased')}


def valid_capture(value):
    required = {'status', 'events', 'limitations'}
    if (not isinstance(value, dict) or not required <= set(value)
            or set(value) - required - {'inputAcknowledgements', 'inputDispatch'}): return False
    counts = value.get('inputAcknowledgements')
    if 'inputAcknowledgements' in value and (not isinstance(counts, dict)
            or set(counts) != {'mouseMoved', 'mousePressed', 'mouseReleased'}): return False
    numbers = [value.get('events'), value.get('limitations'), *(counts or {}).values()]
    if 'inputDispatch' in value:
        dispatch = value['inputDispatch']
        if not isinstance(dispatch, dict) or set(dispatch) != {'mouseMoved', 'mousePressed', 'mouseReleased'}: return False
        for row in dispatch.values():
            if not isinstance(row, dict) or set(row) != {'attempted', 'cancelled', 'failed'}: return False
            numbers.extend(row.values())
    return (value.get('status') in {'missing', 'captured', 'listener_unavailable', 'not_applicable'}
            and all(type(number) is int and 0 <= number <= 1000000 for number in numbers))


def command_failure(request, error):
    if request.get('type') != 'hybrid_execute':
        return None
    event = {'phase': 'runtime_command_failure', 'status': 'failed',
             'actionRef': request.get('actionRef'),
             'causes': startup_causes(error, source_modules=RUNTIME_MODULES, location_limit=8)}
    capture = getattr(error, 'event_capture', None)
    if valid_capture(capture): event['eventCapture'] = capture
    return event if valid_command_failure(event) else None


def valid_command_failure(event):
    causes, reference = event.get('causes'), event.get('actionRef')
    return (set(event) in ({'phase', 'status', 'actionRef', 'causes'},
                          {'phase', 'status', 'actionRef', 'causes', 'eventCapture'})
            and ('eventCapture' not in event or valid_capture(event['eventCapture']))
            and event.get('phase') == 'runtime_command_failure' and event.get('status') == 'failed'
            and isinstance(reference, str) and re.fullmatch(r'[A-Za-z0-9._:-]{1,256}', reference) is not None
            and isinstance(causes, list) and 1 <= len(causes) <= 4
            and all(_valid_cause(cause, RUNTIME_SOURCES, 8) for cause in causes))
