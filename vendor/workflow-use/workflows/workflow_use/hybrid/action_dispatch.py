"""Thin audit adapter for the native ``Tools.act`` entry boundary."""
from functools import wraps

from .action_capture_policy import action_capture_policy
from .action_identity import history_action_refs, resolve_history_step
from .evidence import ActionCoverage, EvidenceRef, digest
from .lifecycle_diagnostics import action_metadata, observe_lifecycle

DISPATCH_FACT_KIND = 'native_action_dispatch'
RESULT_FACT_KIND = 'native_action_result'
EVENT_FACT_KIND = 'native_dom_event'
NOT_DISPATCHED_RULE = 'native_action_not_dispatched/v1'


class ActionDispatchAudit:
    """Record proposals by native position and mark only real ``Tools.act`` entry."""
    def __init__(self, event_capture=None):
        self.entries = {}
        self.active = None
        self.event_capture = event_capture

    def propose(self, native_step, action_index, raw_action, target=None):
        position = (native_step, action_index)
        if self.active is not None or position in self.entries:
            raise ValueError('native_action_dispatch_position_reused')
        action_name = next(iter(raw_action)) if isinstance(raw_action, dict) and len(raw_action) == 1 else None
        expectation = action_capture_policy(action_name).event_expectation
        self.entries[position] = {'actionDigest': digest(raw_action), 'actionName': action_name,
                                  'target': target, 'entered': False, 'resultReceived': False,
                                  'nativeResult': None,
                                  'eventCapture': {'status': 'not_dispatched',
                                                   'eventExpectation': expectation,
                                                   'events': [], 'limitations': []}}
        self.active = position

    async def enter(self, raw_action):
        if self.active is None:
            return
        entry = self.entries[self.active]
        if entry['actionDigest'] != digest(raw_action):
            entry['identityValid'] = False
            return
        entry['identityValid'] = True
        entry['entered'] = True
        if self.event_capture is None:
            entry['eventCapture'] = {'status': 'not_configured',
                                     'eventExpectation': entry['eventCapture']['eventExpectation'],
                                     'events': [], 'limitations': []}
            return
        try:
            entry['eventCapture'] = await self.event_capture.arm(entry['actionName'], entry['target'])
        except Exception:
            entry['eventCapture'] = {'status': 'listener_unavailable',
                                     'eventExpectation': entry['eventCapture']['eventExpectation'], 'events': [],
                                     'limitations': ['listener_registration_failed']}

    async def complete(self, result=None):
        if self.active is None:
            return
        entry = self.entries[self.active]
        if result is not None:
            entry['resultReceived'] = True
            entry['nativeResult'] = public_action_result(result)
        if self.event_capture is None or entry['eventCapture']['status'] != 'armed':
            return
        try:
            entry['eventCapture'] = await self.event_capture.complete()
        except Exception:
            entry['eventCapture'] = {'status': 'listener_unavailable',
                                     'eventExpectation': entry['eventCapture']['eventExpectation'], 'events': [],
                                     'limitations': ['listener_completion_failed']}

    def close(self):
        self.active = None

    def resolve(self, history):
        """Resolve only the recorded fixed position; action digests never drive a search."""
        resolved, invalid = {}, []
        references = history_action_refs(history)
        for (native_step, action_index), entry in self.entries.items():
            try:
                step_index = resolve_history_step(history, native_step)
                item = history.history[step_index]
                if getattr(getattr(item, 'metadata', None), 'step_number', None) != native_step:
                    raise ValueError('native_action_dispatch_step_metadata_unavailable')
                actions = item.model_output.action if item.model_output else []
                raw = actions[action_index].model_dump(exclude_unset=True)
                action_ref = references[(step_index, action_index)]
            except (IndexError, KeyError, ValueError):
                invalid.append(None)
                continue
            if entry['actionDigest'] != digest(raw) or entry.get('identityValid') is False:
                invalid.append(action_ref)
                continue
            resolved[(step_index, action_index)] = {
                'nativeStepNumber': native_step,
                'nativeActionIndex': action_index,
                'actionRef': action_ref,
                'actionName': entry['actionName'],
                'intentTarget': entry['target'],
                'entered': entry['entered'],
                'resultReceived': entry['resultReceived'],
                'nativeResult': entry['nativeResult'],
                'eventCapture': entry['eventCapture'],
            }
        return resolved, invalid


