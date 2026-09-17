"""Adapt selected shadow-DOM fields through browser-use's native DOM snapshot."""
from browser_use.dom.service import DomService
from browser_use.dom.views import NodeType


class FieldReadError(ValueError):
    def __init__(self, code, *, field_name=None, match_count=None, reason=None):
        super().__init__(code)
        self.field_name = field_name
        self.match_count = match_count
        self.reason = reason


async def replace_shadow_text(browser, container, projection, projected, context):
    pending = [(field, projected[field['name']]) for field in projection
               if field['attribute'] is None
               and any(item['hasShadow'] and item['value'] is not None
                       for item in projected[field['name']]['values'])]
    if not pending:
        return projected
    page = await browser.get_current_page()
    if page is None:
        raise FieldReadError('read_field_native_projection_failed', reason='page_unavailable')
    target = await page.get_target_info()
    target_id = target.get('targetId') if isinstance(target, dict) else None
    info = await container.get_basic_info()
    backend = info.get('backendNodeId') if isinstance(info, dict) else None
    if not isinstance(target_id, str) or type(backend) is not int:
        raise FieldReadError('read_field_native_projection_failed', reason='container_identity_unavailable')
    session, backend_index = await _native_context(browser, page, target_id, context)
    container_node = await _push_backend(session, backend)
    selected = await _selected_backends(session, container_node, pending)
    for (field_name, value_index), field_backend in selected.items():
        nodes = backend_index.get(field_backend, [])
        if len(nodes) != 1:
            raise FieldReadError('read_field_native_projection_failed', field_name=field_name,
                                 match_count=len(projected[field_name]['values']),
                                 reason='field_identity_ambiguous')
        projected[field_name]['values'][value_index]['value'] = _visible_text(nodes[0])
    after = await page.get_target_info()
    if not isinstance(after, dict) or after.get('targetId') != target_id:
        raise FieldReadError('read_field_native_projection_failed', reason='page_identity_changed')
    return projected


async def _native_context(browser, page, target_id, context):
    if not context:
        session = await browser.get_or_create_cdp_session(target_id=target_id, focus=False)
        await session.cdp_client.send.DOM.getDocument(params={'depth': 0}, session_id=session.session_id)
        root, _timing = await page.dom_service.get_dom_tree(target_id=target_id, all_frames=None)
        context.update(targetId=target_id, session=session, index=_target_backend_index(root, target_id))
    if context.get('targetId') != target_id:
        raise FieldReadError('read_field_native_projection_failed', reason='page_identity_changed')
    return context['session'], context['index']


async def _push_backend(session, backend):
    result = await session.cdp_client.send.DOM.pushNodesByBackendIdsToFrontend(
        params={'backendNodeIds': [backend]}, session_id=session.session_id)
    nodes = result.get('nodeIds', [])
    if len(nodes) != 1 or type(nodes[0]) is not int:
        raise FieldReadError('read_field_native_projection_failed', reason='container_mapping_failed')
    return nodes[0]


async def _selected_backends(session, container_node, pending):
    selected = {}
    for field, result in pending:
        queried = await session.cdp_client.send.DOM.querySelectorAll(
            params={'nodeId': container_node, 'selector': field['selector']},
            session_id=session.session_id)
        node_ids = ([container_node] if result['selfMatched'] else []) + queried.get('nodeIds', [])
        values = result['values']
        node_ids = node_ids[:len(values)]
        if len(node_ids) != len(values):
            raise FieldReadError('read_field_native_projection_failed', field_name=field['name'],
                                 match_count=len(values), reason='selector_mapping_changed')
        for index, item in enumerate(values):
            if not item['hasShadow'] or item['value'] is None:
                continue
            described = await session.cdp_client.send.DOM.describeNode(
                params={'nodeId': node_ids[index]}, session_id=session.session_id)
            backend = described.get('node', {}).get('backendNodeId')
            if type(backend) is not int:
                raise FieldReadError('read_field_native_projection_failed', field_name=field['name'],
                                     match_count=len(values), reason='field_identity_unavailable')
            selected[(field['name'], index)] = backend
    return selected


def _target_backend_index(root, target_id):
    matches = {}

    def visit(node):
        if node.target_id == target_id:
            matches.setdefault(node.backend_node_id, []).append(node)
        for child in node.children_and_shadow_roots:
            visit(child)

    visit(root)
    return matches


def _visible_text(node):
    values = []

    def visit(current):
        if current.node_type == NodeType.ELEMENT_NODE and not DomService.is_element_visible_according_to_all_parents(
                current, html_frames=[], viewport_threshold=None):
            return
        if current.node_type == NodeType.TEXT_NODE:
            if DomService.is_element_visible_according_to_all_parents(
                    current, html_frames=[], viewport_threshold=None):
                value = current.node_value.strip()
                if value:
                    values.append(value)
            return
        for child in current.children_and_shadow_roots:
            visit(child)

    visit(node)
    if not values:
        raise FieldReadError('read_field_not_text', reason='no_visible_native_text')
    # WHY：原生快照拥有可见性和树顺序；这里只在相邻可见 TEXT_NODE 间恢复分隔，不计算 CSS。
    return ' '.join(values)
