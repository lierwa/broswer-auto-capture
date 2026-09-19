"""Authoring-only opaque DOM refs backed by Browser-Use's current enhanced DOM tree."""
import json
from dataclasses import dataclass

from browser_use.agent.views import ActionResult
from browser_use.browser.session import BrowserSession
from pydantic import Field

from .dom_evidence import node_tag, node_value
from .evidence import Contract
from .field_read_params import FieldReadToolParams, expand_field_read_params
from .targets import element_from_backend

MAX_LOCAL_NODES = 240
MAX_ANCESTORS = 6
MAX_DESCENDANT_DEPTH = 3
MAX_RECORD_ANCESTOR_HOPS = 6
MAX_MODEL_OUTPUT_CHARS = 48000
VISIBLE_ATTRIBUTES = ('id', 'class', 'role', 'name', 'type', 'data-testid', 'data-test',
                      'data-cy', 'aria-label', 'href', 'datetime')
LIVE_ABSOLUTE_CSS = """() => {
  if (!this || this.nodeType !== 1) return '';
  const parts = [];
  let current = this;
  while (current && current.nodeType === 1) {
    const tag = current.localName;
    if (!tag) return '';
    const parent = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const siblings = Array.from(parent.children).filter(node => node.localName === tag);
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
    current = parent;
  }
  return parts.join(' > ');
}"""
FIELD_QUERY_PATHS = """(selector) => {
  const found = [];
  const seen = new Set();
  const add = (node) => {
    if (seen.has(node)) return;
    const path = [];
    let current = node;
    while (current && current !== this) {
      const parent = current.parentElement;
      if (!parent) return;
      const tag = current.localName;
      const siblings = Array.from(parent.children).filter(item => item.localName === tag);
      path.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
      current = parent;
    }
    if (current === this) {
      seen.add(node);
      found.push(path.length ? `:scope > ${path.join(' > ')}` : ':scope');
    }
  };
  try {
    if (this.matches(selector)) add(this);
    for (const node of this.querySelectorAll(selector)) add(node);
  } catch (error) {
    return {error: error && error.name === 'SyntaxError' ? 'invalid_selector' : 'query_failed'};
  }
  return {selectors: found};
}"""


class DomInspectParams(Contract):
    index: int = Field(ge=1, description='Current Browser-Use element index from browser_state.')


@dataclass(frozen=True)
class DomReference:
    ref: str
    target_id: str
    url: str
    backend_id: int
    session_id: str | None
    node: object


