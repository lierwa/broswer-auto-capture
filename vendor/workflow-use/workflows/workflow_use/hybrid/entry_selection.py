"""Keep native index selection in the host; reuse the existing DOM projection selector."""
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

from pydantic import Field, PositiveInt, model_validator

from .evidence import Contract, digest
from .record_projection_dom import _elements, _identity, _relative_selector
from .record_projection_snapshot import _enhanced_root
from .dom_evidence import node_tag
from .post_action_target import _selector_node
from .targets import _walk_structural
from .history_target import _ax_name, _target_text


@dataclass(frozen=True)
class EntryPreview:
    backend: int
    index: int
    tag: str
    name: str
    destination_origin: str | None


@dataclass(frozen=True)
class EntryObservation:
    indices: tuple[int, ...]
    identities: tuple[tuple[str, int], ...]
    document: tuple[str, int]
    document_root: int
    url_digest: str
    previews: tuple[EntryPreview, ...] = ()


def capture_entry_indices(summary, indices, target_id):
    if not isinstance(indices, list) or not 1 <= len(indices) <= 300 \
            or any(type(index) is not int or index < 1 for index in indices) \
            or len(set(indices)) != len(indices):
        raise ValueError('native_entry_indices_invalid')
    try:
        identities = tuple(_identity(_selector_node(summary, index)) for index in indices)
        root = _enhanced_root(summary)
        document = _identity(root)
        html = [_identity(node) for node in _walk_structural(root)
                if node_tag(node) == 'html' and _identity(node) is not None and _identity(node)[0] == target_id]
    except Exception:
        raise ValueError('native_entry_observation_unavailable') from None
    if document is None or len(html) != 1 or not isinstance(getattr(summary, 'url', None), str):
        raise ValueError('native_entry_observation_unavailable')
    if any(identity is None or identity[0] != target_id for identity in identities) \
            or len(set(identities)) != len(identities) or document[0] != target_id:
        raise ValueError('native_entry_indices_invalid')
    # WHY：原生 selector_map 会被刷新；只复制模型所见身份，不能在工具执行时重新解释索引。
    previews = tuple(_entry_preview(_selector_node(summary, index), index, summary.url) for index in indices)
    return EntryObservation(tuple(indices), identities, document, html[0][1], digest(summary.url), previews)


def _entry_preview(node, index, url):
    attributes = getattr(node, 'attributes', {}) or {}
    name = _ax_name(node) or _target_text(node)
    if not name and isinstance(attributes, dict):
        name = next((attributes[key] for key in ('aria-label', 'title', 'alt')
                     if isinstance(attributes.get(key), str) and attributes[key]), '')
    href = attributes.get('href') if isinstance(attributes, dict) else None
    origin = None
    if isinstance(href, str) and '\\' not in href:
        try:
            parsed = urlsplit(urljoin(url, href))
            if parsed.scheme in ('http', 'https') and parsed.hostname:
                host = '[' + parsed.hostname + ']' if ':' in parsed.hostname else parsed.hostname
                origin = parsed.scheme + '://' + host + (':' + str(parsed.port) if parsed.port else '')
        except ValueError:
            pass
    # WHY：只把已观察入口识别信息交回原生 Agent；不存父子结构或链接查询/路径敏感值。
    return EntryPreview(_identity(node)[1], index, node_tag(node), name[:200], origin)


class EntrySelection(Contract):
    indices: list[PositiveInt] = Field(min_length=1, max_length=300)
    backendNodeIds: list[PositiveInt] = Field(min_length=1, max_length=300)
    container: str = Field(min_length=1, max_length=2000)
    targetId: str = Field(min_length=1)
    urlDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    documentRootId: PositiveInt
    containerIdsDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    selectedBackendNodeIds: list[PositiveInt] | None = None
    ancestorSteps: list[int] | None = None

    @model_validator(mode='after')
    def identities(self):
        if len(self.indices) != len(self.backendNodeIds) or len(set(self.indices)) != len(self.indices) \
                or len(set(self.backendNodeIds)) != len(self.backendNodeIds):
            raise ValueError('native_entry_indices_invalid')
        if self.selectedBackendNodeIds is not None and (len(self.selectedBackendNodeIds) != len(self.indices)
                or len(set(self.selectedBackendNodeIds)) != len(self.indices)
                or self.ancestorSteps is None or len(self.ancestorSteps) != len(self.indices)
                or any(type(step) is not int or step < 0 for step in self.ancestorSteps)):
            raise ValueError('native_entry_record_scope_unavailable')
        return self


