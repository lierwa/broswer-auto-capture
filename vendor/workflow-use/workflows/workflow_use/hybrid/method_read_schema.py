"""Keep representative cardinality separate from the unchanged task result contract."""
from copy import deepcopy
from .natural_result_binding import _derivation_target, _schema_at, _spec, _value_at


def representative_schema(schema, sampled_paths, *, result_spec=None, output=None):
    result = deepcopy(schema)
    for path in sampled_paths:
        if any(type(part) is int for part in path):
            # WHY：共享 items schema 不能因一条记录的样本放宽未观察的其他记录。
            continue
        target = result
        for part in path:
            target = target['items'] if type(part) is int else target['properties'][part]
        if target.get('type') == 'array':
            # WHY：只免除代表样本的最终总量下限；字段类型、值约束与正式 schema 不改。
            target.pop('minItems', None)
    for path in proven_count_paths(schema, sampled_paths, result_spec, output):
        _schema_at(result, path).pop('minimum', None)
    return result


def proven_count_paths(schema, sampled_paths, result_spec, output):
    spec = _spec(result_spec)
    if spec.get('mode') != 'data':
        return []
    if spec['schema'] != schema:
        raise ValueError('representative_result_schema_mismatch')
    paths = []
    for derivation in spec.get('derivations', []):
        if derivation['operation'] != 'count' or derivation['sourcePath'] not in sampled_paths:
            continue
        target = _derivation_target(spec, derivation)['path']
        if any(type(part) is int for part in [*target, *derivation['sourcePath']]):
            continue
        values, count = _value_at(output, derivation['sourcePath']), _value_at(output, target)
        if (_schema_at(schema, derivation['sourcePath']).get('type') != 'array'
                or _schema_at(schema, target).get('type') != 'integer'
                or not isinstance(values, list) or type(count) is not int or count != len(values)):
            raise ValueError('representative_count_sample_mismatch')
        # WHY：只豁免同版 ResultSpec 声明且由已选样本真实派生的 count 下限，其他数字约束不变。
        paths.append(target)
    return paths


def compatible_read_schema(source, target):
    if source == target:
        return True
    if source.get('type') != 'array' or target.get('type') != 'array':
        return False
    # WHY：中间读取的预算不等于最终集合数量；最终数量仍由正式输出合同校验。
    return ({key: value for key, value in source.items() if key not in ('minItems', 'maxItems')}
            == {key: value for key, value in target.items() if key not in ('minItems', 'maxItems')})
