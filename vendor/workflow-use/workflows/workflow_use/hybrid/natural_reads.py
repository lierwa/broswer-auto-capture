"""Validated field-read evidence and model-free live DOM verification."""

from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue, model_validator

from .evidence import Contract, EvidenceRef, digest, gap
from .dom_evidence import DomQueryEvidence
from .read import ReadField, ReadSampleCoverage, ReadSpec, read_fields
from .targets import TargetResolver


class NaturalReadProposal(Contract):
    specification: ReadSpec
    outputPath: list[str | int]
    readPath: list[str | int]
    expected: JsonValue

    @model_validator(mode='after')
    def supported_read_path(self):
        if (len(self.readPath) > 40 or any(
                not ((isinstance(item, str) and item
                      and item not in ('__proto__', 'constructor', 'prototype'))
                     or (type(item) is int and item >= 0)) for item in self.readPath)):
            raise ValueError('natural_read_path_unsupported')
        return self


class VerifiedNaturalRead(Contract):
    actionRef: str
    specification: ReadSpec
    outputPath: list[str | int]
    readPath: list[str]
    output: JsonValue
    resultDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    urlDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    targetId: str = Field(min_length=1)
    containerIdsDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    stable: bool
    readRef: str | None = None
    coverage: ReadSampleCoverage | None = None
    documentRootId: int | None = None


class NaturalReadFailure(ValueError):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def validate_proposal(proposal, output_schema, proven_paths):
    try:
        Draft202012Validator.check_schema(output_schema)
        target = schema_at_path(output_schema, proposal.outputPath)
    except Exception as error:
        raise NaturalReadFailure('natural_read_output_path_invalid') from error
    if any(paths_conflict(proposal.outputPath, path) for path in proven_paths):
        raise NaturalReadFailure('natural_read_output_path_conflict')
    specification = proposal.specification
    if not deterministic_read_schema(specification.outputSchema):
        raise NaturalReadFailure('natural_read_schema_mismatch')
    try:
        source = schema_at_path(specification.outputSchema, proposal.readPath)
    except Exception as error:
        raise NaturalReadFailure('natural_read_path_unsupported') from error
    if source != target or (proposal.readPath and not deterministic_field_schema(target)):
        raise NaturalReadFailure('natural_read_schema_mismatch')
    validate_read_field_mapping(specification)
    return target


def schema_at_path(schema, path):
    current = schema
    for item in path:
        if current.get('type') == 'object' and isinstance(item, str):
            current = current.get('properties', {}).get(item)
        elif current.get('type') == 'array' and type(item) is int:
            maximum = current.get('maxItems')
            current = current.get('items') if type(maximum) is int and 0 <= item < maximum else None
        else:
            current = None
        if not isinstance(current, dict):
            raise ValueError('output_path_unreachable')
    return current


def deterministic_read_schema(schema):
    if not isinstance(schema, dict):
        return False
    if schema.get('type') == 'object':
        properties = schema.get('properties')
    elif schema.get('type') == 'array' and isinstance(schema.get('items'), dict):
        item = schema['items']
        if item.get('type') != 'object':
            return False
        properties = item.get('properties')
    else:
        return False
    return (isinstance(properties, dict) and 0 < len(properties) <= 100
            and all(deterministic_field_schema(value) for value in properties.values()))


def deterministic_field_schema(schema):
    if not isinstance(schema, dict):
        return False
    if schema.get('type') in ('string', 'number', 'integer', 'boolean'):
        return True
    return (schema.get('type') == 'array' and isinstance(schema.get('items'), dict)
            and schema['items'].get('type') in ('string', 'number', 'integer', 'boolean'))


def validate_read_field_mapping(specification):
    schema = specification.outputSchema
    properties = schema['properties'] if schema.get('type') == 'object' else schema['items']['properties']
    if schema.get('type') == 'object' and specification.maxItems != 1:
        raise NaturalReadFailure('natural_read_schema_mismatch')
    for name, field in specification.fields.items():
        target = properties.get(name)
        if not deterministic_field_schema(target):
            raise NaturalReadFailure('natural_read_schema_mismatch')
        multiple = target.get('type') == 'array'
        scalar = target['items'] if multiple else target
        if field.multiple != multiple or field.valueType != scalar.get('type'):
            raise NaturalReadFailure('natural_read_schema_mismatch')


def paths_conflict(left, right):
    return left[:len(right)] == right or right[:len(left)] == left


def value_at_path(value, path):
    for item in path:
        if isinstance(value, dict) and isinstance(item, str) and item in value:
            value = value[item]
        elif isinstance(value, list) and type(item) is int and 0 <= item < len(value):
            value = value[item]
        else:
            raise NaturalReadFailure('natural_read_value_path_missing')
    return value


