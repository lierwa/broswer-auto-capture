"""Run-scoped DOM event bridge over the BrowserSession's existing CDP connection."""
import json
from uuid import uuid4

from .action_capture_policy import ACTION_CAPTURE_POLICIES, action_capture_policy
from .dom_evidence import safe_url
from .evidence import digest


ALL_EVENT_TYPES = tuple(dict.fromkeys(
    event_type for policy in ACTION_CAPTURE_POLICIES.values() for event_type in policy.event_types))


CAPTURE_SCRIPT = r"""
(() => {
  const bindingName = __BAT_BINDING__;
  const stateKey = __BAT_STATE_KEY__;
  const eventTypes = __BAT_EVENT_TYPES__;
  const previous = globalThis[stateKey];
  if (previous && typeof previous.cleanup === "function") return;
  const documentId = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  let sequence = 0;

  const element = (value) => value && value.nodeType === Node.ELEMENT_NODE;
  const domParentElement = (value) => value?.parentElement || null;
  const ancestorElement = (value) => {
    if (!value) return null;
    if (value.parentElement) return value.parentElement;
    const root = typeof value.getRootNode === "function" ? value.getRootNode() : null;
    return root instanceof ShadowRoot ? root.host : null;
  };
  const directText = (value) => Array.from(value.childNodes || [])
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.nodeValue || "").join("");
  const properties = (value) => {
    const result = {};
    if ("value" in value && typeof value.value === "string") result.value = value.value;
    for (const key of ["checked", "selected", "disabled", "readOnly", "required", "multiple"]) {
      if (key in value && typeof value[key] === "boolean") result[key] = value[key];
    }
    if (typeof value.selectedIndex === "number") result.selectedIndex = value.selectedIndex;
    for (const key of ["scrollTop", "scrollLeft", "scrollHeight", "scrollWidth", "clientHeight", "clientWidth"]) {
      if (typeof value[key] === "number") result[key] = value[key];
    }
    return result;
  };
  const attributes = (value) => Object.fromEntries(Array.from(value.attributes || [])
    .map((attribute) => [attribute.name, attribute.value]));
  const rootDescriptor = (value, refs) => {
    const root = typeof value.getRootNode === "function" ? value.getRootNode() : null;
    if (root instanceof ShadowRoot) {
      return { kind: "shadow_root", mode: root.mode, hostRef: refs.get(root.host) || null };
    }
    return { kind: "document", mode: null, hostRef: null };
  };
  const pathEntry = (value, refs) => {
    if (element(value)) return { kind: "element", ref: refs.get(value) || null };
    if (value instanceof ShadowRoot) {
      return { kind: "shadow_root", mode: value.mode, hostRef: refs.get(value.host) || null };
    }
    if (value === document) return { kind: "document", documentId };
    if (value === globalThis) return { kind: "window" };
    return { kind: "other", nodeType: typeof value?.nodeType === "number" ? value.nodeType : null };
  };
  const localGraph = (event) => {
    const rawPath = typeof event.composedPath === "function" ? event.composedPath() : [];
    const primary = [];
    const seen = new Set();
    const add = (value) => {
      if (!element(value) || seen.has(value)) return;
      seen.add(value); primary.push(value);
    };
    rawPath.forEach(add);
    let current = element(event.target) ? event.target : null;
    while (current) { add(current); current = ancestorElement(current); }
    const selected = [...primary];
    const targetElement = element(event.target) ? event.target : null;
    Array.from(targetElement?.children || []).forEach((child) => {
      if (!seen.has(child)) { seen.add(child); selected.push(child); }
    });
    const refs = new Map(selected.map((value, index) => [value, `n-${String(index + 1).padStart(4, "0")}`]));
    const nodes = selected.map((value) => ({
      id: refs.get(value), tag: value.localName || value.tagName.toLowerCase(),
      namespace: value.namespaceURI || null,
      parentRef: refs.get(domParentElement(value)) || null,
      childrenRefs: Array.from(value.children || []).map((child) => refs.get(child)).filter(Boolean),
      assignedSlotRef: refs.get(value.assignedSlot) || null,
      attributes: attributes(value), properties: properties(value), directText: directText(value),
      root: rootDescriptor(value, refs),
    }));
    return { targetRef: refs.get(event.target) || null, target: pathEntry(event.target, refs),
      composedPath: rawPath.map((value) => pathEntry(value, refs)), nodes };
  };
  const eventData = (event) => {
    const data = {};
    for (const key of ["button", "buttons", "clientX", "clientY", "detail", "keyCode", "charCode"]) {
      if (typeof event[key] === "number") data[key] = event[key];
    }
    for (const key of ["key", "code", "inputType", "data", "pointerType"]) {
      if (typeof event[key] === "string" || event[key] === null) data[key] = event[key];
    }
    for (const key of ["altKey", "ctrlKey", "metaKey", "shiftKey", "repeat"]) {
      if (typeof event[key] === "boolean") data[key] = event[key];
    }
    if (event.type === "scroll") {
      data.scrollX = globalThis.scrollX; data.scrollY = globalThis.scrollY;
    }
    return data;
  };
  const capture = (event) => {
    const payload = {
      schemaVersion: "bat.native-dom-event-payload/v2", sequence: sequence++, documentId,
      scope: { url: globalThis.location.href, isTop: globalThis === globalThis.top },
      event: { type: event.type, isTrusted: event.isTrusted, bubbles: event.bubbles,
        cancelable: event.cancelable, composed: event.composed, defaultPrevented: event.defaultPrevented,
        eventPhase: event.eventPhase, timeStamp: event.timeStamp, data: eventData(event) },
      graph: localGraph(event),
    };
    try { globalThis[bindingName](JSON.stringify(payload)); } catch (_) {}
  };
  for (const type of eventTypes) document.addEventListener(type, capture, true);
  const state = { documentId, cleanup: () => {
    for (const type of eventTypes) document.removeEventListener(type, capture, true);
    try { delete globalThis[stateKey]; } catch (_) {}
  }};
  Object.defineProperty(globalThis, stateKey, { value: state, configurable: true });
})();
"""


