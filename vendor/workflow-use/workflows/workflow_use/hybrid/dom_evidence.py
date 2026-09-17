"""Bounded, readable DOM evidence copied from browser-use native sources."""
import re
from typing import Callable, Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, JsonValue, model_serializer

from .evidence import Contract, digest

SCHEMA_VERSION = 'bat.dom-structure/v1'
STRUCTURAL_ATTRIBUTES = frozenset({
    'id', 'class', 'name', 'type', 'role', 'data-testid', 'data-test', 'data-cy', 'for',
    'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-expanded', 'aria-checked',
    'aria-selected', 'aria-disabled', 'disabled', 'checked', 'selected', 'multiple',
    'contenteditable', 'readonly', 'required',
})
STATE_ATTRIBUTES = frozenset({
    'type', 'role', 'aria-expanded', 'aria-checked', 'aria-selected', 'aria-disabled',
    'disabled', 'checked', 'selected', 'multiple', 'contenteditable', 'readonly', 'required',
})


class DomDocumentIdentity(Contract):
    kind: Literal['ancestor_root'] = 'ancestor_root'
    rootNodeId: int | None = None
    rootBackendNodeId: int | None = None
    complete: bool


class DomScope(Contract):
    url: str | None
    urlDigest: str | None = Field(default=None, pattern=r'^[0-9a-f]{64}$')
    tabId: str | None
    targetId: str | None
    frameId: str | None
    document: DomDocumentIdentity | None

    @model_serializer(mode='wrap')
    def preserve_legacy_scope_shape(self, serialize):
        # WHY：完整 URL 摘要是新 callback 证据；旧 history 没有该来源时不能以 null 改写既存摘要。
        value = serialize(self)
        if self.urlDigest is None:
            value.pop('urlDigest', None)
        return value


class DomSelector(Contract):
    kind: Literal['css', 'xpath']
    value: str = Field(min_length=1)


class DomQueryScope(Contract):
    kind: Literal['document'] = 'document'
    tabId: str
    frameId: str | None


class DomQueryCandidate(Contract):
    scope: DomQueryScope
    container: DomSelector
    items: DomSelector
    withinItem: DomSelector | None
    matchedItemOrdinal: int | None = Field(default=None, gt=0)
    targetRef: str
    complete: bool


class DomNodeEvidence(Contract):
    id: str = Field(pattern=r'^n-\d{4,}$')
    tag: str = Field(min_length=1)
    xpath: str | None
    parentRef: str | None
    childrenRefs: list[str]
    attributes: dict[str, JsonValue]


class DomChildCoverage(Contract):
    parentRef: str
    total: int
    captured: int
    truncated: bool


class DomCoverage(Contract):
    source: Literal['callback_selector_map', 'history_interacted_element']
    selectorIndex: int | None = Field(default=None, ge=0)
    ancestorsCaptured: int = Field(ge=0)
    ancestorsTruncated: bool
    directChildrenTotal: int | None = Field(default=None, ge=0)
    directChildrenCaptured: int = Field(ge=0)
    directChildrenTruncated: bool
    childSets: list[DomChildCoverage]
    complete: bool


class DomStructureEvidence(Contract):
    schemaVersion: Literal['bat.dom-structure/v1'] = SCHEMA_VERSION
    actionRef: str = Field(pattern=r'^a-\d{4,}$')
    scope: DomScope
    targetRef: str | None
    nodes: list[DomNodeEvidence]
    queryCandidate: DomQueryCandidate | None
    coverage: DomCoverage
    limitations: list[str]


class DomQueryEvidence(Contract):
    schemaVersion: Literal['bat.dom-query/v1'] = 'bat.dom-query/v1'
    actionRef: str = Field(pattern=r'^a-\d{4,}$')
    scope: DomScope
    query: DomSelector
    requestedAttributes: list[str]
    includeText: bool
    maxResults: int = Field(gt=0)
    total: int | None = Field(default=None, ge=0)
    showing: int | None = Field(default=None, ge=0)
    truncated: bool | None
    complete: bool
    limitations: list[str]


