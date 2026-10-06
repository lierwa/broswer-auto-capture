"""Adapt the existing native collection to disjoint, one-member record scopes."""
from .dom_evidence import node_tag
from .record_projection_dom import _ancestors_to_root, _identity, _relative_selector


def record_roots(members):
    if len(members) < 2:
        return members, [0] * len(members)
    counts = {}
    for member in members:
        for node in _ancestors_to_root(member):
            key = _identity(node)
            counts[key] = counts.get(key, 0) + 1
    roots, steps = [], []
    for member in members:
        root, depth = member, 0
        for ancestor in _ancestors_to_root(member)[1:]:
            if node_tag(ancestor) in ('body', 'html', '#document') or counts.get(_identity(ancestor)) != 1:
                break
            root, depth = ancestor, depth + 1
        roots.append(root)
        steps.append(depth)
    # WHY：取包含恰好一个完整集合成员的最高祖先；多个成员的公共祖先绝不是一个输入记录。
    if len({_identity(root) for root in roots}) != len(members):
        raise ValueError('native_entry_record_scope_unavailable')
    return roots, steps


def record_selector(body, roots):
    selector = _relative_selector([body], [roots])
    if not selector or selector == ':scope':
        raise ValueError('native_entry_record_scope_unavailable')
    return 'body' + selector.removeprefix(':scope')
