"""Local repeated-item relationships from the existing Browser-Use DOM snapshot."""
from .dom_evidence import ancestor_chain, node_tag, node_value, structural_children

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
    path = []
    for item in reversed(ancestors):
        parent = node_value(item, 'parent_node')
        if parent is None:
            break
        peers = [node for node in structural_children(parent)
                 if same_shape(item, node, allow_unstyled=not path)]
        if len(peers) > 1:
            corresponding = [_corresponding_target(peer, path) for peer in peers]
            ids = {_backend(node) for node in corresponding if node is not None}
            # WHY：全页 query 中恰好含一对同类控件不等于业务候选集合。
            # 全部命中均须属于同一个局部重复条目的对应位置，才可复用原始 ordinal。
            if len(backends) > 1 and backends.issubset(ids):
                return True
        path.insert(0, item)
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


def _corresponding_target(item, path):
    current = item
    for component in path:
        matches = [child for child in structural_children(current)
                   if _same_path_component(component, child)]
        if len(matches) != 1:
            return None
        current = matches[0]
    return current


def _same_path_component(left, right):
    left_classes = str((node_value(left, 'attributes') or {}).get('class') or '').split()
    right_classes = str((node_value(right, 'attributes') or {}).get('class') or '').split()
    return _tag(left) == _tag(right) and set(left_classes) == set(right_classes)


def _tag(node):
    return str(node.get('tag')) if isinstance(node, dict) and node.get('tag') else node_tag(node)


def _backend(node):
    value = node_value(node, 'backend_node_id')
    return node_value(node, 'backendNodeId') if value is None else value
