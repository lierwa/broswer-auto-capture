"""Local repeated-item relationships from the existing Browser-Use DOM snapshot."""
from .dom_evidence import ancestor_chain, node_tag, node_value, structural_children
from .targets import _walk_structural

ITEM_TAGS = frozenset({'li', 'tr', 'option', 'article', 'section'})
ITEM_ROLES = frozenset({'listitem', 'row', 'option', 'treeitem'})


def repeated_item_without_query(structure):
    if structure.get('queryCandidate') is not None:
        return False
    nodes = {node['id']: node for node in structure.get('nodes', [])}
    current = nodes.get(structure.get('targetRef'))
    coverage = (structure.get('coverage') or {}).get('childSets', [])
    seen = set()
    while current is not None and current['id'] not in seen:
        seen.add(current['id'])
        parent = nodes.get(current.get('parentRef'))
        if parent is None:
            return False
        truncated = any(item.get('parentRef') == parent['id'] and item.get('truncated')
                        for item in coverage)
        peers = [node for node in nodes.values() if node.get('parentRef') == parent['id']
                 and node['id'] != current['id']]
        # WHY：一次点击的祖先 section/card 也可能是动态条目；目标的直接父节点
        # 只有一个链接，并不能证明该链接是固定业务身份。只使用已捕获的结构边界。
        if not truncated and any(same_shape(current, peer) for peer in peers):
            return True
        current = parent
    return False


def query_targets_share_collection(target, backends):
    ancestors, cycled, _boundary = ancestor_chain(target)
    if cycled:
        return False
    for item in reversed(ancestors):
        parent = node_value(item, 'parent_node')
        if parent is None:
            break
        peers = [node for node in structural_children(parent)
                 if same_shape(item, node, allow_unstyled=item is target)]
        if len(peers) > 1:
            members = [{_backend(node) for node in _walk_structural(peer)} & backends for peer in peers]
            # WHY：真实 CSS 查询已确定目标；selected/visited 样式不改变集合归属。
            # 全部命中必须落在同组不同条目，不能把跨组查询或一项多个控件冒充集合。
            if len(backends) > 1 and all(len(group) <= 1 for group in members) and set().union(*members) == backends:
                return True
    return False


def same_shape(left, right, *, allow_unstyled=False):
    tag = _tag(left)
    if tag != _tag(right):
        return False
    left_attrs, right_attrs = node_value(left, 'attributes') or {}, node_value(right, 'attributes') or {}
    left_classes = set(str(left_attrs.get('class') or '').split())
    right_classes = set(str(right_attrs.get('class') or '').split())
    if left_classes or right_classes:
        return bool(left_classes.intersection(right_classes))
    role = left_attrs.get('role')
    return allow_unstyled or tag in ITEM_TAGS or (role in ITEM_ROLES and role == right_attrs.get('role'))


def _tag(node):
    return str(node.get('tag')) if isinstance(node, dict) and node.get('tag') else node_tag(node)


def _backend(node):
    value = node_value(node, 'backend_node_id')
    return node_value(node, 'backendNodeId') if value is None else value