def capture_find_elements_query(summary, action_ref, arguments, redacted_arguments, tab_id):
    selector = redacted_arguments.get('selector') if isinstance(redacted_arguments, dict) else None
    original_selector = arguments.get('selector')
    maximum = arguments.get('max_results', 50)
    if not isinstance(selector, str) or not selector or type(maximum) is not int or maximum < 1:
        return None
    requested = arguments.get('attributes') or []
    names = sorted({item for item in requested if isinstance(item, str) and len(item) <= 64
                    and re.fullmatch(r'[A-Za-z_:][-A-Za-z0-9_:.]*', item)})
    limitations = ['result_bodies_omitted']
    if selector != original_selector:
        limitations.extend(['query_selector_redacted', 'executable_query_source_unavailable'])
    if len(names) != len(requested):
        limitations.append('requested_attribute_name_omitted')
    if safe_url(getattr(summary, 'url', None)) != getattr(summary, 'url', None):
        limitations.append('redacted_url_components')
    return DomQueryEvidence(actionRef=action_ref,
        scope=scope_from_summary(summary, tab_id),
        query=DomSelector(kind='css', value=selector), requestedAttributes=names,
        includeText=arguments.get('include_text', True) is True, maxResults=maximum,
        total=None, showing=None, truncated=None, complete=False, limitations=limitations)


def complete_find_elements_query(evidence, results):
    value = evidence.model_copy(deep=True)
    if len(results) != 1:
        value.limitations.append('query_result_unpaired_or_ambiguous')
        return value
    result = results[0]
    if getattr(result, 'error', None):
        value.limitations.append('query_action_failed')
        return value
    total = find_elements_total(getattr(result, 'long_term_memory', None))
    if total is None:
        value.limitations.append('query_result_summary_unrecognized')
        return value
    value.total = total
    value.showing = min(total, value.maxResults)
    value.truncated = value.showing < total
    if total == 0:
        value.limitations.append('zero_matches_not_collection')
    if value.truncated:
        value.limitations.append('query_result_truncated')
    value.complete = (total > 0 and not value.truncated
                      and 'query_selector_redacted' not in value.limitations)
    value.limitations = sorted(set(value.limitations))
    return value


def find_elements_total(memory):
    if not isinstance(memory, str):
        return None
    match = re.fullmatch(r'Found (\d+) elements? matching ".*"\.', memory, flags=re.DOTALL)
    return int(match.group(1)) if match else None


def capture_selector_structure(summary, action_ref: str, selector_index: int,
                               tab_id: str | None, query_target: dict | None = None,
                               sanitize_value: Callable[[str, str], JsonValue] | None = None,
                               query_verified: bool = False):
    mapping = getattr(getattr(summary, 'dom_state', None), 'selector_map', {}) or {}
    target = mapping.get(selector_index, mapping.get(str(selector_index)))
    if target is None:
        return empty_structure(action_ref, summary, tab_id, selector_index, 'selector_index_missing')
    sanitizer = sanitize_value or redact_attribute
    ancestors, cycled, ancestor_boundary = ancestor_chain(target)
    nodes, child_sets, node_refs, child_boundaries = copy_local_graph(ancestors, sanitizer)
    target_ref = node_refs[id(target)]
    root = ancestors[0]
    scope = scope_from_node(summary, tab_id, target, root, not cycled and not ancestor_boundary)
    query = query_candidate(query_target, scope, target_ref, query_verified)
    limitations = ['upstream_dom_coverage_not_proven']
    if query_target is None:
        limitations.append('query_candidate_unavailable')
    if safe_url(getattr(summary, 'url', None)) != getattr(summary, 'url', None):
        limitations.append('redacted_url_components')
    if ancestor_boundary:
        limitations.append(ancestor_boundary)
    limitations.extend(child_boundaries)
    if cycled:
        limitations.append('ancestor_cycle_detected')
    if query_target is not None and query is None:
        limitations.append('executable_query_source_unavailable')
    target_children = next((item for item in child_sets if item.parentRef == target_ref), None)
    coverage = DomCoverage(source='callback_selector_map', selectorIndex=selector_index,
        ancestorsCaptured=len(ancestors), ancestorsTruncated=cycled,
        directChildrenTotal=target_children.total if target_children else 0,
        directChildrenCaptured=target_children.captured if target_children else 0,
        directChildrenTruncated=target_children.truncated if target_children else False,
        childSets=child_sets, complete=False)
    return DomStructureEvidence(actionRef=action_ref, scope=scope, targetRef=target_ref,
                                nodes=nodes, queryCandidate=query, coverage=coverage,
                                limitations=sorted(set(limitations)))