async def read_fields_with_proof(browser, specification, expected_identity):
    before = await collection_identity(browser, specification.container, specification.maxItems)
    assert_identity(before['page'], expected_identity)
    first = await read_fields(browser, specification)
    middle = await collection_identity(browser, specification.container, specification.maxItems)
    assert_identity(middle['page'], expected_identity)
    second = await read_fields(browser, specification)
    after = await collection_identity(browser, specification.container, specification.maxItems)
    assert_identity(after['page'], expected_identity)
    if before['ids'] != middle['ids'] or before['ids'] != after['ids']:
        raise NaturalReadFailure('natural_read_container_identity_changed')
    if digest(first) != digest(second):
        raise NaturalReadFailure('natural_read_output_changed')
    return first, digest(before['ids'])


def find_elements_read_spec(query):
    """Project one complete native DOM query into the existing deterministic read capability."""
    value = query if isinstance(query, DomQueryEvidence) else DomQueryEvidence.model_validate(query)
    if (value.complete is not True or value.query.kind != 'css' or not value.includeText
            or value.truncated is not False or value.total is None
            or value.showing != value.total or value.total > value.maxResults
            or 'query_selector_redacted' in value.limitations):
        raise NaturalReadFailure('find_elements_read_query_incomplete')
    # WHY：原生 find_elements 查询全部匹配元素并读取 textContent，包括隐藏控件；
    # 不得用可见 innerText 重读同一查询，否则有效候选会变成缺值。业务字段仍默认 rendered。
    fields = {'text': ReadField(selector=':scope', textSource='textContent', normalizeWhitespace=True)}
    properties = {'text': {'type': 'string'},
                  'ordinal': {'type': 'integer', 'minimum': 1, 'maximum': value.maxResults}}
    for attribute in value.requestedAttributes:
        name = 'attribute_' + attribute
        fields[name] = ReadField(selector=':scope', attribute=attribute, optionalAttribute=True,
                                 resolveUrl=attribute in ('href', 'src'))
        properties[name] = {'type': 'string'}
    item_schema = {'type': 'object', 'properties': properties,
                   'required': ['text', 'ordinal'], 'additionalProperties': False}
    return ReadSpec(container=value.query.value,
        fields=fields, maxItems=value.maxResults, includeOrdinal=True,
        outputSchema={'type': 'array', 'items': item_schema,
                      'minItems': 0, 'maxItems': value.maxResults})


def runtime_read_specification(specification):
    """Apply the host byte budget without rewriting the captured source fact."""
    value = specification if isinstance(specification, ReadSpec) else ReadSpec.model_validate(specification)
    if value.maxInputBytes is None:
        value = value.model_copy(update={'maxInputBytes': 128000})
    return value.model_dump(mode='json')


async def capture_find_elements_read(browser, query, expected_identity, result_digest, action_ref):
    specification = find_elements_read_spec(query)
    output, identities_digest = await read_fields_with_proof(browser, specification, expected_identity)
    if not isinstance(output, list) or len(output) != query.total:
        raise NaturalReadFailure('find_elements_read_cardinality_changed')
    return VerifiedNaturalRead(actionRef=action_ref, specification=specification,
        outputPath=[], readPath=[], output=output, resultDigest=result_digest,
        urlDigest=digest(expected_identity['url']), targetId=expected_identity['targetId'],
        containerIdsDigest=identities_digest, stable=True)


async def collection_identity(browser, selector, max_items=None):
    page = await current_page(browser)
    identity = await page_identity(page)
    elements = await TargetResolver(browser).resolve_collection(selector)
    if type(max_items) is int and max_items > 0:
        elements = elements[:max_items]
    identifiers = [await backend_id(element) for element in elements]
    return {'page': identity, 'ids': identifiers}


async def current_page(browser):
    page = await browser.get_current_page()
    if page is None:
        raise NaturalReadFailure('natural_read_page_unavailable')
    return page


async def page_identity(page):
    if not hasattr(page, 'get_target_info'):
        raise NaturalReadFailure('natural_read_page_identity_unavailable')
    info = await page.get_target_info()
    target_id = info.get('targetId') if isinstance(info, dict) else None
    url = await page.get_url()
    if not isinstance(target_id, str) or not target_id or not isinstance(url, str) or not url:
        raise NaturalReadFailure('natural_read_page_identity_unavailable')
    return {'targetId': target_id, 'url': url}


def assert_identity(actual, expected):
    if actual != expected:
        raise NaturalReadFailure('natural_read_page_identity_changed')


async def backend_id(element):
    info = await element.get_basic_info()
    value = info.get('backendNodeId') if isinstance(info, dict) else getattr(info, 'backendNodeId', None)
    if type(value) is not int:
        raise NaturalReadFailure('natural_read_element_identity_unavailable')
    return value