class DomReferenceStore:
    def __init__(self):
        self.references: dict[str, DomReference] = {}
        self.identity_refs: dict[tuple[str, str | None, int], str] = {}

    async def inspect(self, browser: BrowserSession, index: int):
        summary = await browser.get_browser_state_summary(include_screenshot=False)
        mapping = getattr(getattr(summary, 'dom_state', None), 'selector_map', {}) or {}
        anchor = mapping.get(index, mapping.get(str(index)))
        if anchor is None:
            raise ValueError('dom_inspection_index_missing')
        target_id = _string(node_value(anchor, 'target_id'))
        url = getattr(summary, 'url', None)
        if not target_id or not isinstance(url, str) or not url:
            raise ValueError('dom_inspection_page_identity_unavailable')
        nodes = _local_nodes(anchor, target_id)
        refs = [self._remember(node, target_id, url) for node in nodes]
        anchor_ref = self._remember(anchor, target_id, url).ref
        return _inspection_payload(anchor_ref, refs, self, len(nodes) >= MAX_LOCAL_NODES)

    async def mapping(self, params: FieldReadToolParams, target_schema, browser: BrowserSession):
        records = [[self._record_container(record), record] for record in params.records]
        if len({reference.ref for reference, _ in records}) != len(records):
            raise ValueError('dom_reference_duplicate_record')
        target_id, url = _same_page([reference for reference, _ in records])
        page = await browser.get_current_page()
        if page is None or browser.agent_focus_target_id != target_id or await page.get_url() != url:
            raise ValueError('dom_reference_page_changed')
        container_paths = {reference.ref: await _live_absolute_css(page, reference, 'dom_reference_container_mismatch')
                           for reference, _ in records}
        container_selector = ','.join(container_paths[reference.ref] for reference, _ in records)
        try:
            live = await page.get_elements_by_css_selector(container_selector)
            live_backends = [await _element_backend(element) for element in live]
        except Exception as error:
            raise ValueError('dom_reference_container_mismatch') from error
        expected_backends = [reference.backend_id for reference, _ in records]
        if live_backends != expected_backends:
            raise ValueError('dom_reference_container_mismatch')
        fields = await self._field_locators(records, page, container_paths)
        return expand_field_read_params(
            params, target_schema, container=container_selector, fields=fields)

    def _record_container(self, record):
        selected = [self._get(ref) for field in record.fields.values() for ref in field.refs]
        target_id, url = _same_page(selected)
        ancestor = _bounded_common_ancestor([item.node for item in selected], target_id)
        # WHY: records already express model intent. Parent scope is a DOM fact, so derive it from
        # selected nodes instead of asking the model to invent or identify a parent selector/ref.
        if node_tag(ancestor) in ('html', 'body'):
            raise ValueError('dom_reference_record_scope_mismatch')
        return self._remember(ancestor, target_id, url)

    async def _field_locators(self, records, page, container_paths):
        names = [set(record.fields) for _, record in records]
        if not names or any(value != names[0] for value in names[1:]):
            raise ValueError('natural_read_schema_mismatch')
        output = {}
        for name in sorted(names[0]):
            selections, selectors, attribute = [], [], object()
            for container, record in records:
                field = record.fields[name]
                if not isinstance(attribute, (str, type(None))):
                    attribute = field.attribute
                elif attribute != field.attribute:
                    raise ValueError('dom_reference_attribute_mismatch')
                selected = [self._get(ref) for ref in field.refs]
                if any(item.target_id != container.target_id or item.url != container.url
                       or not _descendant_or_self(container.node, item.node) for item in selected):
                    raise ValueError('dom_reference_outside_container')
                paths = []
                for item in selected:
                    absolute = await _live_absolute_css(page, item, 'dom_reference_field_mismatch')
                    paths.append(_relative_live_css(container_paths[container.ref], absolute))
                selections.append((container, selected, paths))
                selectors.extend(paths)
            selector = ','.join(dict.fromkeys(selectors))
            for container, selected, _ in selections:
                try:
                    element = await element_from_backend(page, container.backend_id, container.target_id)
                    raw = await element.evaluate(FIELD_QUERY_PATHS, selector)
                    result = json.loads(raw)
                except Exception as error:
                    raise ValueError('dom_reference_field_mismatch') from error
                expected = next(paths for owner, _selected, paths in selections if owner.ref == container.ref)
                actual = result.get('selectors') if isinstance(result, dict) else None
                if (not isinstance(actual, list) or len(actual) != len(expected)
                        or set(actual) != set(expected)):
                    raise ValueError('dom_reference_field_mismatch')
            output[name] = {'selector': selector, 'attribute': attribute}
        return output

    def _remember(self, node, target_id, url):
        backend = node_value(node, 'backend_node_id')
        session = _string(node_value(node, 'session_id'))
        if type(backend) is not int:
            raise ValueError('dom_reference_identity_unavailable')
        key = (target_id, session, backend)
        ref = self.identity_refs.get(key)
        if ref is None:
            ref = f'dom-{len(self.references) + 1}'
            self.identity_refs[key] = ref
            self.references[ref] = DomReference(ref, target_id, url, backend, session, node)
        return self.references[ref]

    def _get(self, ref):
        value = self.references.get(ref)
        if value is None:
            raise ValueError('dom_reference_missing')
        return value


def register_dom_inspection_tool(tools):
    store = DomReferenceStore()

    @tools.action(
        'Inspect a bounded real DOM neighborhood around one current browser_state index. Returns opaque dom-* refs, '
        'parent relationships, stable attributes, and bounded visible text. Use returned refs with bat_read_fields; '
        'never invent or edit a ref. This authoring-only inspection does not require or return CSS.',
        param_model=DomInspectParams,
    )
    async def bat_inspect_dom(params: DomInspectParams, browser_session: BrowserSession) -> ActionResult:
        try:
            result = await store.inspect(browser_session, params.index)
        except ValueError as error:
            return ActionResult(error=str(error))
        return ActionResult(extracted_content=json.dumps(
            result, ensure_ascii=False, separators=(',', ':'), allow_nan=False),
            # WHY: Browser-Use gives long_term_memory precedence over extracted_content. The refs are
            # transient authoring input, so expose them exactly once instead of silently replacing them
            # with the summary below or retaining page text in long-term model memory.
            include_extracted_content_only_once=True,
            long_term_memory=f'Inspected {len(result["nodes"])} bounded DOM nodes around browser index {params.index}.')

    return store


def sanitized_inspection_result(result):
    """Keep transient page text in Agent memory, not persisted normalized evidence."""
    value = result.model_dump(mode='json')
    if not result.error:
        value['extracted_content'] = 'Bounded DOM inspection omitted from persisted evidence.'
    return value


def _local_nodes(anchor, target_id):
    ancestors, current = [], anchor
    while current is not None and len(ancestors) < MAX_ANCESTORS:
        if not _same_document_node(current, target_id):
            break
        ancestors.append(current)
        current = node_value(current, 'parent_node')
    selected, seen = [], set()

    def add(node, depth):
        if (len(selected) >= MAX_LOCAL_NODES or id(node) in seen
                or not _same_document_node(node, target_id) or node_tag(node).startswith('#')):
            return
        seen.add(id(node))
        selected.append(node)
        if depth >= MAX_DESCENDANT_DEPTH:
            return
        for child in _element_children(node):
            add(child, depth + 1)

    for ancestor in ancestors:
        add(ancestor, 0)
    return selected


