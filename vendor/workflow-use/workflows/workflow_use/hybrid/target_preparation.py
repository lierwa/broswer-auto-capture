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
    document_id: str
    center_x: float
    center_y: float
    viewport_width: float
    viewport_height: float
    coordinate_scope: str
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
  let x = inView ? (left + right) / 2 : 0;
  let y = inView ? (top + bottom) / 2 : 0;
  let hit = inView ? document.elementFromPoint(x, y) : null;
  const root = this.getRootNode();
  const relation = hit => hit === this ? 'self' : hit && this.contains(hit) ? 'descendant'
    : root instanceof ShadowRoot && hit === root.host ? 'composed' : 'outside';
  let hitRelation = relation(hit);
  // WHY：多行 inline 的联合框中心可能位于行间空白；用浏览器原生片段证明同一目标命中。
  // TRADE-OFF：只接受本元素/子元素的真实命中，实际遮挡仍失败，不使用 JS click。
  if (inView && hitRelation === 'outside') {
    let bestArea = 0;
    for (const part of this.getClientRects()) {
      const l = Math.max(0, part.left), r = Math.min(innerWidth, part.right);
      const t = Math.max(0, part.top), b = Math.min(innerHeight, part.bottom);
      const area = Math.max(0, r-l) * Math.max(0, b-t);
      const px = (l+r)/2, py = (t+b)/2;
      const candidate = area > 0 ? document.elementFromPoint(px, py) : null;
      if (area > bestArea && relation(candidate) !== 'outside') {
        bestArea = area; x = px; y = py; hit = candidate; hitRelation = relation(hit);
      }
    }
  }
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
  const identityKey = '__bat_document_identity_v1__';
  if (!globalThis[identityKey]) globalThis[identityKey] = crypto.randomUUID();
  let centerX = x;
  let centerY = y;
  let viewportWidth = innerWidth;
  let viewportHeight = innerHeight;
  let coordinateScope = 'top';
  let currentWindow = globalThis;
  try {
    while (currentWindow !== currentWindow.top) {
      if (currentWindow.location.origin !== currentWindow.parent.location.origin) {
        coordinateScope = 'unsupported';
        break;
      }
      const frame = currentWindow.frameElement;
      if (!(frame instanceof currentWindow.parent.HTMLElement)) {
        coordinateScope = 'unsupported';
        break;
      }
      const frameRect = frame.getBoundingClientRect();
      centerX += frameRect.left;
      centerY += frameRect.top;
      currentWindow = currentWindow.parent;
      coordinateScope = 'same_origin_mapped';
      viewportWidth = currentWindow.innerWidth;
      viewportHeight = currentWindow.innerHeight;
    }
  } catch (_) {
    coordinateScope = 'unsupported';
  }
  return {connected, visible, inView, hitRelation, disabled, readOnly, pointerBlocked,
    documentId: globalThis[identityKey], center: {x:centerX, y:centerY},
    viewport: {width:viewportWidth, height:viewportHeight}, coordinateScope,
    scrollContainer: scrollContainer || {tag:'window', id:null, scrollTop:scrollY, scrollLeft:scrollX}};
}"""

async def current_document_id(browser, *, page=None):
    page = page if page is not None else await browser.get_current_page()
    if page is None:
        raise ValueError('page_unavailable')
    try:
        roots = await page.get_elements_by_css_selector('html')
        if len(roots) != 1:
            raise ValueError('target_document_identity_unavailable')
        value = (await inspect_action_target(roots[0]))['documentId']
    except Exception as error:
        raise ValueError('target_document_identity_unavailable') from error
    if not isinstance(value, str) or not value:
        raise ValueError('target_document_identity_unavailable')
    return value


async def inspect_action_target(element):
    try:
        value = json.loads(await element.evaluate(TARGET_PREPARATION_SCRIPT))
    except Exception as error:
        raise ValueError('target_preparation_unavailable') from error
    required = {'connected', 'visible', 'inView', 'hitRelation', 'disabled', 'readOnly',
                'pointerBlocked', 'documentId', 'center', 'viewport', 'coordinateScope',
                'scrollContainer'}
    if (not isinstance(value, dict) or set(value) != required
            or any(type(value[key]) is not bool for key in (
                'connected', 'visible', 'inView', 'disabled', 'readOnly', 'pointerBlocked'))
            or value['hitRelation'] not in ('self', 'descendant', 'composed', 'outside')
            or not isinstance(value['documentId'], str) or not value['documentId']
            or not _point(value['center']) or not _viewport(value['viewport'])
            or value['coordinateScope'] not in ('top', 'same_origin_mapped', 'unsupported')
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
        error = ValueError('target_hit_blocked')
        # WHY：只保留固定几何/状态诊断，才能区分命中准备错误与实际遮挡；不记录页面/节点内容。
        error.diagnostic = {'pointerBlocked': state['pointerBlocked'], 'hitRelation': state['hitRelation'],
                            'center': state['center'], 'viewport': state['viewport'],
                            'scrollTop': state['scrollContainer'].get('scrollTop')}
        raise error


async def prepare_mapped_target(resolver, target, action_name, page, mapping, target_id, index, scrolled,
                                *, native_dispatch=False):
    # Delayed import keeps target parsing and target preparation as separate modules without duplicating helpers.
    from .targets import (SCROLL_INTO_VIEW_SCRIPT, _backend_id, _current_target, _node_value,
                          element_from_backend)
    node = mapping.get(index, mapping.get(str(index)))
    backend_id = _backend_id(node)
    if type(backend_id) is not int or not _current_target(node, target_id):
        raise ValueError('element_identity_unavailable')
    element = await element_from_backend(page, backend_id, target_id)
    state = await inspect_action_target(element)
    if not native_dispatch and not state['inView']:
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
    # WHY：原生动作的可操作性与后备由 B-U watchdog 拥有；宿主只保留身份和派发后事件校验。
    # 来源：eb4126921bea3373f91afc49fb4b59d6eda7fed6 default_action_watchdog.py。
    if not state['connected']:
        raise ValueError('target_detached')
    if not native_dispatch:
        assert_action_target(state, action_name)
    await resolver._assert_page_identity(page, target_id, target.get('scope'))
    return PreparedActionTarget(
        index=index, element=element, backend_id=backend_id, target_id=target_id,
        frame_id=_node_value(node, 'frame_id'), session_id=_node_value(node, 'session_id'),
        document_id=state['documentId'], center_x=state['center']['x'], center_y=state['center']['y'],
        viewport_width=state['viewport']['width'], viewport_height=state['viewport']['height'],
        coordinate_scope=state['coordinateScope'],
        scrolled=scrolled, hit_relation=state['hitRelation'])


def verify_event_target(capture, *, require_trusted=False):
    events = capture.get('events') if isinstance(capture, dict) else None
    if capture.get('status') != 'captured' or not isinstance(events, list) or not events:
        raise event_target_error('ordinary_event_target_unverified', capture)
    relations = [event.get('graph', {}).get('intentRelation') for event in events
                 if isinstance(event, dict) and isinstance(event.get('graph'), dict)]
    accepted_events = [event for event in events if event.get('graph', {}).get('intentRelation')
                       in ('self', 'descendant', 'composed')]
    accepted = [event.get('graph', {}).get('intentRelation') for event in accepted_events]
    if not accepted:
        raise event_target_error('ordinary_event_target_mismatch', capture)
    if require_trusted and not any(event.get('event', {}).get('isTrusted') is True
                                   for event in accepted_events):
        raise event_target_error('ordinary_event_untrusted', capture)
    return len(accepted)


def event_target_error(code, capture):
    return attach_event_capture(RuntimeError(code), capture)


def attach_event_capture(error, capture):
    # WHY：原动作异常同样保留已完成的采集摘要；不替换错误/取消、不覆盖原有更具体的诊断。
    if getattr(error, 'event_capture', None) is not None:
        return error
    status = capture.get('status') if isinstance(capture, dict) else None
    events = capture.get('events', []) if isinstance(capture, dict) else None
    limitations = capture.get('limitations', []) if isinstance(capture, dict) else None
    # WHY：只保留原采集的状态和数量，不能把节点、正文或输入值放入错误诊断，也不补造成功事件。
    if (status in {'missing', 'captured', 'listener_unavailable', 'not_applicable'}
            and isinstance(events, list) and isinstance(limitations, list)):
        error.event_capture = {'status': status, 'events': len(events), 'limitations': len(limitations)}
    return error


def _point(value):
    return (isinstance(value, dict) and set(value) == {'x', 'y'}
            and all(type(value[key]) in (int, float) for key in ('x', 'y')))


def _viewport(value):
    return (isinstance(value, dict) and set(value) == {'width', 'height'}
            and all(type(value[key]) in (int, float) and value[key] > 0
                    for key in ('width', 'height')))
