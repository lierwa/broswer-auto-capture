"""Adapt live collection entries to existing native target resolution and each inputs."""
from pydantic import Field, model_serializer
from urllib.parse import urlsplit

from .evidence import Contract, digest

LEGACY_ENTRY_SCHEMA = {'type': 'object', 'properties': {
    'kind': {'type': 'string', 'minLength': 1, 'maxLength': 7},
    'tabId': {'type': 'string', 'minLength': 4, 'maxLength': 4},
    'url': {'type': 'string', 'minLength': 1, 'maxLength': 32000},
    'selector': {'type': 'string', 'minLength': 1, 'maxLength': 2000},
    'ordinal': {'type': 'integer', 'minimum': 1, 'maximum': 300},
    'text': {'type': 'string', 'minLength': 0, 'maxLength': 8000},
    'backendNodeId': {'type': 'integer', 'minimum': 1, 'maximum': 9007199254740991},
    'documentRootId': {'type': 'integer', 'minimum': 1, 'maximum': 9007199254740991}},
    'required': ['kind', 'tabId', 'url', 'selector', 'ordinal', 'text', 'backendNodeId', 'documentRootId'],
    'additionalProperties': False}
ENTRY_SCHEMA = {**LEGACY_ENTRY_SCHEMA, 'properties': {**LEGACY_ENTRY_SCHEMA['properties'],
    'navigationUrl': {'type': 'string', 'minLength': 1, 'maxLength': 32000}}}
ENTRY_TEXT = "() => (this.textContent || '').replace(/\\s+/g, ' ').trim()"
ENTRY_NAVIGATION = "() => this.tagName === 'A' && !this.hasAttribute('download') && this.getAttribute('href') ? this.href : null"


class ElementEntry(Contract):
    kind: str = Field(pattern=r'^element$')
    tabId: str = Field(min_length=4, max_length=4)
    url: str = Field(min_length=1, max_length=32000)
    selector: str = Field(min_length=1, max_length=2000)
    ordinal: int = Field(gt=0, le=300)
    text: str = Field(max_length=8000)
    backendNodeId: int = Field(gt=0, le=9007199254740991)
    documentRootId: int = Field(gt=0, le=9007199254740991)
    navigationUrl: str | None = Field(default=None, min_length=1, max_length=32000)

    @model_serializer(mode='wrap')
    def preserve_legacy_shape(self, serialize):
        value = serialize(self)
        if self.navigationUrl is None:
            value.pop('navigationUrl', None)
        return value


def entry_field(schema):
    record = schema.get('items', {}) if schema.get('type') == 'array' else schema
    matches = [name for name, value in record.get('properties', {}).items()
               if value in (ENTRY_SCHEMA, LEGACY_ENTRY_SCHEMA)]
    return matches[0] if len(matches) == 1 else None


def entry_supports_navigation(schema, field):
    record = schema.get('items', {}) if schema.get('type') == 'array' else schema
    return record.get('properties', {}).get(field) == ENTRY_SCHEMA


async def entry_document_id(page):
    from .targets import _element_backend
    roots = await page.get_elements_by_css_selector(':root')
    if len(roots) != 1:
        raise ValueError('entry_source_document_unavailable')
    return await _element_backend(roots[0])


async def live_entry(browser, element, selector, ordinal, *, document_root=None, include_navigation=False):
    from .targets import _element_backend
    page = await browser.get_current_page()
    info = await page.get_target_info()
    text = await element.evaluate(ENTRY_TEXT)
    # WHY：浏览器原生 href 属性负责相对地址及 base URI；不从整行任意子链接猜入口。
    navigation = await element.evaluate(ENTRY_NAVIGATION) if include_navigation else None
    if not isinstance(navigation, str) or urlsplit(navigation).scheme not in ('http', 'https'):
        navigation = None
    return ElementEntry(kind='element', tabId=info['targetId'][-4:], url=await page.get_url(),
                        selector=selector, ordinal=ordinal, text=text[:8000], backendNodeId=await _element_backend(element),
                        documentRootId=document_root if document_root is not None else await entry_document_id(page),
                        navigationUrl=navigation).model_dump(mode='json')


def entry_key_record(record, key_field, entry_field):
    values = {name: value for name, value in record.items() if name != key_field}
    if entry_field is not None:
        # WHY：原生节点身份只属于当前文档；临时 backend/根不参与本运行来源去重键。
        values[entry_field] = {name: value for name, value in values[entry_field].items()
                               if name not in ('backendNodeId', 'documentRootId')}
    return values


def entry_inputs(value, schema, path=()):
    if schema in (ENTRY_SCHEMA, LEGACY_ENTRY_SCHEMA):
        yield list(path), ElementEntry.model_validate(value)
    elif isinstance(value, dict):
        for name, child in value.items():
            child_schema = schema.get('properties', {}).get(name)
            if isinstance(child_schema, dict):
                yield from entry_inputs(child, child_schema, (*path, name))


def entry_related_backends(summary, selector_index, target_id):
    from .post_action_target import _selector_node
    from .record_projection_dom import _ancestors_to_root
    from .targets import _ancestor_has, _backend_id, _walk_structural
    node = _selector_node(summary, selector_index)
    backend = _backend_id(node)
    nodes = [*_ancestors_to_root(node), *_walk_structural(node)]
    # WHY：点击子控件也属于该入口；只保存同文档包含关系，公共祖先不等于同一条目。
    return frozenset(_backend_id(item) for item in nodes if type(_backend_id(item)) is int
        and (_ancestor_has(node, _backend_id(item), target_id, None)
             or _ancestor_has(item, backend, target_id, None)))


