"""Adapt the native main HTML frame marker without admitting child documents."""
from .dom_evidence import node_value


def target_frame_matches(node, target_id, frame_id):
    if node_value(node, 'frame_id') == frame_id:
        return True
    # WHY：CDP 把主 frameId 放在 HTML 上，普通主文档元素却为 None。
    # 只有最外层 #document 的 HTML 子节点可以跨过这个表示差异；iframe 根不能。
    if frame_id is not None or str(node_value(node, 'node_name') or '').lower() != 'html':
        return False
    document = node_value(node, 'parent_node')
    return (node_value(node, 'target_id') == target_id
        and node_value(node, 'shadow_root_type') is None
        and str(node_value(document, 'node_name') or '').lower() == '#document'
        and node_value(document, 'target_id') == target_id
        and node_value(document, 'parent_node') is None
        and node_value(document, 'shadow_root_type') is None)
