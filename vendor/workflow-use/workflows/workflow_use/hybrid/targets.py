"""Fresh DOM target resolution over browser-use public query and live DOM identity APIs."""
import re
from dataclasses import dataclass

from .dom_evidence import node_xpath
from .evidence import digest
from .history_target import HistoryTargetIdentity, match_history_target
from .target_document import target_frame_matches
from .target_preparation import assert_action_target, inspect_action_target, prepare_mapped_target

from .target_contract import (TARGET_ORDINAL_ARGUMENT, validate_target, materialize_target, _nonempty, _validate_scope)
SCROLL_INTO_VIEW_SCRIPT = "() => this.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})"
_PREPARABLE_ERRORS = frozenset({'missing_stable_target', 'missing_item_target'})


@dataclass(frozen=True)
class ResolvedTarget:
    element: object
    node: object
    index: int
    target_id: str | None
    frame_id: str | None




class TargetResolver:
    def __init__(self, browser):
        self.browser = browser

    async def resolve_action_index(self, raw):
        return (await self.prepare_action_target(raw, 'click')).index

    async def prepare_action_target(self, raw, action_name, *, native_dispatch=False):
        target = validate_target(raw)
        page, mapping, target_id = await self._snapshot(target.get('scope'))
        scrolled = False
        try:
            index = await self._resolve_index(target, page, mapping, target_id)
        except ValueError as error:
            if target['strategy'] == 'title' or str(error) not in _PREPARABLE_ERRORS:
                raise
            element = await self._preparable_element(target, page, target_id)
            state = await inspect_action_target(element)
            # WHY：原目标仍唯一存在但中心命中被截获时，保存确定性的 blocked 事实；
            # 不把 DOM 中存在但被遮挡的目标折叠成 selector missing，更不扫描所谓关闭按钮。
            if not native_dispatch and state['inView'] and (state['pointerBlocked'] or state['hitRelation'] == 'outside'):
                assert_action_target(state, action_name)
            backend = await _element_backend(element)
            if self._mapping_matches(backend, mapping, target_id):
                raise ValueError('ambiguous_or_inconsistent_stable_target') from error
            # WHY：只把已唯一定位的当前主文档元素带入原生 selector map；点击仍交给 Tools.act。
            await element.evaluate(SCROLL_INTO_VIEW_SCRIPT)
            scrolled = True
            await self._assert_page_identity(page, target_id, target.get('scope'))
            page, mapping = await self._refresh_snapshot(target_id, target.get('scope'))
            index = await self._resolve_index(target, page, mapping, target_id)
        await self._assert_page_identity(page, target_id, target.get('scope'))
        return await prepare_mapped_target(
            self, target, action_name, page, mapping, target_id, index, scrolled,
            native_dispatch=native_dispatch)

    async def resolve_action_index_from_snapshot(self, raw, mapping, target_id):
        """Resolve against a callback-owned selector map without refreshing it."""
        target = validate_target(raw)
        page = await self.browser.get_current_page()
        if page is None:
            raise ValueError('page_unavailable')
        await self._assert_page_identity(page, target_id, target.get('scope'))
        index = await self._resolve_index(target, page, mapping, target_id)
        await self._assert_page_identity(page, target_id, target.get('scope'))
        return index

    async def _resolve_index(self, target, page, mapping, target_id):
        if target['strategy'] == 'title':
            matches = self._title_matches(target, mapping, target_id)
        elif target['strategy'] == 'history':
            index, node = match_history_target(target['identity'], mapping, target_id)
            matches = [ResolvedTarget(None, node, index, _node_value(node, 'target_id'),
                                      _node_value(node, 'frame_id'))]
        elif target['strategy'] == 'xpath':
            matches = self._xpath_matches(target['value'], mapping, target_id)
        else:
            backend_id = await self._resolve_backend(target, page, mapping, target_id)
            matches = self._mapping_matches(backend_id, mapping, target_id)
        if not matches:
            raise ValueError('missing_stable_target')
        if len(matches) > 1:
            raise ValueError('ambiguous_stable_target')
        return matches[0].index

    async def resolve_element(self, raw):
        target = validate_target(raw)
        if target['strategy'] == 'title':
            raise ValueError('postcondition_locator_required')
        needs_mapping = target['strategy'] in ('xpath', 'structure', 'history')
        page, mapping, target_id = await self._snapshot(target.get('scope'), require_mapping=needs_mapping)
        if target['strategy'] == 'xpath':
            matches = self._xpath_matches(target['value'], mapping, target_id)
            if len(matches) != 1:
                raise ValueError('ambiguous_or_missing_stable_target')
            return await element_from_backend(page, _backend_id(matches[0].node), target_id)
        if target['strategy'] == 'history':
            _index, node = match_history_target(target['identity'], mapping, target_id)
            return await element_from_backend(page, _backend_id(node), target_id)
        backend_id = await self._resolve_backend(target, page, mapping, target_id)
        return await page.get_element(backend_id)

    async def resolve_collection(self, selector, scope=None, *, page=None):
        _nonempty(selector, 'target_query_required')
        if page is None and scope is None:
            page = await self.browser.get_current_page()
            if page is None:
                raise ValueError('page_unavailable')
        elif page is None:
            try:
                page, _, _ = await self._snapshot(scope, require_mapping=False)
            except Exception as error:
                error.add_note('bat_read_collection_snapshot')
                raise
        try:
            return await page.get_elements_by_css_selector(selector)
        except Exception as error:
            # WHY：只标记公开 B-U 集合查询的异常边界；原异常类型、消息和调用栈仍由调用方处理。
            error.add_note('bat_read_collection_query')
            raise

    async def assert_scope(self, scope, expected_target_id=None):
        """Verify a read's live page identity before/after work without duplicating scope rules."""
        _validate_scope(scope)
        page = await self.browser.get_current_page()
        if page is None or not hasattr(page, 'get_target_info'):
            raise ValueError('page_identity_unavailable')
        if expected_target_id is None:
            info = await page.get_target_info()
            expected_target_id = info.get('targetId') if isinstance(info, dict) else None
        if not isinstance(expected_target_id, str) or not expected_target_id:
            raise ValueError('page_identity_unavailable')
        await self._assert_page_identity(page, expected_target_id, scope)
        return expected_target_id

    async def _snapshot(self, scope, require_mapping=True):
        page_before = await self.browser.get_current_page()
        if page_before is None or not hasattr(page_before, 'get_target_info'):
            raise ValueError('page_identity_unavailable')
        before = await page_before.get_target_info()
        target_id = before.get('targetId') if isinstance(before, dict) else None
        if not isinstance(target_id, str) or not target_id:
            raise ValueError('page_identity_unavailable')
        if require_mapping:
            # WHY：普通目标解析只消费新鲜 selector map；截图无消费者，不能让截图等待阻塞定位。
            await self.browser.get_browser_state_summary(include_screenshot=False)
        mapping = await self.browser.get_selector_map() if require_mapping else {}
        page = await self.browser.get_current_page()
        if page is None:
            raise ValueError('page_unavailable')
        await self._assert_page_identity(page, target_id, scope)
        return page, mapping, target_id

    async def _refresh_snapshot(self, target_id, scope):
        await self.browser.get_browser_state_summary(include_screenshot=False)
        mapping = await self.browser.get_selector_map()
        page = await self.browser.get_current_page()
        if page is None:
            raise ValueError('page_unavailable')
        await self._assert_page_identity(page, target_id, scope)
        return page, mapping

    async def _assert_page_identity(self, page, target_id, scope):
        if not hasattr(page, 'get_target_info'):
            raise ValueError('page_identity_unavailable')
        info = await page.get_target_info()
        if not isinstance(info, dict) or info.get('targetId') != target_id:
            raise ValueError('target_document_changed')
        if scope and scope.get('url') is not None:
            live_url = await page.get_url()
            if scope.get('urlDigest') is None:
                matches = live_url == scope['url']
            else:
                matches = digest(live_url) == scope['urlDigest']
            if not matches:
                raise ValueError('target_scope_mismatch')

    async def _resolve_backend(self, target, page, mapping, target_id):
        strategy = target['strategy']
        if strategy == 'entry':
            from .element_entry import resolve_entry_element
            return await _element_backend(await resolve_entry_element(self.browser, target['entry'], target.get('withinEntry')))
        if strategy == 'css':
            elements = await page.get_elements_by_css_selector(target['value'])
            if not elements:
                raise ValueError('missing_stable_target')
            if len(elements) > 1:
                raise ValueError('ambiguous_stable_target')
            return await _element_backend(elements[0])
        if strategy == 'ordinal':
            elements = await page.get_elements_by_css_selector(target['container'])
            return await _ordinal_backend(elements, target['ordinal'])
        return await self._structure_backend(target, page, mapping, target_id)

    async def _preparable_element(self, target, page, target_id):
        strategy = target['strategy']
        if strategy == 'entry':
            from .element_entry import resolve_entry_element
            return await resolve_entry_element(self.browser, target['entry'], target.get('withinEntry'))
        if strategy == 'xpath':
            nodes = await self._main_document_nodes(page, target_id)
            matches = [node for node in nodes if node_xpath(node) == target['value']]
            if not matches:
                raise ValueError('missing_stable_target')
            if len(matches) > 1:
                raise ValueError('ambiguous_stable_target')
            backend = _backend_id(matches[0])
            if type(backend) is not int:
                raise ValueError('element_identity_unavailable')
            return await element_from_backend(page, backend, target_id)
        if strategy == 'structure':
            return await self._preparable_structure_element(target, page, target_id)
        selector = target['value'] if strategy == 'css' else target['container']
        elements = await page.get_elements_by_css_selector(selector)
        if strategy == 'css' and not elements:
            raise ValueError('missing_stable_target')
        if strategy == 'css' and len(elements) > 1:
            raise ValueError('ambiguous_stable_target')
        element = elements[0] if strategy == 'css' else _ordinal_element(elements, target['ordinal'])
        nodes = await self._main_document_nodes(page, target_id)
        _unique_backend_node(nodes, await _element_backend(element), target_id)
        return element

    async def _preparable_structure_element(self, target, page, target_id):
        container_selector = target['container']['value']
        containers = await page.get_elements_by_css_selector(container_selector)
        if not containers:
            raise ValueError('missing_structure_container')
        if len(containers) > 1:
            raise ValueError('ambiguous_structure_container')
        item_selector = _descendant_selector(container_selector, target['items']['value'])
        items = await page.get_elements_by_css_selector(item_selector)
        item = _ordinal_element(items, target['ordinal'])
        nodes = await self._main_document_nodes(page, target_id)
        container_backend, item_backend = await _element_backend(containers[0]), await _element_backend(item)
        _unique_backend_node(nodes, container_backend, target_id)
        item_node = _unique_backend_node(nodes, item_backend, target_id)
        if not _ancestor_has(item_node, container_backend, target_id, None):
            raise ValueError('missing_item_target')
        if target['withinItem'] is None:
            return item
        selector = _descendant_selector(item_selector, target['withinItem']['value'])
        matches = []
        for element in await page.get_elements_by_css_selector(selector):
            backend = await _element_backend(element)
            node = _unique_backend_node(nodes, backend, target_id)
            if _ancestor_has(node, item_backend, target_id, None):
                matches.append(element)
        if not matches:
            raise ValueError('missing_item_target')
        if len(matches) > 1:
            raise ValueError('ambiguous_item_target')
        return matches[0]

    async def _main_document_nodes(self, page, target_id):
        root, _timing = await page.dom_service.get_dom_tree(target_id=target_id, all_frames=None)
        return [node for node in _walk_structural(root) if _current_target(node, target_id)]

    async def _structure_backend(self, target, page, mapping, target_id):
        container_selector = target['container']['value']
        containers = await page.get_elements_by_css_selector(container_selector)
        if not containers:
            raise ValueError('missing_structure_container')
        if len(containers) > 1:
            raise ValueError('ambiguous_structure_container')
        container_backend = await _element_backend(containers[0])
        item_selector = _descendant_selector(container_selector, target['items']['value'])
        items = await page.get_elements_by_css_selector(item_selector)
        item_backend = await _ordinal_backend(items, target['ordinal'])
        if target['withinItem'] is None:
            candidates = self._mapping_matches(item_backend, mapping, target_id)
        else:
            selector = _descendant_selector(item_selector, target['withinItem']['value'])
            elements = await page.get_elements_by_css_selector(selector)
            candidates = await self._contained_candidates(elements, mapping, target_id, item_backend)
        candidates = [item for item in candidates if _ancestor_has(
            item.node, container_backend, target_id, item.frame_id)]
        if not candidates:
            raise ValueError('missing_item_target')
        if len(candidates) > 1:
            raise ValueError('ambiguous_item_target')
        return _backend_id(candidates[0].node)

    async def _contained_candidates(self, elements, mapping, target_id, item_backend):
        found = []
        for element in elements:
            backend = await _element_backend(element)
            for candidate in self._mapping_matches(backend, mapping, target_id):
                if _ancestor_has(candidate.node, item_backend, target_id, candidate.frame_id):
                    found.append(candidate)
        return found

    def _mapping_matches(self, backend_id, mapping, target_id):
        return [ResolvedTarget(None, node, int(index), _node_value(node, 'target_id'), _node_value(node, 'frame_id'))
                for index, node in mapping.items()
                if _backend_id(node) == backend_id and _current_target(node, target_id)]

    def _xpath_matches(self, xpath, mapping, target_id):
        return [ResolvedTarget(None, node, int(index), _node_value(node, 'target_id'), _node_value(node, 'frame_id'))
                for index, node in mapping.items()
                if _node_value(node, 'xpath') == xpath and _current_target(node, target_id)]

    def _title_matches(self, target, mapping, target_id):
        matches = []
        for index, node in mapping.items():
            ax = _node_value(node, 'ax_node')
            if ax is None or not _current_target(node, target_id):
                continue
            role, name = _node_value(ax, 'role'), _node_value(ax, 'name')
            if role == target['role'] and name == target['name'] and _node_value(node, 'is_visible') is not False:
                matches.append(ResolvedTarget(None, node, int(index), _node_value(node, 'target_id'),
                                              _node_value(node, 'frame_id')))
        return matches


