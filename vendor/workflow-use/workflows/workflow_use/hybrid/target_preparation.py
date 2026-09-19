"""Bounded, model-free action preparation for a freshly resolved browser-use target."""
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class PreparedActionTarget:
    index: int
    element: object
    backend_id: int
    target_id: str
    frame_id: str | None
    session_id: str | None
    scrolled: bool
    hit_relation: str


TARGET_PREPARATION_SCRIPT = r"""() => {
  const connected = Boolean(this.isConnected);
  const style = connected ? getComputedStyle(this) : null;
  const rect = connected ? this.getBoundingClientRect() : null;
  const visible = Boolean(connected && style && rect && rect.width > 0 && rect.height > 0
    && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0
    && (typeof this.checkVisibility !== 'function'
      || this.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})));
  const left = rect ? Math.max(0, rect.left) : 0;
  const right = rect ? Math.min(innerWidth, rect.right) : 0;
  const top = rect ? Math.max(0, rect.top) : 0;
  const bottom = rect ? Math.min(innerHeight, rect.bottom) : 0;
  const inView = Boolean(visible && right > left && bottom > top);
  const x = inView ? (left + right) / 2 : 0;
  const y = inView ? (top + bottom) / 2 : 0;
  const hit = inView ? document.elementFromPoint(x, y) : null;
  const hitRelation = hit === this ? 'self' : hit && this.contains(hit) ? 'descendant' : 'outside';
  const disabled = Boolean(connected && (this.matches(':disabled')
    || this.getAttribute('aria-disabled') === 'true' || this.closest('[inert]')));
  const readOnly = Boolean(connected && 'readOnly' in this && this.readOnly);
  const pointerBlocked = Boolean(style && style.pointerEvents === 'none');
  let scrollContainer = null;
  for (let current = this.parentElement; current; current = current.parentElement) {
    const currentStyle = getComputedStyle(current);
    const overflow = `${currentStyle.overflow} ${currentStyle.overflowX} ${currentStyle.overflowY}`;
    if (/(auto|scroll|overlay)/.test(overflow)
      && (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth)) {
      scrollContainer = {
        tag: current.localName,
        id: current.id || null,
        scrollTop: current.scrollTop,
        scrollLeft: current.scrollLeft,
      };
      break;
    }
  }
  return {connected, visible, inView, hitRelation, disabled, readOnly, pointerBlocked,
    scrollContainer: scrollContainer || {tag:'window', id:null, scrollTop:scrollY, scrollLeft:scrollX}};
}"""


async def inspect_action_target(element):
    try:
        value = json.loads(await element.evaluate(TARGET_PREPARATION_SCRIPT))
    except Exception as error:
        raise ValueError('target_preparation_unavailable') from error
    required = {'connected', 'visible', 'inView', 'hitRelation', 'disabled', 'readOnly',
                'pointerBlocked', 'scrollContainer'}
    if (not isinstance(value, dict) or set(value) != required
            or any(type(value[key]) is not bool for key in (
                'connected', 'visible', 'inView', 'disabled', 'readOnly', 'pointerBlocked'))
            or value['hitRelation'] not in ('self', 'descendant', 'outside')
            or not isinstance(value['scrollContainer'], dict)):
        raise ValueError('target_preparation_invalid')
    return value


def assert_action_target(state, action_name):
    if not state['connected']:
        raise ValueError('target_detached')
    if not state['visible']:
        raise ValueError('target_not_visible')
    if not state['inView']:
        raise ValueError('target_not_in_view')
    if action_name == 'dropdown_options':
        return
    if state['disabled']:
        raise ValueError('target_disabled')
    if action_name == 'input' and state['readOnly']:
        raise ValueError('target_read_only')
    if state['pointerBlocked'] or state['hitRelation'] == 'outside':
        raise ValueError('target_hit_blocked')


async def prepare_mapped_target(resolver, target, action_name, page, mapping, target_id, index, scrolled):
    # Delayed import keeps target parsing and target preparation as separate modules without duplicating helpers.
    from .targets import (SCROLL_INTO_VIEW_SCRIPT, _backend_id, _current_target, _node_value,
                          element_from_backend)
    node = mapping.get(index, mapping.get(str(index)))
    backend_id = _backend_id(node)
    if type(backend_id) is not int or not _current_target(node, target_id):
        raise ValueError('element_identity_unavailable')
    element = await element_from_backend(page, backend_id, target_id)
    state = await inspect_action_target(element)
    if not state['inView']:
        await element.evaluate(SCROLL_INTO_VIEW_SCRIPT)
        scrolled = True
        await resolver._assert_page_identity(page, target_id, target.get('scope'))
        page, mapping = await resolver._refresh_snapshot(target_id, target.get('scope'))
        index = await resolver._resolve_index(target, page, mapping, target_id)
        node = mapping.get(index, mapping.get(str(index)))
        backend_id = _backend_id(node)
        if type(backend_id) is not int or not _current_target(node, target_id):
            raise ValueError('element_identity_unavailable')
        element = await element_from_backend(page, backend_id, target_id)
        state = await inspect_action_target(element)
    assert_action_target(state, action_name)
    await resolver._assert_page_identity(page, target_id, target.get('scope'))
    return PreparedActionTarget(
        index=index, element=element, backend_id=backend_id, target_id=target_id,
        frame_id=_node_value(node, 'frame_id'), session_id=_node_value(node, 'session_id'),
        scrolled=scrolled, hit_relation=state['hitRelation'])


def verify_event_target(capture):
    events = capture.get('events') if isinstance(capture, dict) else None
    if capture.get('status') != 'captured' or not isinstance(events, list) or not events:
        raise RuntimeError('ordinary_event_target_unverified')
    relations = [event.get('graph', {}).get('intentRelation') for event in events
                 if isinstance(event, dict) and isinstance(event.get('graph'), dict)]
    accepted = [value for value in relations if value in ('self', 'descendant')]
    if not accepted:
        raise RuntimeError('ordinary_event_target_mismatch')
    return len(accepted)
