"""Bounded live facts for natural browser effects, shared by source capture and replay verification.

Product Alignment:
- natural-language task: observe menu/form state, scrolling and visible overlays after a browser action.
- reusable chain boundary: fixed public Page/Element reads returning deterministic strings.
- runtime inputs: an already resolved target when the fact is target-scoped.
- dynamic task outputs: current-run state strings; no page text or arbitrary attributes.
- generic platform capability used: browser-use Page/Element public APIs.
- replay model calls: 0.
- site/task-specific code added: no.
"""
import json
import math

from .evidence import digest

OVERLAY_SELECTOR = 'dialog,[role="dialog"],[role="menu"],[role="listbox"],[popover]'
TARGET_STATE_SCRIPT = """() => {
  const output = {connected: Boolean(this.isConnected)};
  for (const name of ['aria-expanded', 'aria-checked', 'aria-selected', 'aria-disabled']) {
    const value = this.getAttribute(name);
    if (value === 'true' || value === 'false') output[name] = value === 'true';
  }
  for (const name of ['checked', 'selected', 'disabled']) {
    if (name in this && typeof this[name] === 'boolean') output[name] = this[name];
  }
  return output;
}"""
TARGET_VALUE_SCRIPT = '() => ({connected:Boolean(this.isConnected),value:this.value})'
SCROLL_POSITION_SCRIPT = '() => ({x: window.scrollX, y: window.scrollY})'


async def read_target_state(element) -> str:
    """Read only fixed boolean control state from a callback-owned or freshly resolved Element."""
    value = _object(await element.evaluate(TARGET_STATE_SCRIPT), 'target_state_unavailable')
    connected = value.pop('connected', None)
    if type(connected) is not bool:
        raise ValueError('target_state_unavailable')
    if not connected:
        raise ValueError('target_state_detached')
    allowed = {'aria-expanded', 'aria-checked', 'aria-selected', 'aria-disabled',
               'checked', 'selected', 'disabled'}
    if set(value) - allowed or any(type(item) is not bool for item in value.values()):
        raise ValueError('target_state_unavailable')
    return _canonical(value)


async def read_target_value(element):
    """Read value and connectedness atomically so a detached control cannot publish stale evidence."""
    value = _object(await element.evaluate(TARGET_VALUE_SCRIPT), 'target_value_unavailable')
    if set(value) != {'connected', 'value'} or type(value['connected']) is not bool:
        raise ValueError('target_value_unavailable')
    if not value['connected']:
        raise ValueError('target_value_detached')
    return value['value']


async def read_page_effect(kind, page) -> str:
    if kind == 'scroll_position':
        value = _object(await page.evaluate(SCROLL_POSITION_SCRIPT), 'scroll_position_unavailable')
        if set(value) != {'x', 'y'} or any(not _coordinate(value[key]) for key in ('x', 'y')):
            raise ValueError('scroll_position_unavailable')
        return _canonical({key: 0 if value[key] == 0 else value[key] for key in ('x', 'y')})
    if kind == 'visible_overlays':
        return await visible_overlay_digest(page)
    raise ValueError('unsupported_natural_effect_fact')


async def visible_overlay_digest(page) -> str:
    before = await page.get_target_info()
    target_id = _value(before, 'targetId')
    if not isinstance(target_id, str) or not target_id:
        raise ValueError('visible_overlays_identity_unavailable')
    backend_ids = set()
    for element in await page.get_elements_by_css_selector(OVERLAY_SELECTOR):
        info = await element.get_basic_info()
        backend = _value(info, 'backendNodeId')
        if type(backend) is not int:
            raise ValueError('visible_overlays_identity_unavailable')
        backend_ids.add(backend)
    root, _timing = await page.dom_service.get_dom_tree(target_id=target_id, all_frames=None)
    after = await page.get_target_info()
    if _value(after, 'targetId') != target_id:
        raise ValueError('visible_overlays_identity_changed')
    identities, nodes = [], list(_walk_dom(root))
    for backend in backend_ids:
        matches = [node for node in nodes if _value(node, 'backend_node_id') == backend
                   and _value(node, 'target_id') == target_id]
        if len(matches) != 1 or type(_value(matches[0], 'is_visible')) is not bool:
            raise ValueError('visible_overlays_identity_unavailable')
        node = matches[0]
        if _value(node, 'is_visible') is False:
            continue
        attributes = _value(node, 'attributes') or {}
        identity = {'backendNodeId': backend, 'nodeName': str(_value(node, 'node_name') or '').lower(),
                    'role': attributes.get('role') if isinstance(attributes, dict) else None}
        identities.append(digest(identity))
    return digest(sorted(identities))


def _object(raw, error):
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        raise ValueError(error) from None
    if not isinstance(value, dict):
        raise ValueError(error)
    return value


def _coordinate(value):
    return type(value) in (int, float) and math.isfinite(value)


def _walk_dom(root):
    pending, seen = [root], set()
    while pending:
        node = pending.pop()
        if node is None or id(node) in seen:
            continue
        seen.add(id(node))
        yield node
        pending.extend(_value(node, 'children_nodes') or [])
        pending.extend(_value(node, 'shadow_roots') or [])
        content = _value(node, 'content_document')
        if content is not None:
            pending.append(content)


def _value(value, name):
    return value.get(name) if isinstance(value, dict) else getattr(value, name, None)


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