async def _element_backend(element):
    info = await element.get_basic_info()
    backend = info.get('backendNodeId') if isinstance(info, dict) else info.backendNodeId
    if type(backend) is not int:
        raise ValueError('element_identity_unavailable')
    return backend


async def element_from_backend(page, backend_id, target_id):
    """Initialize the actor Page DOM session before wrapping a proven backend node."""
    if type(backend_id) is not int or not isinstance(target_id, str) or not target_id:
        raise ValueError('element_identity_unavailable')
    before = await page.get_target_info()
    if not isinstance(before, dict) or before.get('targetId') != target_id:
        raise ValueError('target_document_changed')
    roots = await page.get_elements_by_css_selector('html')
    after = await page.get_target_info()
    if len(roots) != 1:
        raise ValueError('page_document_unavailable')
    if not isinstance(after, dict) or after.get('targetId') != target_id:
        raise ValueError('target_document_changed')
    return await page.get_element(backend_id)


async def _ordinal_backend(elements, ordinal):
    return await _element_backend(_ordinal_element(elements, ordinal))


def _ordinal_element(elements, ordinal):
    if ordinal > len(elements):
        raise ValueError('target_position_unavailable')
    return elements[ordinal - 1]


def _unique_backend_node(nodes, backend_id, target_id):
    if type(backend_id) is not int:
        raise ValueError('element_identity_unavailable')
    matches = [node for node in nodes if _backend_id(node) == backend_id and _current_target(node, target_id)]
    if len(matches) != 1:
        raise ValueError('element_identity_unavailable')
    return matches[0]


