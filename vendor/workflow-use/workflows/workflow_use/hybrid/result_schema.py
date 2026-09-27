"""Validate executable result bindings separately from representative samples."""
from .method_read_schema import compatible_read_schema


class ResultSchemaFailure(ValueError):
    def __init__(self, reason, action_ref):
        self.action_refs = [action_ref]
        super().__init__(reason)


def assert_result_read_schema(source, target, read):
    if not compatible_read_schema(source, target):
        raise ValueError('natural_output_schema_mismatch')
    if source.get('type') != 'array':
        return
    lower = max(source.get('minItems', 0), target.get('minItems', 0))
    upper = min(source.get('maxItems', float('inf')), target.get('maxItems', float('inf')))
    # WHY：样本可少于目标总量，但正式直连的源/目标值域不能互斥；聚合需要真实执行节点。
    if lower > upper:
        raise ResultSchemaFailure('natural_output_cardinality_disjoint', read.actionRef)
    total = complete_read_total(read)
    if total is not None and total < target.get('minItems', 0):
        raise ResultSchemaFailure('natural_output_collection_incomplete', read.actionRef)
    if total is not None and total > target.get('maxItems', float('inf')):
        # WHY：当前完整 DOM 已知超过最终上限，少量样本不能代替已确认选择规则的执行。
        raise ResultSchemaFailure('natural_output_selection_required', read.actionRef)


def complete_read_total(read):
    coverage = read.coverage
    if (coverage is not None and coverage.scope == 'current_dom_matches'
            and not coverage.runtimeTruncated and read.specification.requireComplete):
        return coverage.total
    return None


def assert_result_count_schema(target, read):
    total = complete_read_total(read)
    if total is not None and not target.get('minimum', float('-inf')) <= total <= target.get('maximum', float('inf')):
        # WHY：count 的正式值来自完整集合，不能用 count 节点声明的 schema 掩盖已知数量矛盾。
        raise ResultSchemaFailure('natural_output_count_cardinality_mismatch', read.actionRef)
