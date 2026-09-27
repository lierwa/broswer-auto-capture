"""Derive final-output mappings from two in-memory enhanced-DOM snapshots."""

import itertools
from copy import deepcopy
from dataclasses import dataclass

from .evidence import digest
from .natural_reads import current_page, page_identity
from .record_projection_capture import (
    MAX_SELECTOR_CANDIDATES,
    CapturedHostRead,
    HostProjectionFailure,
    HostReadMapping,
    _container_identities,
    _enhanced_root,
    projection_candidates,
)
from .record_projection_schema import field_schema
from .query_record_projection import query_snapshot_projection


@dataclass(frozen=True)
class HostSnapshotPair:
    first: object
    second: object
    identity: dict[str, str]


async def capture_host_snapshots(browser):
    """Keep two same-page DOM snapshots in memory; raw DOM never enters the artifact."""
    # WHY：Browser-Use 会在后续观察/导航时原地更新节点图；这里必须在任何下一次 await 前
    # 冻结证据，否则第一页引用会悄悄变成第二页或详情页，形成错误来源绑定。
    first = deepcopy(await browser.get_browser_state_summary(include_screenshot=False))
    first_identity = await page_identity(await current_page(browser))
    second = deepcopy(await browser.get_browser_state_summary(include_screenshot=False))
    second_identity = await page_identity(await current_page(browser))
    if first_identity != second_identity:
        raise HostProjectionFailure('host_record_projection_page_changed')
    if any(getattr(item, 'url', None) != first_identity['url'] for item in (first, second)):
        raise HostProjectionFailure('host_record_projection_page_changed')
    _enhanced_root(first)
    _enhanced_root(second)
    return HostSnapshotPair(first=first, second=second, identity=first_identity)


def derive_host_read(snapshots, output_schema, final_output, queries=()):
    """Choose the unique maximal projection proved by both snapshots and final output."""
    candidates = []
    for candidate_schema, candidate_output, mappings in _projection_inputs(output_schema, final_output):
        try:
            captured = _stable_snapshot_projection(
                snapshots, candidate_schema, candidate_output, mappings)
        except HostProjectionFailure:
            try:
                captured = query_snapshot_projection(
                    snapshots, queries, candidate_schema, candidate_output, mappings)
            except HostProjectionFailure:
                continue
        candidates.append((_leaf_count(candidate_output), captured))
        if len(candidates) >= MAX_SELECTOR_CANDIDATES:
            break
    if not candidates:
        raise HostProjectionFailure('host_record_projection_unavailable')
    best_score = max(score for score, _captured in candidates)
    best = {digest(item): item for score, item in candidates if score == best_score}
    if len(best) != 1:
        raise HostProjectionFailure('host_record_projection_ambiguous')
    return next(iter(best.values()))


def _stable_snapshot_projection(snapshots, output_schema, output, mappings):
    first_root, second_root = _enhanced_root(snapshots.first), _enhanced_root(snapshots.second)
    page_url = snapshots.identity['url']
    first = projection_candidates(first_root, output_schema, output, page_url, include_output=True)
    second = projection_candidates(second_root, output_schema, output, page_url, include_output=True)
    if (len(first) != 1 or len(second) != 1
            or digest(first[0][0]) != digest(second[0][0])
            or digest(first[0][1]) != digest(second[0][1])):
        raise HostProjectionFailure('host_record_projection_changed')
    first_ids = _container_identities(first_root, output_schema, output, page_url)
    second_ids = _container_identities(second_root, output_schema, output, page_url)
    if first_ids != second_ids:
        raise HostProjectionFailure('host_record_projection_container_changed')
    return CapturedHostRead(
        specification=first[0][0], output=first[0][1], mappings=mappings,
        urlDigest=digest(page_url), targetId=snapshots.identity['targetId'],
        # WHY：原生 find_elements 的稳定集合证据按 backendNodeId 顺序取摘要；
        # 这里已经单独核验 targetId，同一格式才能在首次现场证明两次读取是同一批元素。
        containerIdsDigest=digest([backend for _target, backend in first_ids]), stable=True)


def _projection_inputs(schema, value, path=None):
    path = [] if path is None else path
    output = []
    if _scalar_schema(schema):
        # WHY：ReadSpec 统一读取对象记录；根标量只在宿主投影边界包装成 value 字段，
        # 最终映射仍写回原合同的空路径，不把适配形状泄漏给任务输出。
        wrapped_schema = {
            'type': 'object',
            'properties': {'value': schema},
            'required': ['value'],
            'additionalProperties': False,
        }
        output.append((wrapped_schema, {'value': value}, [
            HostReadMapping(outputPath=path, readPath=['value']),
        ]))
    if isinstance(schema, dict) and schema.get('type') in ('object', 'array'):
        output.append((schema, value, [HostReadMapping(outputPath=path, readPath=[])]))
        if schema.get('type') == 'object' and isinstance(value, dict):
            output.extend(_object_projection_inputs(schema, value, path))
    if isinstance(schema, dict) and schema.get('type') == 'object' and isinstance(value, dict):
        for name, child in schema.get('properties', {}).items():
            if name in value and isinstance(child, dict):
                output.extend(_projection_inputs(child, value[name], [*path, name]))
    return sorted(output, key=lambda item: _leaf_count(item[1]), reverse=True)


def _scalar_schema(schema):
    return isinstance(schema, dict) and schema.get('type') in ('string', 'number', 'integer', 'boolean')


def _object_projection_inputs(schema, value, path):
    properties = schema.get('properties', {})
    names = [name for name in sorted(value) if name in properties and field_schema(properties[name])]
    output = []
    for size in range(len(names) - 1, 0, -1):
        for selected in itertools.combinations(names, size):
            candidate_schema = {
                'type': 'object', 'properties': {name: properties[name] for name in selected},
                'required': list(selected), 'additionalProperties': False,
            }
            candidate_value = {name: value[name] for name in selected}
            mappings = [HostReadMapping(outputPath=[*path, name], readPath=[name]) for name in selected]
            output.append((candidate_schema, candidate_value, mappings))
            if len(output) >= MAX_SELECTOR_CANDIDATES:
                return output
    return output


def _leaf_count(value):
    if isinstance(value, dict) and value:
        return sum(_leaf_count(item) for item in value.values())
    if isinstance(value, list) and value:
        return sum(_leaf_count(item) for item in value)
    return 1