def attach_query_candidate(evidence, target, verified):
    value = evidence.model_copy(deep=True)
    candidate = query_candidate(target, value.scope, value.targetRef, verified) if value.targetRef else None
    value.queryCandidate = candidate
    if target is not None and candidate is None:
        value.limitations.append('executable_query_source_unavailable')
    value.limitations = sorted(set(value.limitations))
    return value


def empty_structure(action_ref, summary, tab_id, selector_index, limitation):
    return DomStructureEvidence(actionRef=action_ref,
        scope=scope_from_summary(summary, tab_id), targetRef=None, nodes=[], queryCandidate=None,
        coverage=DomCoverage(source='callback_selector_map', selectorIndex=selector_index,
            ancestorsCaptured=0, ancestorsTruncated=False, directChildrenTotal=None,
            directChildrenCaptured=0, directChildrenTruncated=False, childSets=[], complete=False),
        limitations=[limitation])


def ancestor_chain(target):
    chain, seen, current, boundary = [], set(), target, None
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        chain.append(current)
        parent = node_value(current, 'parent_node')
        boundary = dom_boundary(current, parent)
        if boundary:
            current = None
            break
        current = parent
    cycled = current is not None
    return list(reversed(chain)), cycled, boundary


def copy_local_graph(ancestors, sanitizer):
    selected, refs, child_sets, boundaries = list(ancestors), {}, [], set()
    for node in selected:
        refs[id(node)] = f'n-{len(refs) + 1:04d}'
    for parent in ancestors:
        boundaries.update(child_boundaries(parent))
        children = structural_children(parent)
        for child in children:
            if id(child) in refs:
                continue
            refs[id(child)] = f'n-{len(refs) + 1:04d}'
            selected.append(child)
        captured = sum(id(child) in refs for child in children)
        child_sets.append(DomChildCoverage(parentRef=refs[id(parent)], total=len(children),
                                           captured=captured, truncated=captured < len(children)))
    nodes = [copy_node(node, refs, sanitizer) for node in selected]
    return nodes, child_sets, refs, sorted(boundaries)


def copy_node(node, refs, sanitizer):
    parent = node_value(node, 'parent_node')
    children = structural_children(node)
    return DomNodeEvidence(id=refs[id(node)], tag=node_tag(node), xpath=node_xpath(node),
        parentRef=refs.get(id(parent)) if parent is not None else None,
        childrenRefs=[refs[id(child)] for child in children if id(child) in refs],
        attributes=clean_attributes(node_value(node, 'attributes') or {}, sanitizer))


def structural_children(node):
    children = node_value(node, 'children_nodes') or []
    return [child for child in children if node_tag(child) not in ('#text', '#comment')
            and dom_boundary(child, node) is None]


def scope_from_node(summary, tab_id, target, root, root_complete):
    document = DomDocumentIdentity(rootNodeId=int_or_none(node_value(root, 'node_id')),
        rootBackendNodeId=int_or_none(node_value(root, 'backend_node_id')), complete=root_complete)
    scope = scope_from_summary(summary, tab_id)
    return scope.model_copy(update={
        'targetId': string_or_none(node_value(target, 'target_id')),
        'frameId': string_or_none(node_value(target, 'frame_id')), 'document': document})


