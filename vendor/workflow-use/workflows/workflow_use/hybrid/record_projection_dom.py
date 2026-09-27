"""DOM node projection and deterministic CSS selector helpers for host reads."""
import itertools
import re
from dataclasses import dataclass
from urllib.parse import urljoin

from .dom_evidence import node_tag, node_value

MAX_ANCESTORS = 6
SAFE_TOKEN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_-]{0,99}$')
STABLE_ATTRIBUTES = ('data-testid', 'data-test', 'data-cy', 'role')


@dataclass(frozen=True)
class _Matcher:
    tag: str
    attributes: tuple[tuple[str, str], ...] = ()
    classes: tuple[str, ...] = ()
    child_position: int | None = None

    @property
    def css(self):
        attrs = ''.join(f'[{name}="{value}"]' for name, value in self.attributes)
        classes = ''.join('.' + value for value in self.classes)
        position = f':nth-child({self.child_position})' if self.child_position is not None else ''
        return self.tag + attrs + classes + position


def _relative_selector(roots, expected_groups, allow_prefix=False):
    paths = [[_path(root, node) for node in expected] for root, expected in zip(roots, expected_groups, strict=True)]
    lengths = {len(path) for group in paths for path in group}
    if not paths or not lengths or len(lengths) != 1:
        return None
    depth = next(iter(lengths))
    if depth == 0:
        return ':scope' if all(group == [[]] for group in paths) else None
    columns = [[path[index] for group in paths for path in group] for index in range(depth)]
    choices = [_matchers(column) for column in columns]
    if any(not item for item in choices):
        return None
    for matchers in itertools.islice(itertools.product(*choices), 500):
        actual = [_walk(root, matchers) for root in roots]
        if all(_same_nodes(found, expected, allow_prefix)
               for found, expected in zip(actual, expected_groups, strict=True)):
            return ':scope > ' + ' > '.join(item.css for item in matchers)
    return None


def _matchers(nodes):
    tags = {node_tag(node) for node in nodes}
    if len(tags) != 1 or not SAFE_TOKEN.fullmatch(next(iter(tags))):
        return []
    tag = next(iter(tags))
    attributes = [_attributes(node) for node in nodes]
    shared = [(name, attributes[0][name]) for name in STABLE_ATTRIBUTES
              if name in attributes[0] and SAFE_TOKEN.fullmatch(attributes[0][name])
              and all(item.get(name) == attributes[0][name] for item in attributes)]
    classes = set(_classes(nodes[0]))
    for node in nodes[1:]:
        classes &= set(_classes(node))
    classes = tuple(sorted(classes)[:3])
    output = []
    if shared:
        output.append(_Matcher(tag, tuple(shared), classes))
        output.extend(_Matcher(tag, (item,), classes) for item in shared)
    if classes:
        output.append(_Matcher(tag, (), classes))
    output.append(_Matcher(tag))
    positions = {_child_position(node) for node in nodes}
    if len(positions) == 1 and None not in positions:
        position = next(iter(positions))
        output.extend(_Matcher(item.tag, item.attributes, item.classes, position)
                      for item in tuple(output))
    return list(dict.fromkeys(output))


def _walk(root, matchers):
    current = [root]
    for matcher in matchers:
        current = [child for node in current for child in _element_children(node)
                   if _matches(child, matcher)]
    return current


def _matches(node, matcher):
    attrs = _attributes(node)
    return (node_tag(node) == matcher.tag
            and all(attrs.get(name) == value for name, value in matcher.attributes)
            and all(value in _classes(node) for value in matcher.classes)
            and (matcher.child_position is None
                 or _child_position(node) == matcher.child_position))


def _child_position(node):
    parent = node_value(node, 'parent_node')
    if parent is None:
        return None
    return next((index for index, child in enumerate(_element_children(parent), 1)
                 if child is node), None)


def _same_nodes(actual, expected, allow_prefix):
    left, right = [_identity(node) for node in actual], [_identity(node) for node in expected]
    return left[:len(right)] == right if allow_prefix else left == right


def _path(root, node):
    output, current = [], node
    while current is not None and current is not root:
        output.append(current)
        current = node_value(current, 'parent_node')
    return list(reversed(output)) if current is root else []


def _ancestors(node):
    output, current = [], node
    while current is not None and len(output) <= MAX_ANCESTORS:
        if node_tag(current) in ('html', 'body'):
            break
        output.append(current)
        current = node_value(current, 'parent_node')
    return output


def _common_ancestor(nodes):
    if not nodes:
        return None
    chains = [_ancestors_to_root(node) for node in nodes]
    identities = [{_identity(node) for node in chain} for chain in chains[1:]]
    return next((node for node in chains[0] if all(_identity(node) in values for values in identities)), None)


def _ancestors_to_root(node):
    output, current = [], node
    while current is not None:
        output.append(current)
        current = node_value(current, 'parent_node')
    return output


def _elements(root):
    output, stack = [], [root]
    while stack:
        node = stack.pop()
        children = _element_children(node)
        stack.extend(reversed(children))
        if (node_tag(node) not in ('unknown', '#document', 'html')
                and node_value(node, 'is_visible') is not False
                and _identity(node) is not None):
            output.append(node)
    return output


def _element_children(node):
    return [child for child in (node_value(node, 'children_nodes') or [])
            if not node_tag(child).startswith('#')]


def _projected(node, attribute, page_url, resolve_url=False, normalize=True):
    if attribute is not None:
        raw = _attributes(node).get(attribute)
        if resolve_url and isinstance(raw, str):
            return urljoin(page_url, raw)
        return raw
    try:
        raw = node.get_all_children_text()
    except Exception:
        raw = node_value(node, 'node_value') or ''
    raw = str(raw).strip()
    return ' '.join(raw.split()) if normalize else raw


def _minimal_text_nodes(nodes, expected, page_url, normalize=True):
    return [node for node in nodes if not any(
        _projected(child, None, page_url, False, normalize) == expected
        for child in _element_children(node))]


def _attributes(node):
    raw = node_value(node, 'attributes') or {}
    return {str(name): str(value) for name, value in raw.items()
            if isinstance(name, str) and isinstance(value, (str, int, float))}


def _classes(node):
    return tuple(value for value in _attributes(node).get('class', '').split() if SAFE_TOKEN.fullmatch(value))


def _identity(node):
    backend = node_value(node, 'backend_node_id')
    target = node_value(node, 'target_id')
    return (str(target), backend) if type(backend) is int and target is not None else None
