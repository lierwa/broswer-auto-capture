"""Join complete native query identities to two frozen extract snapshots."""
import itertools

from jsonschema import Draft202012Validator

from .evidence import digest
from .natural_reads import find_elements_read_spec
from .read import ReadSpec, read_value
from .record_projection_capture import (
    CapturedHostRead, HostProjectionFailure, MAX_RECORDS, MAX_SELECTOR_CANDIDATES, _enhanced_root,
)
from .record_projection_dom import _element_children, _identity, _projected, _relative_selector
from .dom_evidence import node_tag


def query_snapshot_projection(snapshots, queries, schema, rows, mappings):
    """Reuse original query fields; never rename or replace the original query fact."""
    candidates = {}
    for query, verified in queries:
        try:
            fields = _mapped_fields(query, verified, schema, rows)
            if (verified.targetId != snapshots.identity['targetId']
                    or verified.urlDigest != digest(snapshots.identity['url'])):
                continue
            selectors = [_snapshot_selector(summary, snapshots.identity, fields, rows,
                                             verified.containerIdsDigest)
                         for summary in (snapshots.first, snapshots.second)]
            if selectors[0] != selectors[1]:
                continue
            specification = ReadSpec(container=selectors[0], fields=fields,
                maxItems=schema.get('maxItems', MAX_RECORDS), requireComplete=True,
                maxInputBytes=128000, outputSchema=schema)
            captured = CapturedHostRead(specification=specification, output=rows, mappings=mappings,
                urlDigest=verified.urlDigest, targetId=verified.targetId,
                containerIdsDigest=verified.containerIdsDigest, stable=True)
            candidates[digest(captured)] = captured
        except (ValueError, KeyError, TypeError):
            continue
    if len(candidates) != 1:
        raise HostProjectionFailure('host_query_projection_unproven')
    return next(iter(candidates.values()))


def _mapped_fields(query, verified, schema, rows):
    if (schema.get('type') != 'array' or schema.get('items', {}).get('type') != 'object'
            or not rows or verified.stable is not True or query.total != len(rows)
            or verified.actionRef != query.actionRef
            or verified.specification != find_elements_read_spec(query)
            or not isinstance(verified.output, list) or len(verified.output) != len(rows)):
        raise ValueError('query_projection_source_mismatch')
    Draft202012Validator(schema).validate(rows)
    properties = schema['items']['properties']
    if any(set(row) != set(properties) for row in rows):
        raise ValueError('query_projection_fields_mismatch')
    mapped, used = {}, set()
    for name, target in properties.items():
        options = [source for source, field in verified.specification.fields.items()
                   if field.selector == ':scope' and not field.multiple
                   and target.get('type') == field.valueType
                   and all(source in actual and digest(actual[source]) == digest(expected[name])
                           for actual, expected in zip(verified.output, rows, strict=True))]
        # WHY：字段语义由已确认 schema 和模型结果给出；宿主只认全列唯一精确对应，
        # 不按字段名猜测、不筛记录、不改顺序、不将结果写成常量。
        if len(options) != 1 or options[0] in used:
            raise ValueError('query_projection_mapping_ambiguous')
        used.add(options[0])
        mapped[name] = verified.specification.fields[options[0]]
    return mapped


def _snapshot_selector(summary, identity, fields, rows, expected_ids):
    if summary.url != identity['url']:
        raise ValueError('query_projection_snapshot_url_changed')
    nodes = _all_elements(_enhanced_root(summary))
    body = next((node for node in nodes if node_tag(node) == 'body'), None)
    if body is None:
        raise ValueError('query_projection_body_missing')
    indexed = {}
    for node in _all_elements(body):
        node_identity = _identity(node)
        if node_identity is None or node_identity[0] != identity['targetId']:
            continue
        value = {name: _field_value(node, name, field, identity['url'])
                 for name, field in fields.items()}
        indexed.setdefault(digest(value), []).append(node)
    options = [indexed.get(digest(row), []) for row in rows]
    matches = []
    for selected in itertools.islice(itertools.product(*options), MAX_SELECTOR_CANDIDATES + 1):
        ids = [_identity(node)[1] for node in selected]
        if len(set(ids)) == len(ids) and digest(ids) == expected_ids:
            matches.append(selected)
    if len(matches) != 1:
        raise ValueError('query_projection_snapshot_identity_unproven')
    # WHY：视口外元素可由原生 textContent 查询读到；身份摘要限定同一批记录，
    # 再用已有结构选择器证明完整集合，不能把当前行号固化为可执行选择器。
    selector = _relative_selector([body], [matches[0]], allow_prefix=False)
    if selector is None:
        raise ValueError('query_projection_snapshot_selector_unproven')
    return 'body' + selector.removeprefix(':scope')


def _field_value(node, name, field, url):
    raw = _projected(node, field.attribute, url, field.resolveUrl, field.normalizeWhitespace)
    if raw is None and field.optionalAttribute:
        return ''
    try:
        return read_value(name, raw, field)
    except (ValueError, TypeError):
        return None


def _all_elements(root):
    output, pending = [], [root]
    while pending:
        if len(output) >= 20000:
            raise ValueError('query_projection_snapshot_node_limit')
        node = pending.pop()
        output.append(node)
        pending.extend(reversed(_element_children(node)))
    return output
