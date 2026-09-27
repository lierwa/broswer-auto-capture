"""Host-owned representative verification of an unchanged runtime ReadSpec."""
from jsonschema import Draft202012Validator
from jsonschema import ValidationError as JsonSchemaValidationError
from pydantic import Field, JsonValue

from .evidence import Contract, digest
from .natural_reads import (
    NaturalReadFailure, assert_identity, backend_id, current_page, page_identity, schema_at_path,
)
from .read import ReadSampleCoverage, ReadSpec, project_field_records
from .rendered_field_text import FieldReadError
from .targets import TargetResolver


class ReadSample(Contract):
    specificationDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    output: JsonValue
    outputDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    pageIdentity: dict[str, str]
    documentRootId: int
    containerIdsDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    coverage: ReadSampleCoverage


async def sample_read_fields(browser, specification: ReadSpec, *, sample_limit: int = 3,
                             expected_identity: dict[str, str] | None = None, read_path=()) -> ReadSample:
    """Verify bounded first/tail DOM samples twice, not a complete business result."""
    if type(sample_limit) is not int or not 1 <= sample_limit <= 300:
        raise ValueError('read_sample_limit_invalid')
    Draft202012Validator.check_schema(specification.outputSchema)
    method_digest = digest(specification)
    sample_field = _collection_field(specification, read_path)
    runtime_maximum = specification.fields[sample_field].maxValues if sample_field else specification.maxItems
    before, elements = await _snapshot(browser, specification, expected_identity)
    identity = before['page']
    _validate_collection_budget(specification, len(elements))
    first, first_total = await _sample_output(browser, specification, elements, sample_field, sample_limit)
    middle, elements = await _snapshot(browser, specification, identity)
    _assert_snapshot(before, middle)
    second, second_total = await _sample_output(browser, specification, elements, sample_field, sample_limit)
    after, _ = await _snapshot(browser, specification, identity)
    _assert_snapshot(before, after)
    if digest(first) != digest(second) or first_total != second_total:
        raise NaturalReadFailure('natural_read_output_changed')
    if digest(specification) != method_digest:
        raise NaturalReadFailure('read_sample_method_changed')
    # WHY：这里只证明当前 DOM 的有界代表样本；数量与预算事实不能代表分页后的业务全集。
    # 空样本只记录当前无匹配，不能被编译方当成字段投影已获验证。
    total = first_total if sample_field else len(before['ids'])
    return ReadSample(specificationDigest=method_digest, output=first, outputDigest=digest(first),
        pageIdentity=identity, documentRootId=before['root'], containerIdsDigest=digest(before['ids']),
        coverage=ReadSampleCoverage(total=total, sampled=min(total, sample_limit, runtime_maximum),
                                    sampleLimit=sample_limit, runtimeTruncated=total > runtime_maximum))


def _collection_field(specification, read_path):
    source = schema_at_path(specification.outputSchema, read_path)
    if not read_path or source.get('type') != 'array':
        return None
    # WHY：复用已有标量数组包装；coverage 沿真实 readPath 计数，不能把一百个值报告为一个样本。
    if len(read_path) != 1 or read_path[0] not in specification.fields:
        raise NaturalReadFailure('read_sample_schema_unsupported')
    field = specification.fields[read_path[0]]
    if not field.multiple or specification.outputSchema.get('type') != 'object':
        raise NaturalReadFailure('read_sample_schema_unsupported')
    return read_path[0]


async def _snapshot(browser, specification, expected_identity):
    identity = await page_identity(await current_page(browser))
    if expected_identity is not None:
        assert_identity(identity, expected_identity)
    resolver = TargetResolver(browser)
    roots = await resolver.resolve_collection(':root')
    if len(roots) != 1:
        raise NaturalReadFailure('read_sample_document_identity_unavailable')
    root = await backend_id(roots[0])
    elements = await resolver.resolve_collection(specification.container)
    identifiers = [await backend_id(element) for element in elements]
    assert_identity(await page_identity(await current_page(browser)), identity)
    return {'page': identity, 'root': root, 'ids': identifiers}, elements


def _assert_snapshot(expected, actual):
    assert_identity(actual['page'], expected['page'])
    if actual['root'] != expected['root']:
        # WHY：同 tab、同 URL 的 reload 仍是另一个文档，不能用相同样本值掩盖现场替换。
        raise NaturalReadFailure('read_sample_document_changed')
    if actual['ids'] != expected['ids']:
        raise NaturalReadFailure('natural_read_container_identity_changed')


def _validate_collection_budget(specification, total):
    if (specification.requireComplete or specification.includeOrdinal) and total > specification.maxItems:
        raise FieldReadError('read_collection_limit', field_name='container', match_count=total,
                             reason='complete_collection_required')


async def _sample_output(browser, specification, elements, sample_field, sample_limit):
    samples = ({sample_field: {'limit': min(sample_limit, specification.fields[sample_field].maxValues)}}
               if sample_field else None)
    count = min(len(elements), specification.maxItems)
    limit = min(sample_limit, count)
    indices = list(range(limit)) if count <= limit else [0, *range(count - limit + 1, count)]
    output = await project_field_records(browser, specification, [elements[index] for index in indices],
                                         field_samples=samples)
    if specification.includeOrdinal:
        # WHY：追加场景读取首项与末尾样本，必须保留完整 DOM 的序号，不能把样本下标当作点击身份。
        for record, index in zip(output, indices, strict=True):
            record['ordinal'] = index + 1
    schema = specification.outputSchema
    if schema.get('type') == 'object':
        if specification.maxItems != 1 or len(output) != 1:
            raise FieldReadError('read_single_object_required', field_name='container',
                                 match_count=len(output), reason='expected_exactly_one_record')
        total = samples[sample_field]['total'] if samples else 1
        if sample_field and total > specification.fields[sample_field].maxValues:
            raise FieldReadError('read_field_value_limit', field_name=sample_field,
                                 match_count=total, reason='exceeded_max_values')
        return _validate_sample_record(output[0], schema), total
    if schema.get('type') != 'array' or not isinstance(schema.get('items'), dict):
        raise NaturalReadFailure('read_sample_schema_unsupported')
    # WHY：样本只核验 item 的字段合同；集合 minItems 是正式执行约束，不强迫探索采满。
    return [_validate_sample_record(record, schema['items']) for record in output], len(output)


def _validate_sample_record(record, schema):
    try:
        Draft202012Validator(schema).validate(record)
    except JsonSchemaValidationError as error:
        raise FieldReadError('read_output_schema_mismatch', reason='projected_output_invalid') from error
    return record