class NativeEventCapture:
    """Keep one event bridge per authoring run and open one association window per action."""
    def __init__(self, browser):
        self.browser = browser
        self.client = None
        self.active = None
        self.contexts = {}
        self.sessions = {}
        self.target_sessions = {}
        self.installed = {}
        self.binding = '__bat_native_event_' + uuid4().hex
        self.state_key = '__bat_native_event_state_' + uuid4().hex
        self._handlers_registered = False
        self._binding_handler = self._on_binding_called
        self._context_handler = self._on_context_created

    async def arm(self, action_name, target=None):
        policy = action_capture_policy(action_name)
        event_types = policy.event_types
        if not event_types:
            return {'status': 'not_applicable', 'eventExpectation': policy.event_expectation,
                    'events': [], 'limitations': []}
        if self.active is not None:
            raise ValueError('native_event_capture_already_active')
        await self._ensure_transport()
        sessions, limitations = await self._action_sessions(action_name, target)
        installed = []
        for session in sessions:
            try:
                owner = await self._ensure_installed(session)
                installed.append(str(owner['sessionId']))
            except Exception:
                limitations.append('listener_registration_failed:' + str(session.target_id))
        if not installed:
            raise ValueError('native_event_listener_registration_failed')
        intended = {}
        if isinstance(target, dict) and target.get('frameId'):
            for session_id in installed:
                session = self.sessions.get(session_id, {})
                if (target.get('sessionId') == session_id
                        or target.get('targetId') == session.get('targetId')):
                    intended[session_id] = target['frameId']
        self.active = {'eventTypes': frozenset(event_types), 'eventExpectation': policy.event_expectation,
                       'events': [], 'limitations': limitations,
                       'sessionIds': installed, 'intendedFrames': intended, 'seenPayloads': {}}
        return {'status': 'armed', 'eventExpectation': policy.event_expectation,
                'events': [], 'limitations': list(limitations)}

    async def complete(self):
        if self.active is None:
            return {'status': 'listener_unavailable', 'eventExpectation': 'required', 'events': [],
                    'limitations': ['listener_not_active']}
        active = self.active
        await self._barrier(active)
        events = list(active['events'])
        limitations = sorted(set(active['limitations']))
        self.active = None
        status = 'missing' if active['eventExpectation'] == 'required' and not events else 'captured'
        return {'status': status, 'eventExpectation': active['eventExpectation'], 'events': events,
                'limitations': limitations}

    async def close(self):
        self.active = None
        await self._release_installed()
        self._unregister_handlers()
        self.contexts.clear()
        self.sessions.clear()
        self.target_sessions.clear()

    async def _ensure_transport(self):
        if self.client is None:
            self.client = self.browser.cdp_client
        if self.client is None:
            raise ValueError('native_event_cdp_client_unavailable')
        self._register_handlers()

    async def _action_sessions(self, action_name, target):
        target_ids = [self.browser.agent_focus_target_id]
        intended_target = target.get('targetId') if isinstance(target, dict) else None
        if intended_target:
            target_ids.append(intended_target)
        if action_name == 'send_keys' or not isinstance(target, dict) or not target.get('targetId'):
            target_ids.extend(await self._focused_frame_target_ids())
        output, limitations = [], []
        for target_id in dict.fromkeys(value for value in target_ids if value):
            try:
                session = await self._session_for_target(target_id)
            except Exception:
                limitations.append('target_session_unavailable:' + str(target_id))
                if target_id == intended_target:
                    raise ValueError('native_event_intended_target_session_unavailable')
                continue
            output.append(session)
        if not output:
            raise ValueError('native_event_target_session_unavailable')
        return output, limitations

    async def _session_for_target(self, target_id):
        key = str(target_id)
        session = self.target_sessions.get(key)
        if session is None:
            session = await self.browser.get_or_create_cdp_session(target_id=target_id, focus=False)
            self.target_sessions[key] = session
            self.sessions[str(session.session_id)] = {'targetId': str(session.target_id)}
        return session

    async def _focused_frame_target_ids(self):
        focus = self.browser.agent_focus_target_id
        if not focus:
            return []
        try:
            frames, _sessions = await self.browser.get_all_frames()
        except Exception:
            return [focus]
        roots = {frame_id for frame_id, frame in frames.items()
                 if frame.get('frameTargetId') == focus and not frame.get('parentFrameId')}
        included = set(roots)
        changed = True
        while changed:
            changed = False
            for frame_id, frame in frames.items():
                if frame.get('parentFrameId') in included and frame_id not in included:
                    included.add(frame_id)
                    changed = True
        targets = [focus]
        targets.extend(frames[frame_id].get('frameTargetId') for frame_id in included)
        return list(dict.fromkeys(value for value in targets if value))

    async def _ensure_installed(self, session):
        target_id = str(session.target_id)
        if target_id in self.installed:
            return self.installed[target_id]
        await self.client.send.Runtime.enable(session_id=session.session_id)
        await self.client.send.Runtime.addBinding(params={'name': self.binding}, session_id=session.session_id)
        script = capture_script(self.binding, self.state_key)
        result = await self.client.send.Page.addScriptToEvaluateOnNewDocument(
            params={'source': script, 'runImmediately': True}, session_id=session.session_id)
        installed = {'sessionId': session.session_id, 'targetId': target_id,
                     'identifier': result['identifier']}
        self.installed[target_id] = installed
        return installed

    async def _barrier(self, active):
        for session_id in active['sessionIds']:
            installed = next((value for value in self.installed.values()
                              if str(value['sessionId']) == str(session_id)), None)
            if installed is None:
                continue
            try:
                await self.client.send.Runtime.evaluate(
                    params={'expression': 'void 0', 'returnByValue': True},
                    session_id=installed['sessionId'])
            except Exception:
                active['limitations'].append('event_delivery_barrier_failed:' + session_id)

    async def _release_installed(self):
        if self.client is None:
            return
        teardown = f'globalThis[{json.dumps(self.state_key)}]?.cleanup?.()'
        for installed in reversed(list(self.installed.values())):
            session_id = installed['sessionId']
            contexts = [key[1] for key in self.contexts if key[0] == str(session_id)]
            for context_id in contexts or [None]:
                params = {'expression': teardown, 'returnByValue': True}
                if context_id is not None:
                    params['contextId'] = context_id
                try:
                    await self.client.send.Runtime.evaluate(params=params, session_id=session_id)
                except Exception:
                    pass
            try:
                await self.client.send.Page.removeScriptToEvaluateOnNewDocument(
                    params={'identifier': installed['identifier']}, session_id=session_id)
            except Exception:
                pass
            try:
                await self.client.send.Runtime.removeBinding(
                    params={'name': self.binding}, session_id=session_id)
            except Exception:
                pass
        self.installed.clear()

    async def _on_binding_called(self, event, session_id):
        active = self.active
        if active is None or event.get('name') != self.binding:
            return
        if str(session_id) not in active['sessionIds']:
            return
        try:
            payload = json.loads(event['payload'])
            event_value = payload.get('event') if isinstance(payload, dict) else None
            if (not isinstance(payload, dict)
                    or payload.get('schemaVersion') != 'bat.native-dom-event-payload/v2'
                    or not isinstance(event_value, dict)):
                raise ValueError('invalid_payload')
            if event_value.get('type') not in active['eventTypes']:
                return
            document_id, sequence = payload.get('documentId'), payload.get('sequence')
            if (not isinstance(document_id, str) or not document_id
                    or type(sequence) is not int or sequence < 0):
                raise ValueError('invalid_payload_identity')
            key, fingerprint = (document_id, sequence), digest(payload)
            previous = active['seenPayloads'].get(key)
            if previous is not None:
                if previous != fingerprint:
                    active['limitations'].append('event_sequence_conflict')
                return
            active['seenPayloads'][key] = fingerprint
            value = self._normalize_event(payload, str(session_id), event.get('executionContextId'))
            value['actionSequence'] = len(active['events'])
            active['events'].append(value)
        except Exception:
            active['limitations'].append('event_payload_invalid')

    async def _on_context_created(self, event, session_id):
        context = event.get('context') if isinstance(event, dict) else None
        if not isinstance(context, dict) or type(context.get('id')) is not int:
            return
        auxiliary = context.get('auxData') if isinstance(context.get('auxData'), dict) else {}
        self.contexts[(str(session_id), context['id'])] = {
            'frameId': str(auxiliary['frameId']) if auxiliary.get('frameId') else None,
            'contextUniqueId': context.get('uniqueId'), 'origin': context.get('origin')}

    def _normalize_event(self, payload, session_id, context_id):
        raw_scope = payload.get('scope') if isinstance(payload.get('scope'), dict) else {}
        raw_url = raw_scope.get('url')
        context = self.contexts.get((session_id, context_id), {})
        session = self.sessions.get(session_id, {})
        intended = self.active['intendedFrames'].get(session_id) if self.active else None
        frame_id = context.get('frameId') or intended
        limitations = [] if context.get('frameId') else ['runtime_frame_identity_unavailable']
        return {'sequence': payload.get('sequence'), 'documentId': payload.get('documentId'),
            'association': 'single_browser_action_window/v1', 'captureBoundary': 'document_capture',
            'scope': {'url': safe_url(raw_url), 'urlDigest': digest(raw_url),
                      'isTop': raw_scope.get('isTop'), 'targetId': session.get('targetId'),
                      'sessionId': session_id, 'frameId': frame_id,
                      'executionContextId': context_id,
                      'contextUniqueId': context.get('contextUniqueId')},
            'event': payload.get('event'), 'graph': payload.get('graph'),
            'limitations': limitations}

    def _register_handlers(self):
        if self._handlers_registered:
            return
        registry = self.client._event_registry
        methods = registry.get_registered_methods()
        if 'Runtime.bindingCalled' in methods or 'Runtime.executionContextCreated' in methods:
            raise ValueError('native_event_handler_conflict')
        self.client.register.Runtime.bindingCalled(self._binding_handler)
        self.client.register.Runtime.executionContextCreated(self._context_handler)
        self._handlers_registered = True

    def _unregister_handlers(self):
        if not self._handlers_registered or self.client is None:
            return
        registry = self.client._event_registry
        # cdp-use 固定版本只有单 handler registry；只在仍持有自己的 handler 时释放，避免覆盖其他所有者。
        for method, handler in [('Runtime.bindingCalled', self._binding_handler),
                                ('Runtime.executionContextCreated', self._context_handler)]:
            if registry._handlers.get(method) is handler:
                registry.unregister(method)
        self._handlers_registered = False


def capture_script(binding, state_key):
    return (CAPTURE_SCRIPT.replace('__BAT_BINDING__', json.dumps(binding))
            .replace('__BAT_STATE_KEY__', json.dumps(state_key))
            .replace('__BAT_EVENT_TYPES__', json.dumps(ALL_EVENT_TYPES)))
