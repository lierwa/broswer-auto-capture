"""Host-owned migration adapter from a native extract result to a replayable ReadSpec.

The model never supplies selectors or record relationships.  This module accepts only the
browser's enhanced DOM plus the already returned structured value, derives a bounded candidate,
and admits it only after two stable live reads reproduce that value exactly.
"""

import itertools
import re
from dataclasses import dataclass, replace
from urllib.parse import urljoin

from pydantic import Field, JsonValue

from .dom_evidence import node_tag, node_value
from .evidence import Contract, digest
from .natural_reads import current_page, page_identity, read_fields_with_proof
from .read import ReadField, ReadSpec, read_value
from .record_projection_schema import field_maximum as _field_maximum
from .record_projection_schema import field_schema as _field_schema
from .record_projection_schema import value_type as _value_type
from .visible_text import extracted_presentation_candidates, normalize_presentation_text

MAX_FIELDS = 100
MAX_RECORDS = 300
MAX_ANCESTORS = 6
MAX_SELECTOR_CANDIDATES = 24
HOST_READ_MAX_INPUT_BYTES = 128000
SAFE_TOKEN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_-]{0,99}$')
NUMBER_TOKEN = re.compile(r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?')
ATTRIBUTE_PROJECTIONS = ('href', 'datetime', 'value', 'aria-label', 'title')
STABLE_ATTRIBUTES = ('data-testid', 'data-test', 'data-cy', 'role')


class HostProjectionFailure(ValueError):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


class HostReadMapping(Contract):
    outputPath: list[str | int]
    readPath: list[str | int]


class CapturedHostRead(Contract):
    specification: ReadSpec
    output: JsonValue
    mappings: list[HostReadMapping] = Field(default_factory=list, max_length=100)
    urlDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    targetId: str = Field(min_length=1)
    containerIdsDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    stable: bool


@dataclass(frozen=True)
class _Selection:
    nodes: tuple[object, ...]
    attribute: str | None
    resolve_url: bool = False
    text_prefix: str | None = None
    text_suffix: str | None = None
    normalize_whitespace: bool = False
    normalize_presentation: bool = False


@dataclass(frozen=True)
class _Record:
    container: object
    fields: dict[str, _Selection]


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


async def capture_host_read(browser, summary, output_schema, output, *, reader=read_fields_with_proof):
    """Return one proven host projection; absence or structural ambiguity is a fixed failure."""
    root = _enhanced_root(summary)
    specifications = projection_candidates(
        root, output_schema, output, getattr(summary, 'url', ''), include_output=True)
    if not specifications:
        raise HostProjectionFailure('host_record_projection_unavailable')
    if len(specifications) > MAX_SELECTOR_CANDIDATES:
        raise HostProjectionFailure('host_record_projection_candidate_limit')
    page = await current_page(browser)
    identity = await page_identity(page)
    successes = {}
    for specification, canonical in specifications:
        try:
            actual, container_digest = await reader(browser, specification, identity)
        except Exception:
            continue
        if digest(actual) != digest(canonical):
            continue
        key = digest(specification)
        successes[key] = CapturedHostRead(
            specification=specification,
            output=actual,
            urlDigest=digest(identity['url']),
            targetId=identity['targetId'],
            containerIdsDigest=container_digest,
            stable=True,
        )
    if len(successes) != 1:
        reason = 'host_record_projection_unavailable' if not successes else 'host_record_projection_ambiguous'
        raise HostProjectionFailure(reason)
    return next(iter(successes.values()))


def _container_identities(root, schema, output, page_url):
    records, properties, _maximum = _records(schema, output)
    body = next((node for node in _elements(root) if node_tag(node) == 'body'), None)
    if body is None:
        raise HostProjectionFailure('host_record_projection_body_missing')
    candidates = [_record_candidate(body, record, properties, page_url) for record in records]
    identities = [_identity(item.container) for item in candidates]
    if any(value is None for value in identities):
        raise HostProjectionFailure('host_record_projection_container_identity_missing')
    return identities


def projection_candidates(root, output_schema, output, page_url='', *, include_output=False):
    records, properties, maximum = _records(output_schema, output)
    body = next((node for node in _elements(root) if node_tag(node) == 'body'), None)
    if body is None:
        raise HostProjectionFailure('host_record_projection_body_missing')
    candidates = [_record_candidate(body, record, properties, page_url) for record in records]
    if len({_identity(item.container) for item in candidates}) != len(candidates):
        raise HostProjectionFailure('host_record_projection_duplicate_record')
    container = _relative_selector([body], [[item.container for item in candidates]], allow_prefix=True)
    if container is None:
        raise HostProjectionFailure('host_record_projection_container_unproven')
    fields = {}
    for name in properties:
        selections = [item.fields[name] for item in candidates]
        if any(item.normalize_presentation for item in selections):
            selections = [item if item.normalize_presentation else replace(
                item, normalize_whitespace=True, normalize_presentation=True)
                for item in selections]
            for candidate, selection in zip(candidates, selections, strict=True):
                candidate.fields[name] = selection
        attributes = {item.attribute for item in selections}
        resolutions = {item.resolve_url for item in selections}
        prefixes = {item.text_prefix for item in selections}
        suffixes = {item.text_suffix for item in selections}
        normalizations = {item.normalize_whitespace for item in selections}
        presentations = {item.normalize_presentation for item in selections}
        if any(len(values) != 1 for values in (
                attributes, resolutions, prefixes, suffixes, normalizations, presentations)):
            raise HostProjectionFailure('host_record_projection_attribute_ambiguous')
        selector = _relative_selector(
            [item.container for item in candidates], [list(item.nodes) for item in selections])
        if selector is None:
            selections = _aligned_field_selections(
                candidates, records, name, properties[name], page_url, selections)
            if selections is not None:
                for candidate, selection in zip(candidates, selections, strict=True):
                    candidate.fields[name] = selection
                selector = _relative_selector(
                    [item.container for item in candidates], [list(item.nodes) for item in selections])
        if selector is None:
            raise HostProjectionFailure('host_record_projection_field_unproven')
        fields[name] = ReadField(
            selector=selector,
            attribute=next(iter(attributes)),
            resolveUrl=next(iter(resolutions)),
            valueType=_value_type(properties[name]),
            textPrefix=next(iter(prefixes)),
            textSuffix=next(iter(suffixes)),
            normalizeWhitespace=next(iter(normalizations)),
            normalizePresentation=next(iter(presentations)),
            multiple=properties[name].get('type') == 'array',
            maxValues=_field_maximum(properties[name]),
        )
    specification = ReadSpec(
        container='body' + container.removeprefix(':scope'),
        fields=fields,
        maxItems=maximum,
        maxInputBytes=HOST_READ_MAX_INPUT_BYTES,
        outputSchema=output_schema,
    )
    canonical = [{name: _selection_value(name, item.fields[name], fields[name], page_url)
                  for name in properties} for item in candidates]
    canonical = canonical[0] if output_schema.get('type') == 'object' else canonical
    return [(specification, canonical)] if include_output else [specification]


def _selection_value(name, selection, field, page_url):
    values = [_projected(node, field.attribute, page_url, field.resolveUrl,
                         field.normalizeWhitespace) for node in selection.nodes]
    projected = [read_value(name, value, field) for value in values]
    return projected if field.multiple else projected[0]


def _aligned_field_selections(candidates, records, name, schema, page_url, selections):
    if any(len(item.nodes) != 1 or item.attribute is not None for item in selections):
        return None
    by_record = []
    for candidate, record, selection in zip(candidates, records, selections, strict=True):
        expected = (extracted_presentation_candidates(record[name])
                    if selection.normalize_presentation else {record[name]})
        field = ReadField(
            selector=':scope', attribute=None, valueType=_value_type(schema),
            textPrefix=selection.text_prefix, textSuffix=selection.text_suffix,
            normalizeWhitespace=selection.normalize_whitespace,
            normalizePresentation=selection.normalize_presentation)
        options, current = {}, selection.nodes[0]
        for node in _ancestors_to_root(current):
            path = _path(candidate.container, node)
            if node is not candidate.container and not path:
                continue
            try:
                actual = read_value(name, _projected(
                    node, None, page_url, False, field.normalizeWhitespace), field)
            except Exception:
                actual = object()
            if actual in expected:
                options[len(path)] = replace(selection, nodes=(node,))
            if node is candidate.container:
                break
        by_record.append(options)
    depths = set.intersection(*(set(item) for item in by_record)) if by_record else set()
    for depth in sorted(depths, reverse=True):
        selections = [item[depth] for item in by_record]
        if _relative_selector(
                [item.container for item in candidates], [list(item.nodes) for item in selections]) is not None:
            return selections
    return None


def matching_output_paths(schema, value, candidate_schema, candidate_value, path=None):
    """Find whole-object/array destinations; never turn a dynamic collection into fixed item paths."""
    path = [] if path is None else path
    matches = []
    if schema == candidate_schema and digest(value) == digest(candidate_value):
        matches.append(path)
    if schema.get('type') == 'object' and isinstance(value, dict):
        for name, child in schema.get('properties', {}).items():
            if name in value and isinstance(child, dict):
                matches.extend(matching_output_paths(child, value[name], candidate_schema,
                                                     candidate_value, [*path, name]))
    return matches


def _records(schema, output):
    if not isinstance(schema, dict):
        raise HostProjectionFailure('host_record_projection_schema_unsupported')
    if schema.get('type') == 'object' and isinstance(output, dict):
        records, item, maximum = [output], schema, 1
    elif schema.get('type') == 'array' and isinstance(schema.get('items'), dict) and isinstance(output, list):
        item, records = schema['items'], output
        maximum = schema.get('maxItems')
        if type(maximum) is not int or not 0 < maximum <= MAX_RECORDS or not 0 < len(records) <= maximum:
            raise HostProjectionFailure('host_record_projection_cardinality_unbounded')
    else:
        raise HostProjectionFailure('host_record_projection_schema_unsupported')
    properties = item.get('properties') if item.get('type') == 'object' else None
    required = item.get('required', [])
    if (not isinstance(properties, dict) or not 0 < len(properties) <= MAX_FIELDS
            or not isinstance(required, list) or any(name not in properties for name in required)
            or any(not isinstance(record, dict) or set(record) != set(properties) for record in records)
            or any(not _field_schema(field) for field in properties.values())):
        raise HostProjectionFailure('host_record_projection_schema_unsupported')
    return records, properties, maximum


def _record_candidate(root, record, properties, page_url):
    anchors = []
    for name in properties:
        value = record[name]
        if isinstance(value, list):
            continue
        nodes = {id(node): node for selection in _field_options(
                 root, value, page_url, properties[name])
                 for node in selection.nodes}
        if len(nodes) == 1:
            anchors.append(next(iter(nodes.values())))
    candidates = []
    for anchor in anchors:
        candidate = _candidate_from_anchor(anchor, record, properties, page_url)
        if candidate is not None:
            candidates.append(candidate)
    unique = {_record_signature(item): item for item in candidates}
    if len(unique) != 1:
        reason = 'host_record_projection_anchor_missing' if not unique else 'host_record_projection_record_ambiguous'
        raise HostProjectionFailure(reason)
    return next(iter(unique.values()))


def _candidate_from_anchor(anchor, record, properties, page_url):
    for ancestor in _ancestors(anchor):
        options = [_field_options(ancestor, record[name], page_url, properties[name]) for name in record]
        if any(not item for item in options):
            continue
        combinations = list(itertools.islice(itertools.product(*options), 2))
        if len(combinations) != 1:
            if combinations:
                raise HostProjectionFailure('host_record_projection_field_ambiguous')
            continue
        selections = dict(zip(record, combinations[0], strict=True))
        container = _common_ancestor([node for item in selections.values() for node in item.nodes])
        if container is None or node_tag(container) in ('html', 'body'):
            continue
        return _Record(container=container, fields=selections)
    return None


def _field_options(root, expected, page_url, schema):
    if isinstance(expected, list):
        return _list_field_options(root, expected, page_url)
    options = []
    for attribute, resolve_url in _projection_kinds(page_url):
        for normalize in ((False, True) if attribute is None else (False,)):
            nodes = [node for node in _elements(root)
                     if _projected(node, attribute, page_url, resolve_url, normalize) == expected]
            if attribute is None:
                nodes = _minimal_text_nodes(nodes, expected, page_url, normalize)
            if len(nodes) == 1:
                options.append(_Selection(
                    (nodes[0],), attribute, resolve_url, normalize_whitespace=normalize))
    if schema.get('type') in ('number', 'integer') and type(expected) in (int, float):
        options.extend(_numeric_field_options(root, expected, schema['type'], page_url))
    if not options and schema.get('type') == 'string' and isinstance(expected, str) and expected:
        options.extend(_presentation_field_options(root, expected, page_url))
    if not options and schema.get('type') == 'string' and isinstance(expected, str) and expected:
        options.extend(_string_affix_field_options(root, expected, page_url))
    return _unique_selections(options)


def _presentation_field_options(root, expected, page_url):
    targets, selections = extracted_presentation_candidates(expected), []
    for node in _elements(root):
        raw = _projected(node, None, page_url, False, True)
        if raw != expected and _has_presentation_markup(node) \
                and normalize_presentation_text(raw) in targets:
            selections.append(_Selection(
                (node,), None, False, normalize_whitespace=True, normalize_presentation=True))
    return [item for item in selections if not any(
        _has_presentation_markup(child)
        and normalize_presentation_text(_projected(child, None, page_url, False, True)) in targets
        for child in _element_children(item.nodes[0]))]


def _has_presentation_markup(node):
    stack = [node]
    while stack:
        current = stack.pop()
        if node_tag(current) in ('code', 'pre', 'ul', 'ol', 'li'):
            return True
        stack.extend(_element_children(current))
    return False


def _string_affix_field_options(root, expected, page_url):
    """Admit one bounded, stable visible-text affix such as ``#`` around an exact string value."""
    selections = []
    for node in _elements(root):
        for normalize in (False, True):
            raw = _projected(node, None, page_url, False, normalize)
            if raw == expected or raw.count(expected) != 1:
                continue
            start = raw.index(expected)
            prefix, suffix = raw[:start] or None, raw[start + len(expected):] or None
            if (prefix is not None and len(prefix) > 100) or (suffix is not None and len(suffix) > 100):
                continue
            selections.append(_Selection(
                (node,), None, False, prefix, suffix, normalize_whitespace=normalize))
    minimal = [item for item in selections if not any(
        _projected(child, None, page_url, False, item.normalize_whitespace).count(expected) == 1
        for child in _element_children(item.nodes[0]))]
    return _prefer_normalized_by_node(minimal)


def _numeric_field_options(root, expected, value_type, page_url):
    selections = []
    for node in _elements(root):
        for normalize in (False, True):
            raw = _projected(node, None, page_url, False, normalize)
            matches = [match for match in NUMBER_TOKEN.finditer(raw)
                       if _numeric_value(match.group(), value_type) == expected]
            if len(matches) != 1:
                continue
            match = matches[0]
            prefix, suffix = raw[:match.start()] or None, raw[match.end():] or None
            # WHY：增强 DOM 会在相邻文本节点之间插入布局空白，而浏览器 innerText 未必保留；
            # 数值转换可安全忽略边界空白，因此只绑定可见的非空白前后缀。
            prefix = prefix.rstrip() or None if prefix is not None else None
            suffix = suffix.lstrip() or None if suffix is not None else None
            if (prefix is not None and len(prefix) > 100) or (suffix is not None and len(suffix) > 100):
                continue
            selections.append(_Selection(
                (node,), None, False, prefix, suffix, normalize_whitespace=normalize))
    minimal = [item for item in selections if not any(
        _numeric_value(match.group(), value_type) == expected
        for child in _element_children(item.nodes[0])
        for match in NUMBER_TOKEN.finditer(_projected(
            child, None, page_url, False, item.normalize_whitespace)))]
    return _prefer_normalized_by_node(minimal)


def _prefer_normalized_by_node(selections):
    # WHY：同一 DOM 节点的原始换行和折叠空白是同一来源，不应制造字段歧义；
    # 折叠空白可跨浏览器布局差异稳定复跑，因此两者都命中时只保留折叠版本。
    by_node = {}
    for item in selections:
        identity = _identity(item.nodes[0]) or ('object', id(item.nodes[0]))
        current = by_node.get(identity)
        if current is None or item.normalize_whitespace:
            by_node[identity] = item
    return list(by_node.values())


def _numeric_value(value, value_type):
    try:
        return int(value) if value_type == 'integer' else float(value)
    except (TypeError, ValueError):
        return None


def _list_field_options(root, expected, page_url):
    if not expected or len(expected) > MAX_RECORDS or any(isinstance(value, (dict, list)) for value in expected):
        return []
    options = []
    for attribute, resolve_url in _projection_kinds(page_url):
        for normalize in ((False, True) if attribute is None else (False,)):
            nodes = [node for node in _elements(root)
                     if _projected(node, attribute, page_url, resolve_url, normalize) in expected]
            if attribute is None:
                nodes = [node for node in nodes if not any(
                    _projected(child, None, page_url, False, normalize)
                    == _projected(node, None, page_url, False, normalize)
                    for child in _element_children(node))]
            if [_projected(node, attribute, page_url, resolve_url, normalize)
                    for node in nodes] == expected:
                options.append(_Selection(
                    tuple(nodes), attribute, resolve_url, normalize_whitespace=normalize))
    return _unique_selections(options)


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


def _record_signature(record):
    return (_identity(record.container), tuple((name, item.attribute, item.resolve_url,
            item.text_prefix, item.text_suffix,
            item.normalize_whitespace, item.normalize_presentation,
            tuple(_identity(node) for node in item.nodes)) for name, item in sorted(record.fields.items())))


def _enhanced_root(summary):
    simplified = getattr(getattr(summary, 'dom_state', None), '_root', None)
    root = getattr(simplified, 'original_node', None)
    if root is None:
        raise HostProjectionFailure('host_record_projection_dom_missing')
    return root


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


def _projection_kinds(page_url):
    output = [(None, False)]
    for attribute in ATTRIBUTE_PROJECTIONS:
        output.append((attribute, False))
        if attribute == 'href' and page_url:
            output.append((attribute, True))
    return output


def _unique_selections(options):
    output = {}
    for item in options:
        key = (tuple(_identity(node) for node in item.nodes), item.attribute,
               item.text_prefix, item.text_suffix, item.normalize_presentation)
        output.setdefault(key, item)
    return list(output.values())


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