def scope_from_summary(summary, tab_id):
    raw_url = getattr(summary, 'url', None)
    sanitized = safe_url(raw_url)
    return DomScope(url=sanitized, urlDigest=digest(raw_url) if sanitized is not None else None,
                    tabId=string_or_none(tab_id), targetId=None, frameId=None, document=None)


def query_candidate(target, scope, target_ref, verified):
    if not target or not scope.tabId or not verified or target.get('strategy') != 'structure':
        return None
    container, items, within = target.get('container'), target.get('items'), target.get('withinItem')
    if not valid_css_query(container) or not valid_css_query(items) or (
            within is not None and not valid_css_query(within)):
        return None
    ordinal = target.get('ordinal')
    if not isinstance(ordinal, int) or isinstance(ordinal, bool) or ordinal < 1:
        return None
    return DomQueryCandidate(scope=DomQueryScope(tabId=scope.tabId, frameId=scope.frameId),
        container=DomSelector.model_validate(container), items=DomSelector.model_validate(items),
        withinItem=DomSelector.model_validate(within) if within else None,
        matchedItemOrdinal=ordinal, targetRef=target_ref, complete=True)


def valid_css_query(value):
    return isinstance(value, dict) and set(value) == {'kind', 'value'} and value.get('kind') == 'css' \
        and isinstance(value.get('value'), str) and bool(value['value'])


def dom_boundary(child, parent):
    if parent is None:
        return None
    child_frame, parent_frame = node_value(child, 'frame_id'), node_value(parent, 'frame_id')
    child_target, parent_target = node_value(child, 'target_id'), node_value(parent, 'target_id')
    if child_frame != parent_frame or child_target != parent_target:
        return 'frame_boundary_not_crossed'
    if node_value(child, 'shadow_root_type') is not None or node_value(parent, 'shadow_root_type') is not None:
        return 'shadow_boundary_not_crossed'
    return None


def child_boundaries(node):
    found = {boundary for child in (node_value(node, 'children_nodes') or [])
             if (boundary := dom_boundary(child, node)) is not None}
    if node_value(node, 'content_document') is not None:
        found.add('frame_boundary_not_crossed')
    if node_value(node, 'shadow_roots'):
        found.add('shadow_boundary_not_crossed')
    return found


def clean_attributes(attributes, sanitizer):
    output = {}
    for key in sorted(set(attributes) & STRUCTURAL_ATTRIBUTES):
        value = str(attributes[key])
        output[key] = value if key in STATE_ATTRIBUTES else sanitizer(key, value)
    return output


def redact_attribute(_key, value):
    return value


def safe_url(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    if parsed.scheme in ('http', 'https') and parsed.hostname:
        # WHY：query/fragment 属于执行身份；只移除 URL userinfo，避免把账号凭据写入证据。
        host = parsed.netloc.rsplit('@', 1)[-1]
        return urlunsplit((parsed.scheme, host, parsed.path or '/', parsed.query, parsed.fragment))
    if parsed.scheme == 'about' and parsed.path == 'blank':
        return 'about:blank'
    return parsed.scheme + ':' if parsed.scheme else None


def history_tab_id(state):
    url = getattr(state, 'url', None)
    matches = [tab for tab in (getattr(state, 'tabs', None) or []) if getattr(tab, 'url', None) == url]
    return string_or_none(getattr(matches[0], 'target_id', None)) if len(matches) == 1 else None


def node_value(node, name):
    return node.get(name) if isinstance(node, dict) else getattr(node, name, None)


def node_tag(node):
    return str(node_value(node, 'node_name') or node_value(node, 'tag_name') or 'unknown').lower()


def node_xpath(node):
    try:
        value = node_value(node, 'xpath')
    except Exception:
        return None
    return value if isinstance(value, str) and value else None


def string_or_none(value):
    return str(value) if value is not None and str(value) else None


def int_or_none(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else None