async def select_entry_container(browser, indices, *, observation):
    from .entry_record_scope import record_roots, record_selector
    from .targets import _element_backend
    if not isinstance(observation, EntryObservation) or tuple(indices) != observation.indices:
        raise ValueError('native_entry_observation_unavailable')
    identities = observation.identities
    try:
        summary = await browser.get_browser_state_summary(include_screenshot=False, cached=False)
        root = _enhanced_root(summary)
    except Exception:
        raise ValueError('native_entry_dom_unavailable') from None
    if _identity(root) != observation.document or digest(getattr(summary, 'url', None)) != observation.url_digest:
        raise ValueError('native_entry_document_changed')
    nodes = _elements(root)
    available = {_identity(node): node for node in nodes}
    if any(identity is None or identity not in available for identity in identities):
        raise ValueError('native_entry_indices_invalid')
    body = next((node for node in nodes if node_tag(node) == 'body'), None)
    selector = _relative_selector([body], [[available[identity] for identity in identities]], allow_prefix=True) if body else None
    if not selector or selector == ':scope':
        raise ValueError('native_entry_selector_unavailable')
    container = 'body' + selector.removeprefix(':scope')
    try:
        page = await browser.get_current_page()
        info = await page.get_target_info()
        live = await page.get_elements_by_css_selector(container)
        backends = [await _element_backend(element) for element in live]
        url_digest = digest(await page.get_url())
    except Exception:
        raise ValueError('native_entry_query_failed') from None
    expected = [identity[1] for identity in identities]
    # WHY：原生索引只表达本次选择；宿主核验共同结构和真实前缀，不把样本索引写入复跑。
    if len(live) > 300 or backends[:len(expected)] != expected \
            or any(identity[0] != info['targetId'] for identity in identities) \
            or url_digest != observation.url_digest:
        raise ValueError('native_entry_selector_unavailable')
    # WHY：可见索引用于用户选择；完整CSS集合的成员关系必须复用完整原生DOM，不能因后续隐藏成员而拒绝前缀。
    structural = {_identity(node): node for node in _walk_structural(root) if _identity(node) is not None}
    members = [structural.get((info['targetId'], backend)) for backend in backends]
    if any(member is None for member in members):
        raise ValueError('native_entry_record_scope_unavailable')
    roots, steps = record_roots(members)
    container = record_selector(body, roots)
    record_backends = [await _element_backend(element) for element in await page.get_elements_by_css_selector(container)]
    if record_backends != [_identity(node)[1] for node in roots] or digest(await page.get_url()) != url_digest:
        raise ValueError('native_entry_record_scope_unavailable')
    return EntrySelection(indices=indices, backendNodeIds=record_backends[:len(indices)], container=container,
                          targetId=info['targetId'], urlDigest=url_digest,
                          documentRootId=observation.document_root, containerIdsDigest=digest(record_backends),
                          selectedBackendNodeIds=expected, ancestorSteps=steps[:len(indices)])


def assert_entry_sample(selection, sample):
    if selection is None:
        return
    if selection.targetId != sample.pageIdentity['targetId'] \
            or selection.urlDigest != digest(sample.pageIdentity['url']) \
            or selection.documentRootId != sample.documentRootId:
        raise ValueError('native_entry_document_changed')
    if selection.containerIdsDigest != sample.containerIdsDigest:
        raise ValueError('natural_read_container_identity_changed')


def proven_entry_container(action, trace, value):
    post = next((item for item in trace.observations if item.id == action.postObservationRef), None)
    facts = [fact for fact in post.facts if fact.kind == 'native_entry_selection'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id] if post else []
    if len(facts) != 1:
        raise ValueError('native_entry_selector_unavailable')
    fact = facts[0]
    selection = EntrySelection.model_validate({key: item for key, item in fact.value.items() if key != 'actionRef'})
    if selection.indices != action.args['indices'] or selection.container != value.specification.container \
            or selection.targetId != value.targetId or selection.urlDigest != value.urlDigest \
            or selection.documentRootId != value.documentRootId or selection.containerIdsDigest != value.containerIdsDigest \
            or not fact.sourceRefs or any(ref.digest != digest({'kind': fact.kind, 'value': fact.value}) for ref in fact.sourceRefs):
        raise ValueError('native_entry_selector_unavailable')
    return selection.container