def _model_node(reference, store):
    node = reference.node
    parent = node_value(node, 'parent_node')
    parent_backend = node_value(parent, 'backend_node_id') if parent is not None else None
    parent_ref = next((value for value in store.references.values()
                       if value.target_id == reference.target_id and value.backend_id == parent_backend), None)
    attributes = node_value(node, 'attributes') or {}
    visible = {name: str(attributes[name])[:240] for name in VISIBLE_ATTRIBUTES if attributes.get(name)}
    text = _node_text(node)
    return {'ref': reference.ref, 'parentRef': parent_ref.ref if parent_ref else None,
            'tag': node_tag(node), 'attributes': visible, 'text': text[:240]}


def _inspection_payload(anchor_ref, references, store, traversal_truncated):
    nodes = []
    for reference in references:
        candidate = [*nodes, _model_node(reference, store)]
        # `false` is one character longer than `true`, so it is the safe size bound for either outcome.
        payload = {'anchorRef': anchor_ref, 'nodes': candidate, 'truncated': False}
        encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        if len(encoded) > MAX_MODEL_OUTPUT_CHARS:
            break
        nodes = candidate
    return {'anchorRef': anchor_ref, 'nodes': nodes,
            'truncated': traversal_truncated or len(nodes) < len(references)}


def _node_text(node):
    try:
        value = node.get_all_children_text(max_depth=3)
    except Exception:
        value = node_value(node, 'node_value') or ''
    return ' '.join(str(value).split())


def _same_document_node(node, target_id):
    return (node_value(node, 'target_id') == target_id
            and node_value(node, 'frame_id') is None
            and node_value(node, 'shadow_root_type') is None)


def _same_page(references):
    pages = {(item.target_id, item.url) for item in references}
    if len(pages) != 1:
        raise ValueError('dom_reference_page_changed')
    return next(iter(pages))


async def _live_absolute_css(page, reference, mismatch):
    try:
        # Browser-Use Actor requires a requested DOM document before a backend id can be pushed
        # into the frontend. Reuse the shared main-document initializer instead of reaching into CDP.
        element = await element_from_backend(page, reference.backend_id, reference.target_id)
        selector = await element.evaluate(LIVE_ABSOLUTE_CSS)
        if not isinstance(selector, str) or not selector:
            raise ValueError(mismatch)
        matches = await page.get_elements_by_css_selector(selector)
        if len(matches) != 1 or await _element_backend(matches[0]) != reference.backend_id:
            raise ValueError(mismatch)
        return selector
    except Exception as error:
        if isinstance(error, ValueError) and str(error) == mismatch:
            raise
        raise ValueError(mismatch) from error


def _relative_live_css(container, node):
    if node == container:
        return ':scope'
    prefix = container + ' > '
    if not node.startswith(prefix):
        raise ValueError('dom_reference_outside_container')
    return ':scope > ' + node[len(prefix):]


def _element_children(node):
    if node is None:
        return []
    return [child for child in (node_value(node, 'children_nodes') or [])
            if not node_tag(child).startswith('#')]


def _descendant_or_self(container, node):
    current = node
    while current is not None:
        if current is container:
            return True
        current = node_value(current, 'parent_node')
    return False


def _bounded_common_ancestor(nodes, target_id):
    chains = [_bounded_ancestor_chain(node, target_id) for node in nodes]
    if not chains or any(not chain for chain in chains):
        raise ValueError('dom_reference_record_scope_mismatch')
    remaining = [{_node_identity(node) for node in chain} for chain in chains[1:]]
    for candidate in chains[0]:
        identity = _node_identity(candidate)
        if identity is not None and all(identity in values for values in remaining):
            return candidate
    raise ValueError('dom_reference_record_scope_mismatch')


def _bounded_ancestor_chain(node, target_id):
    output, current = [], node
    while current is not None and len(output) <= MAX_RECORD_ANCESTOR_HOPS:
        if not _same_document_node(current, target_id) or _node_identity(current) is None:
            break
        output.append(current)
        current = node_value(current, 'parent_node')
    return output


def _node_identity(node):
    backend = node_value(node, 'backend_node_id')
    if type(backend) is not int:
        return None
    return (_string(node_value(node, 'target_id')), _string(node_value(node, 'session_id')), backend)


async def _element_backend(element):
    info = await element.get_basic_info()
    value = info.get('backendNodeId') if isinstance(info, dict) else getattr(info, 'backendNodeId', None)
    if type(value) is not int:
        raise ValueError('dom_reference_identity_unavailable')
    return value


def _string(value):
    return str(value) if value is not None and str(value) else None
