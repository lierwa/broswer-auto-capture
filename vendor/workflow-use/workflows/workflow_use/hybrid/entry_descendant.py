"""Freeze a unique record-local locator; native browser APIs still resolve and click it."""
from dataclasses import dataclass

from .record_projection_dom import _identity, _relative_selector, _path
from .targets import _walk_structural
from .record_projection_snapshot import _enhanced_root
from .post_action_target import _selector_node


@dataclass(frozen=True)
class EntryDescendant:
    record_backend: int
    target_backend: int
    target_id: str
    selector: str


def capture_entry_descendants(summary, selector_index, target_id, input_value, input_schema):
    from .element_entry import entry_inputs
    inputs = list(entry_inputs(input_value, input_schema))
    if not inputs:
        return ()
    target = _selector_node(summary, selector_index)
    identity = _identity(target)
    if identity is None or identity[0] != target_id:
        return ()
    # WHY：父容器的可见性不决定可见子控件是否属于输入记录；归属沿完整原生DOM，点击可见性仍由Actor检查。
    nodes = {_identity(node): node for node in _walk_structural(_enhanced_root(summary)) if _identity(node) is not None}
    output = []
    for _, entry in inputs:
        root = nodes.get((target_id, entry.backendNodeId))
        if root is None or not _path(root, target):
            continue
        selector = _relative_selector([root], [[target]])
        if selector and selector.startswith(':scope > '):
            # WHY：只冻结当前快照中记录内唯一控件；公共祖先或其它记录永远没有这种绑定。
            output.append(EntryDescendant(entry.backendNodeId, identity[1], target_id, selector))
    return tuple(output)


async def resolve_entry_descendant(browser, entry, selector):
    from .element_entry import entry_document_id
    page = await browser.get_current_page()
    info = await page.get_target_info()
    if not selector.startswith(':scope > ') or ',' in selector:
        raise ValueError('entry_descendant_unavailable')
    cdp = await browser.get_or_create_cdp_session(target_id=info['targetId'], focus=False)
    await cdp.cdp_client.send.DOM.getDocument(params={'depth': 0}, session_id=cdp.session_id)
    pushed = await cdp.cdp_client.send.DOM.pushNodesByBackendIdsToFrontend(
        params={'backendNodeIds': [entry.backendNodeId]}, session_id=cdp.session_id)
    roots = pushed['nodeIds']
    if len(roots) != 1 or not roots[0]:
        raise ValueError('entry_descendant_unavailable')
    # WHY：直接在输入 backend 根内执行 Chrome 原生查询；同文档重排不能把 nth-child 位置换成另一条记录。
    result = await cdp.cdp_client.send.DOM.querySelectorAll(
        params={'nodeId': roots[0], 'selector': selector}, session_id=cdp.session_id)
    matches = result['nodeIds']
    if len(matches) != 1:
        raise ValueError('entry_descendant_missing_or_ambiguous')
    # WHY：frontend ID只属于本次原生DOM查询；根身份查询会刷新DOM，必须先转为稳定backend再核验文档。
    described = await cdp.cdp_client.send.DOM.describeNode(
        params={'nodeId': matches[0]}, session_id=cdp.session_id)
    if info['targetId'][-4:] != entry.tabId or await page.get_url() != entry.url \
            or await entry_document_id(page) != entry.documentRootId:
        raise ValueError('entry_source_page_changed')
    return await page.get_element(described['node']['backendNodeId'])