def _walk_structural(root):
    # WHY：原生根节点与 html 的 frame 标记可能不同；只走 children_nodes，且不进入 iframe/shadow 专属字段。
    pending, seen = [root], set()
    while pending:
        node = pending.pop()
        if node is None or id(node) in seen:
            continue
        seen.add(id(node))
        yield node
        pending.extend(reversed(_node_value(node, 'children_nodes') or []))


def _descendant_selector(parent, child):
    if child.lstrip().startswith(('>', '+', '~')):
        raise ValueError('unsupported_relative_selector')
    # WHY: :is() preserves selector-list grouping while the browser remains the only selector parser.
    return f':is({parent}) :is({child})'


def _backend_id(node):
    return _node_value(node, 'backend_node_id', 'backendNodeId')


def _node_value(node, *names):
    for name in names:
        if isinstance(node, dict) and name in node:
            return node[name]
        if hasattr(node, name):
            return getattr(node, name)
    return None


def _current_target(node, target_id):
    return (isinstance(target_id, str) and _node_value(node, 'target_id') == target_id
            and target_frame_matches(node, target_id, None)
            and _node_value(node, 'shadow_root_type') is None)


def _ancestor_has(node, backend_id, target_id, frame_id):
    current, seen = node, set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if (_node_value(current, 'target_id') != target_id or not target_frame_matches(current, target_id, frame_id)
                or _node_value(current, 'shadow_root_type') is not None):
            return False
        if _backend_id(current) == backend_id:
            return True
        current = _node_value(current, 'parent_node')
    return False