def compile_verified_read(request, action, pre, post, output_schema, prior_paths):
    facts = [fact for fact in post.facts if fact.kind == 'verified_natural_read'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if not facts:
        return None, None, [gap('missing_effect_proof', [action.id],
                              'natural_field_read_evidence_missing', 'collect_evidence')]
    internal_query = action.name == 'find_elements'
    if not internal_query and (not isinstance(output_schema, dict)
                               or digest(output_schema) != request.plan.outputSchemaDigest):
        return None, None, [gap('missing_effect_proof', [action.id],
                              'natural_output_schema_required', 'collect_evidence')]
    try:
        values = [VerifiedNaturalRead.model_validate(fact.value) for fact in facts]
        shared = {(digest(value.specification), digest(value.output), value.resultDigest,
                   value.urlDigest, value.targetId, value.containerIdsDigest, value.stable)
                  for value in values}
        if len(shared) != 1:
            raise ValueError('multiple_verified_natural_reads_disagree')
        paths = []
        for value in values:
            if internal_query:
                validate_compiled_query_read(value, action, pre, post)
            else:
                validate_compiled_read(value, output_schema, action, pre, post, [*prior_paths, *paths],
                                       trace=request.trace)
            paths.append(value.outputPath)
    except Exception:
        return None, None, [gap('invalid_source', [action.id],
                              'verified_natural_read_invalid', 'reject_trace')]
    refs = unique_evidence([action.resultRef, *pre.sourceRefs, *post.sourceRefs,
                            *(reference for fact in facts for reference in fact.sourceRefs)])
    specification = runtime_read_specification(values[0].specification)
    segment = {'id': 's-' + action.id, 'kind': 'deterministic',
        'operation': {'name': 'browser.read-fields', 'version': 2, 'specification': specification},
        'target': {'strategy': 'css', 'value': value.specification.container,
                   'scope': {'url': pre.url, 'urlDigest': value.urlDigest}},
        'bindings': [], 'preconditions': [{'kind': 'source_observation', 'evidenceRef': pre.id}],
        'expectedEffect': {'kind': 'read'},
        'postconditions': [{'kind': 'output_schema',
                            'schemaDigest': digest(value.specification.outputSchema)}],
        'outputs': [{'schema': values[0].specification.outputSchema, 'sourceRef': fact.id} for fact in facts],
        'proofRefs': [ref.model_dump(mode='json') for ref in refs]}
    return segment, None if internal_query else paths, []


def validate_compiled_query_read(value, action, pre, post):
    validate_compiled_read_identity(value, action, pre, post)
    queries = [fact for fact in post.facts if fact.kind == 'dom_query'
               and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if len(queries) != 1:
        raise ValueError('verified_query_read_query_missing')
    query = DomQueryEvidence.model_validate(queries[0].value)
    expected = find_elements_read_spec(query)
    if (value.outputPath or value.readPath or value.specification.model_dump(mode='json')
            != expected.model_dump(mode='json')):
        raise ValueError('verified_query_read_specification_mismatch')
    Draft202012Validator(value.specification.outputSchema).validate(value.output)
    if not isinstance(value.output, list) or len(value.output) != query.total:
        raise ValueError('verified_query_read_cardinality_mismatch')


def validate_compiled_read(value, output_schema, action, pre, post, prior_paths, trace=None):
    validate_compiled_read_identity(value, action, pre, post)
    if action.name == 'bat_read_fields':
        from .method_read_evidence import validate_method_read_mapping
        validate_method_read_mapping(value, output_schema, action, trace)
        return
    proposal = NaturalReadProposal(specification=value.specification, outputPath=value.outputPath,
                                   readPath=value.readPath, expected=value_at_path(value.output, value.readPath))
    target = validate_proposal(proposal, output_schema, prior_paths)
    Draft202012Validator(value.specification.outputSchema).validate(value.output)
    Draft202012Validator(target).validate(value_at_path(value.output, value.readPath))


def validate_compiled_read_identity(value, action, pre, post):
    if (value.actionRef != action.id or action.resultRef is None
            or value.resultDigest != action.resultRef.digest or value.stable is not True):
        raise ValueError('verified_read_action_mismatch')
    if value.targetId != pre.tabId or value.targetId != post.tabId:
        raise ValueError('verified_read_target_mismatch')
    before = observation_fact(pre, 'url_digest')
    after = observation_fact(post, 'url_digest')
    if before != value.urlDigest or after != value.urlDigest:
        raise ValueError('verified_read_url_mismatch')


def observation_fact(observation, kind):
    values = [fact.value for fact in observation.facts if fact.kind == kind]
    if len(values) != 1 or not isinstance(values[0], str):
        raise ValueError('verified_read_observation_missing')
    return values[0]


def unique_evidence(refs):
    found = {}
    for reference in refs:
        if reference is None:
            continue
        if isinstance(reference, dict):
            reference = EvidenceRef.model_validate(reference)
        found[(reference.ref, reference.digest)] = reference
    return list(found.values())