async def entry_target_fact(browser, identity, input_value, input_schema, action_ref, related_backends=(), descendants=()):
    from .targets import _element_backend
    inputs = list(entry_inputs(input_value, input_schema))
    if not inputs:
        return None
    page = await browser.get_current_page()
    info = await page.get_target_info()
    document_root = await entry_document_id(page)
    matches, contexts = [], []
    for path, entry in inputs:
        if info['targetId'][-4:] != entry.tabId or await page.get_url() != entry.url:
            continue
        context = {'actionRef': action_ref, 'binding': {'source': 'input', 'path': path},
                   'entry': entry.model_dump(mode='json'), 'backendNodeId': identity.backend,
                   'targetId': info['targetId']}
        contexts.append(context)
        if document_root != entry.documentRootId:
            return {**context, 'factKind': 'input_entry_mismatch', 'check': 'document'}
        elements = await page.get_elements_by_css_selector(entry.selector)
        backends = [await _element_backend(element) for element in elements]
        descendant = next((item for item in descendants if item.record_backend == entry.backendNodeId
            and item.target_backend == identity.backend and item.target_id == info['targetId']), None)
        if descendant is not None:
            from .entry_descendant import resolve_entry_descendant
            if backends.count(entry.backendNodeId) != 1 or entry.backendNodeId not in related_backends:
                return {**context, 'factKind': 'input_entry_mismatch', 'check': 'record_membership',
                        'rootMatches': backends.count(entry.backendNodeId)}
            try:
                actual = await resolve_entry_descendant(browser, entry, descendant.selector)
                actual_backend = await _element_backend(actual)
            except Exception as error:
                # WHY：原生查询或身份读取失败也无法证明归属；保留 mismatch 门，取消的 BaseException 继续传播。
                from .method_read_tool import _safe_failure_detail
                return {**context, 'factKind': 'input_entry_mismatch', 'check': 'descendant_query',
                        'diagnostic': _safe_failure_detail(error)}
            # WHY：冻结归属只证明旧快照；登记方法时必须仍命中实际动作的 backend，不能保存跨记录/重排后的旧定位。
            if actual_backend != identity.backend:
                return {**context, 'factKind': 'input_entry_mismatch', 'check': 'descendant_identity'}
            matches.append({**context, 'withinEntry': descendant.selector})
            continue
        selected = [element for element, backend in zip(elements, backends, strict=True)
                    if backend == identity.backend]
        if len(selected) != 1 or identity.backend != entry.backendNodeId:
            if identity.backend in backends or any(backend in related_backends for backend in backends):
                return {**context, 'factKind': 'input_entry_mismatch', 'check': 'observed_binding',
                        'rootMatches': backends.count(entry.backendNodeId), 'observedDescendant': descendant is not None}
            continue
        matches.append(context)
    if len(matches) == 1:
        return matches[0]
    if contexts:
        return {**contexts[0], 'factKind': 'input_entry_mismatch' if len(matches) > 1 else 'input_entry_context'}
    return None


async def resolve_entry_element(browser, raw, within_entry=None):
    entry = ElementEntry.model_validate(raw)
    page = await browser.get_current_page()
    info = await page.get_target_info()
    if info['targetId'][-4:] != entry.tabId or await page.get_url() != entry.url \
            or await entry_document_id(page) != entry.documentRootId:
        raise ValueError('entry_source_page_changed')
    elements = await page.get_elements_by_css_selector(entry.selector)
    if len(elements) > 300:
        raise ValueError('entry_collection_limit')
    from .targets import _element_backend
    matches = [element for element in elements if await _element_backend(element) == entry.backendNodeId]
    # WHY：图片/同名入口无需文字；匹配同文档原生身份，不能用旧 ordinal 点到其它项。
    if len(matches) != 1:
        raise ValueError('entry_identity_missing_or_ambiguous')
    if within_entry is not None:
        from .entry_descendant import resolve_entry_descendant
        return await resolve_entry_descendant(browser, entry, within_entry)
    return matches[0]


def compiled_entry_target(action, pre, input_schema):
    facts = [fact for fact in pre.facts if fact.kind == 'input_entry_target'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if len(facts) != 1:
        return None
    fact, value = facts[0], facts[0].value
    entry = ElementEntry.model_validate(value['entry'])
    within = value.get('withinEntry')
    if within is not None and (not isinstance(within, str) or not within.startswith(':scope > ')
                              or len(within) > 2000 or ',' in within):
        raise ValueError('input_entry_target_invalid')
    schema = input_schema
    for part in value['binding']['path']:
        if not isinstance(part, str) or part not in schema.get('required', []):
            raise ValueError('input_entry_target_invalid')
        schema = schema.get('properties', {}).get(part, {})
    if (schema not in (ENTRY_SCHEMA, LEGACY_ENTRY_SCHEMA) or value['binding']['source'] != 'input'
            or entry.tabId != pre.tabId[-4:] or entry.url != pre.url
            or within is None and entry.backendNodeId != value['backendNodeId']
            or value['targetId'] != pre.tabId or not fact.sourceRefs
            or any(ref.digest != digest({'kind': fact.kind, 'value': value}) for ref in fact.sourceRefs)):
        raise ValueError('input_entry_target_invalid')
    return {'strategy': 'entry', 'entryBinding': value['binding'], **({'withinEntry': within} if within else {})}, fact.sourceRefs