def bind_tools_act(tools, audit, diagnostic=None, registry_provider=None, settle_dispatch=None):
    """Wrap and later restore ``act`` on the exact Tools instance owned by Agent."""
    original = tools.act

    @wraps(original)
    async def audited_act(*args, **kwargs):
        action = kwargs.get('action') if 'action' in kwargs else (args[0] if args else None)
        raw = action.model_dump(exclude_unset=True) if action is not None else None
        registry = registry_provider() if registry_provider is not None else None
        step_number = audit.active[0] if audit.active is not None else None
        metadata = action_metadata(registry, raw, step_number) if registry is not None else {}
        async def dispatch():
            if raw is not None:
                await audit.enter(raw)
            try:
                result = await original(*args, **kwargs)
            except BaseException as dispatch_error:
                try:
                    if settle_dispatch is not None:
                        await settle_dispatch()
                    await audit.complete()
                except BaseException as settle_error:
                    raise settle_error from dispatch_error
                raise
            if settle_dispatch is not None:
                await settle_dispatch()
            await audit.complete(result)
            return result
        return await observe_lifecycle(diagnostic, 'dispatch', dispatch, metadata,
                                       result_failed=lambda result: bool(getattr(result, 'error', None)))

    tools.act = audited_act

    def restore():
        if tools.act is audited_act:
            tools.act = original

    return restore


def not_dispatched_coverage(trace, action):
    """Return the exact evidence set only for a proven failed action that never entered Tools.act."""
    if action.status != 'failed' or action.resultRef is None:
        return None
    dispatch_facts = [fact for observation in trace.observations for fact in observation.facts
                      if fact.kind == DISPATCH_FACT_KIND]
    matches = [fact for fact in dispatch_facts if isinstance(fact.value, dict)
               and fact.value.get('actionRef') == action.id]
    if len(matches) != 1:
        return None
    fact, value = matches[0], matches[0].value
    expected_keys = {'schemaVersion', 'nativeStepNumber', 'nativeActionIndex', 'actionRef', 'actionName',
                     'intentTarget', 'resultRef', 'entered', 'resultReceived', 'eventCapture'}
    capture = value.get('eventCapture')
    if (set(value) != expected_keys or value.get('schemaVersion') != 'bat.native-action-dispatch/v3'
            or type(value.get('nativeStepNumber')) is not int or value['nativeStepNumber'] <= 0
            or type(value.get('nativeActionIndex')) is not int or value['nativeActionIndex'] < 0
            or value.get('entered') is not False or value['nativeActionIndex'] != action.actionIndex
            or value.get('resultReceived') is not False
            or not isinstance(capture, dict) or capture.get('status') != 'not_dispatched'
            or capture.get('eventCount') != 0 or capture.get('limitations') != []
            or capture.get('eventExpectation') not in ('none', 'optional', 'required')
            or value.get('resultRef') != action.resultRef.model_dump(mode='json')
            or not fact.sourceRefs or any(ref.digest != digest(value) for ref in fact.sourceRefs)):
        return None
    position = (value['nativeStepNumber'], value['nativeActionIndex'])
    same_position = [item for item in dispatch_facts if isinstance(item.value, dict)
                     and (item.value.get('nativeStepNumber'), item.value.get('nativeActionIndex')) == position]
    if len(same_position) != 1:
        return None
    references = unique_refs([action.resultRef, *fact.sourceRefs])
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule=NOT_DISPATCHED_RULE, evidenceRefs=references)


def unique_refs(refs):
    found = {}
    for ref in refs:
        if isinstance(ref, dict):
            ref = EvidenceRef.model_validate(ref)
        found[(ref.ref, ref.digest)] = ref
    return list(found.values())


def public_action_result(result):
    if result is None or not hasattr(result, 'model_dump'):
        return None
    return result.model_dump(mode='json')


def dispatch_target(summary, selector_index):
    if not isinstance(selector_index, int) or isinstance(selector_index, bool):
        return None
    mapping = getattr(getattr(summary, 'dom_state', None), 'selector_map', {}) or {}
    target = mapping.get(selector_index, mapping.get(str(selector_index)))
    if target is None:
        return None
    value = lambda name: target.get(name) if isinstance(target, dict) else getattr(target, name, None)
    return {key: str(item) for key, item in {
        'targetId': value('target_id'), 'frameId': value('frame_id'),
        'sessionId': value('session_id')}.items() if item is not None and str(item)}
