"""Capture a changing collection before the existing native click; never dispatch it."""
from jsonschema import Draft202012Validator

from .collection_structure import same_shape
from .dom_evidence import node_value, node_tag
from .evidence import digest
from .natural_reads import VerifiedNaturalRead, backend_id, read_fields_with_proof, runtime_read_specification
from .read import ReadField, ReadSpec
from .record_projection_dom import _ancestors, _ancestors_to_root, _element_children, _identity, _relative_selector


def collection_plan(summary, selector_index):
    node = summary.dom_state.selector_map.get(selector_index)
    roots = _ancestors_to_root(node) if node is not None else []
    body = next((value for value in roots if node_tag(value) == 'body'), None)
    if body is None:
        return None
    for item in _ancestors(node):
        parent = node_value(item, 'parent_node')
        peers = [value for value in _element_children(parent) if same_shape(item, value)] if parent else []
        if not 1 < len(peers) <= 300:
            continue
        items = _relative_selector([body], [peers])
        within = _relative_selector([item], [[node]])
        if items is None or within is None:
            return None
        selector = 'body' + items.removeprefix(':scope')
        target = {'strategy': 'structure', 'container': {'kind': 'css', 'value': 'html'},
                  'items': {'kind': 'css', 'value': selector},
                  'ordinal': next(index for index, peer in enumerate(peers, 1) if peer is item),
                  'withinItem': None if within == ':scope' else {'kind': 'css', 'value': within}}
        return target, [_identity(peer)[1] for peer in peers]
    return None


def collection_spec(selector):
    # WHY：复用原DOM读取/128KB预算；整行可见文字提供选择依据，不采表单value或敏感属性。
    return ReadSpec(container=selector, fields={'text': ReadField(selector=':scope', normalizeWhitespace=True)},
        maxItems=300, maxInputBytes=128000, includeOrdinal=True,
        outputSchema={'type': 'array', 'minItems': 0, 'maxItems': 300, 'items': {
            'type': 'object', 'properties': {'text': {'type': 'string'}, 'ordinal': {
                'type': 'integer', 'minimum': 1, 'maximum': 300}},
            'required': ['text', 'ordinal'], 'additionalProperties': False}})


async def capture_collection(browser, summary, selector_index, identity, action_ref):
    plan = collection_plan(summary, selector_index)
    if plan is None:
        return None
    target, expected = plan
    page = await browser.get_current_page()
    elements = await page.get_elements_by_css_selector(target['items']['value'])
    actual = [await backend_id(element) for element in elements]
    if actual != expected:
        raise ValueError('host_collection_snapshot_incomplete')
    specification = collection_spec(target['items']['value'])
    output, proof = await read_fields_with_proof(browser, specification,
        {'targetId': identity.target_id, 'url': identity.url})
    if proof != digest(expected) or len(output) != len(expected):
        raise ValueError('host_collection_changed')
    read = VerifiedNaturalRead(actionRef=action_ref, specification=specification,
        outputPath=[], readPath=[], output=output, resultDigest=digest(output),
        urlDigest=digest(identity.url), targetId=identity.target_id, containerIdsDigest=proof, stable=True)
    target['readActionRef'] = action_ref
    return {**target, 'hostRead': {'actionRef': action_ref, 'read': read.model_dump(mode='json'), 'target': target}}


def host_read_facts(collector, target, structure):
    value = target.get('hostRead')
    return [collector.value_fact('host_collection_read', {**value, 'targetRef': structure.targetRef})] if value else []


def host_read_for_target(pre, target, action_ref):
    if not isinstance(target, dict):
        return None
    facts = [fact for fact in pre.facts if fact.kind == 'host_collection_read'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action_ref]
    if len(facts) != 1:
        return None
    fact, value = facts[0], facts[0].value
    read = VerifiedNaturalRead.model_validate(value['read'])
    expected = collection_spec(target['items']['value'])
    structures = [f.value for f in pre.facts if f.kind == 'dom_structure'
                  and isinstance(f.value, dict) and f.value.get('actionRef') == action_ref]
    if (read.actionRef != action_ref or not read.stable or read.targetId != pre.tabId
            or read.urlDigest != digest(pre.url) or read.resultDigest != digest(read.output)
            or read.specification != expected or read.outputPath or read.readPath
            or len(structures) != 1 or structures[0]['targetRef'] != value.get('targetRef')
            or any(value['target'].get(key) != target.get(key)
                   for key in ('strategy', 'container', 'items', 'withinItem', 'ordinal'))):
        raise ValueError('host_collection_source_mismatch')
    Draft202012Validator(expected.outputSchema).validate(read.output)
    if (not 1 < len(read.output) <= 300 or [row['ordinal'] for row in read.output] != list(range(1, len(read.output) + 1))
            or not 1 <= target['ordinal'] <= len(read.output)):
        raise ValueError('host_collection_cardinality_mismatch')
    return fact, read


def host_read_segment(pre, fact, read):
    specification = runtime_read_specification(read.specification)
    return {'id': 'collection-' + read.actionRef, 'kind': 'deterministic',
        'operation': {'name': 'browser.read-fields', 'version': 2, 'specification': specification},
        'target': {'strategy': 'css', 'value': specification['container'],
                   'scope': {'url': pre.url, 'urlDigest': read.urlDigest}},
        'bindings': [], 'preconditions': [{'kind': 'source_observation', 'evidenceRef': pre.id}],
        'expectedEffect': {'kind': 'read'},
        'postconditions': [{'kind': 'output_schema', 'schemaDigest': digest(specification['outputSchema'])}],
        'outputs': [{'schema': specification['outputSchema'], 'sourceRef': fact.id}],
        'proofRefs': [ref.model_dump(mode='json') for ref in fact.sourceRefs]}
