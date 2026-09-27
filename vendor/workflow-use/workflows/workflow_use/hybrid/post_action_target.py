"""Refresh one callback target only through a pre-verified stable query."""
import re
from dataclasses import dataclass, replace

from .collection_structure import query_targets_share_collection
from .dom_evidence import CollectionReadRequired, node_tag, node_value
from .evidence import digest
from .history_target import HistoryTargetIdentity, capture_history_target, match_history_target
from .natural_reads import read_fields_with_proof
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


async def verified_collection_query(browser, summary, identity, queries, selector_index):
    """Find a complete query whose clicked item belongs to a local repeated collection."""
    page = await _same_page(browser, summary, identity)
    unscoped_match = False
    for query, verified in reversed(queries):
        scope = query.scope
        if (query.complete is not True or query.query.kind != 'css' or query.truncated is not False
                or scope.tabId != identity.target_id or scope.frameId is not None
                or scope.urlDigest != digest(identity.url) or verified.actionRef != query.actionRef
                or verified.targetId != identity.target_id or verified.urlDigest != scope.urlDigest
                or verified.stable is not True):
            continue
        elements = await page.get_elements_by_css_selector(query.query.value)
        if len(elements) != query.total:
            continue
        backends = [await _element_backend(element) for element in elements]
        matches = [index + 1 for index, backend in enumerate(backends)
                   if backend == identity.backend]
        if len(matches) == 1:
            # WHY：全页控件查询即使完整，也不证明点击的是该业务列表的一项。
            # 单例精确查询可以独立成立；多项查询须属于同一重复条目的对应目标。
            if query.total > 1 and not _has_matching_peer(
                    summary, selector_index, set(backends)):
                unscoped_match = True
                continue
            try:
                output, ids_digest = await read_fields_with_proof(browser, verified.specification,
                    {'targetId': identity.target_id, 'url': identity.url})
            except Exception as error:
                raise CollectionReadRequired() from error
            if ids_digest != verified.containerIdsDigest or digest(output) != digest(verified.output):
                raise CollectionReadRequired()
            target = {'strategy': 'structure', 'container': {'kind': 'css', 'value': 'html'},
                      'items': {'kind': 'css', 'value': query.query.value},
                      'ordinal': matches[0], 'withinItem': None, 'readActionRef': query.actionRef}
            return replace(identity, selector=query.query.value), target
    if unscoped_match:
        raise CollectionReadRequired()
    return identity, None


def _has_matching_peer(summary, selector_index, backends):
    return query_targets_share_collection(_selector_node(summary, selector_index), backends)


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


async def retained_action_target_element(browser, summary, identity, element):
    """Return only the exact pre-dispatch element while the document identity is unchanged."""
    if element is None or not isinstance(identity, CapturedTargetIdentity):
        raise ValueError('target_refresh_identity_unavailable')
    # WHY：动作后出现的 overlay 会把原控件移出交互 selector map，但不应抹掉
    # 对刚派发目标的只读完成核验。这里只复用同一回调元素；后续动作仍重新解析并检查命中。
    await _same_page(browser, summary, identity)
    return element


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
