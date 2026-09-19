"""Refresh one callback target only through a pre-verified stable query."""
import re
from dataclasses import dataclass, replace

from .dom_evidence import node_tag, node_value
from .history_target import HistoryTargetIdentity, capture_history_target, match_history_target
from .targets import element_from_backend

IDENTITY_ATTRIBUTES = ('type', 'role', 'id', 'name', 'data-testid', 'aria-label', 'title')
TARGET_OBSERVATION_REASONS = frozenset({'target_refresh_identity_unavailable',
    'target_refresh_not_unique', 'target_refresh_page_changed', 'page_unavailable',
    'target_state_unavailable', 'target_state_detached',
    'target_value_unavailable', 'target_value_detached'})


def target_observation_diagnostic(action_ref, stage, error):
    # WHY：只保留可归因的枚举诊断；诊断事实不能冒充浏览器效果证明。
    reason = str(error)
    return {'actionRef': action_ref, 'stage': stage,
            'reason': reason if reason in TARGET_OBSERVATION_REASONS else 'unavailable'}


@dataclass(frozen=True)
class CapturedTargetIdentity:
    target_id: str
    url: str
    tag: str
    attributes: dict[str, str]
    backend: int
    history: HistoryTargetIdentity
    selector: str | None = None


def capture_target_identity(summary, selector_index, target_id):
    node = _selector_node(summary, selector_index)
    _require_main_document(node, target_id)
    tag = node_tag(node)
    raw_attributes = node_value(node, 'attributes') or {}
    if not tag or not isinstance(raw_attributes, dict):
        raise ValueError('target_refresh_identity_unavailable')
    attributes = {}
    for name in IDENTITY_ATTRIBUTES:
        if name not in raw_attributes:
            continue
        value = raw_attributes[name]
        if not isinstance(value, str):
            raise ValueError('target_refresh_identity_unavailable')
        attributes[name] = value
    url = getattr(summary, 'url', None)
    if not isinstance(url, str) or not url:
        raise ValueError('target_refresh_identity_unavailable')
    backend = _node_backend(node)
    return CapturedTargetIdentity(target_id=target_id, url=url, tag=tag,
                                  attributes=attributes, backend=backend,
                                  history=capture_history_target(node))


async def verified_labeled_query(browser, summary, identity):
    """Admit a semantic CSS target only when it selects the callback node uniquely."""
    label = identity.attributes.get('aria-label')
    selector = _labeled_selector(identity.tag, label)
    if selector is None:
        return identity, None
    page = await _same_page(browser, summary, identity)
    elements = await page.get_elements_by_css_selector(selector)
    if len(elements) != 1 or await _element_backend(elements[0]) != identity.backend:
        return identity, None
    target = {'strategy': 'structure', 'container': {'kind': 'css', 'value': 'html'},
              'items': {'kind': 'css', 'value': selector}, 'ordinal': 1, 'withinItem': None}
    return replace(identity, selector=selector), target


async def callback_target_element(browser, summary, selector_index, target_id):
    node = _selector_node(summary, selector_index)
    _require_main_document(node, target_id)
    return await _element(browser, node, target_id)


async def refreshed_target_element(browser, summary, identity):
    if not isinstance(identity, CapturedTargetIdentity):
        raise ValueError('target_refresh_identity_unavailable')
    await _same_page(browser, summary, identity)
    mapping = getattr(getattr(summary, 'dom_state', None), 'selector_map', {}) or {}
    try:
        _index, node = match_history_target(
            identity.history.model_dump(mode='json'), mapping, identity.target_id)
    except ValueError:
        raise ValueError('target_refresh_not_unique') from None
    return await _element(browser, node, identity.target_id)


def _selector_node(summary, selector_index):
    mapping = getattr(getattr(summary, 'dom_state', None), 'selector_map', {}) or {}
    node = mapping.get(selector_index, mapping.get(str(selector_index)))
    if node is None:
        raise ValueError('target_refresh_identity_unavailable')
    return node


def _require_main_document(node, target_id):
    if (not isinstance(target_id, str) or not target_id
            or node_value(node, 'target_id') != target_id
            or node_value(node, 'frame_id') is not None
            or node_value(node, 'shadow_root_type') is not None):
        raise ValueError('target_refresh_identity_unavailable')


async def _element(browser, node, target_id):
    backend = _node_backend(node)
    page = await browser.get_current_page()
    if page is None:
        raise ValueError('page_unavailable')
    return await element_from_backend(page, backend, target_id)


async def _same_page(browser, summary, identity):
    if browser.agent_focus_target_id != identity.target_id or getattr(summary, 'url', None) != identity.url:
        raise ValueError('target_refresh_page_changed')
    page = await browser.get_current_page()
    if page is None or await page.get_url() != identity.url:
        raise ValueError('target_refresh_page_changed')
    return page


def _labeled_selector(tag, label):
    if (not isinstance(label, str) or not label or re.fullmatch(r'[A-Za-z][A-Za-z0-9-]*', tag) is None
            or any(ord(character) < 32 or ord(character) == 127 for character in label)):
        return None
    escaped = label.replace('\\', '\\\\').replace('"', '\\"')
    return f'{tag}[aria-label="{escaped}"]'


async def _element_backend(element):
    info = await element.get_basic_info()
    value = info.get('backendNodeId') if isinstance(info, dict) else getattr(info, 'backendNodeId', None)
    if type(value) is not int:
        raise ValueError('target_refresh_identity_unavailable')
    return value


def _node_backend(node):
    value = _node_backend_or_none(node)
    if type(value) is not int:
        raise ValueError('target_refresh_identity_unavailable')
    return value


def _node_backend_or_none(node):
    value = node_value(node, 'backend_node_id')
    return node_value(node, 'backendNodeId') if value is None else value
