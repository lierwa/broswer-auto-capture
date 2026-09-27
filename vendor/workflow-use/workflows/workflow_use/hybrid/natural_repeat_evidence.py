"""Validate observed repeat methods; annotations never supply executable graphs."""
from pydantic import Field

from .evidence import Contract, digest
from .natural_reads import (VerifiedNaturalRead, schema_at_path, value_at_path,
                            validate_compiled_query_read, validate_compiled_read_identity)
from .natural_repeat_actions import repeat_mode, validate_same_page_advance, validate_selection_sample, validate_passive_wait


class RepeatIteration(Contract):
    readActionRef: str = Field(min_length=1, max_length=160)
    continuationActionRef: str = Field(min_length=1, max_length=160)
    advanceActionRef: str | None = Field(default=None, max_length=160)


class RepeatMethod(Contract):
    requirementDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    outputPath: list[str | int] = Field(max_length=40)
    stableKeyPath: list[str | int] = Field(max_length=40)
    iterations: list[RepeatIteration] = Field(min_length=2, max_length=8)


def validate_repeat_method(trace, value, requirement_digest):
    try:
        method = RepeatMethod.model_validate(value)
        _validate_method(trace, method, requirement_digest)
        return method.model_dump(mode='json')
    except Exception as error:
        raise ValueError('repeat_method_evidence_invalid') from error


def _validate_method(trace, method, requirement_digest):
    if method.requirementDigest != requirement_digest:
        raise ValueError('repeat_method_requirement_mismatch')
    for path in (method.outputPath, method.stableKeyPath):
        if any(type(part) not in (str, int) or type(part) is int and part < 0
               or part in ('__proto__', 'constructor', 'prototype') for part in path):
            raise ValueError('repeat_method_path_invalid')
    observed, first_read, first_query, advance_method = [], None, None, None
    mode = repeat_mode(trace, method.model_dump(mode='json'))
    for index, iteration in enumerate(method.iterations):
        read_action, read, read_pre, _ = verified_read(trace, iteration.readActionRef)
        query_action, query, query_pre, query_post = verified_read(trace, iteration.continuationActionRef)
        if read_action.name != 'bat_read_fields' or query_action.name != 'find_elements':
            raise ValueError('repeat_method_read_kind_invalid')
        validate_compiled_query_read(query, query_action, query_pre, query_post)
        _query_scope(query_action, query, query_pre, query_post, require_href=mode == 'href')
        if read.outputPath != method.outputPath or read_pre.url != query_pre.url or read.targetId != query.targetId:
            raise ValueError('repeat_method_scope_mismatch')
        if mode != 'href':
            _assert_same_document(read_pre, query_pre)
            _assert_same_document(query_pre, query_post)
        if first_read is None:
            first_read, first_query = read, query
        if (digest(read.specification) != digest(first_read.specification)
                or read.readPath != first_read.readPath
                or _query_method_digest(query.specification) != _query_method_digest(first_query.specification)):
            raise ValueError('repeat_method_specification_mismatch')
        _stable_keys(read, method.stableKeyPath)
        last_sample = index == len(method.iterations) - 1
        if not isinstance(query.output, list) or not last_sample and not query.output:
            raise ValueError('repeat_method_continuation_ambiguous')
        if len(query.output) > first_query.specification.maxItems:
            raise ValueError('repeat_method_first_query_budget_insufficient')
        _continuation(query, mode)
        observed.extend([read_action.id, query_action.id])
        # WHY：代表方法无需预抓终页；最后 null 只结束采样，运行仍以完整查询为空才能结束。
        if last_sample:
            if iteration.advanceActionRef is not None:
                raise ValueError('repeat_method_terminal_advance')
            continue
        if mode == 'href':
            advance = _advance(trace, iteration.advanceActionRef, query, query_post)
        else:
            advance = next(item for item in trace.actions if item.id == iteration.advanceActionRef)
            _, next_read, next_pre, next_post = verified_read(trace, method.iterations[index + 1].readActionRef)
            signature = validate_same_page_advance(trace, advance, mode, query_action, query, query_pre,
                query_post, read, next_read, next_pre, next_post, method.stableKeyPath)
            if advance_method is not None and signature != advance_method:
                raise ValueError('repeat_method_advance_method_changed')
            advance_method = signature
        observed.append(advance.id)
    positions = {item.id: index for index, item in enumerate(trace.actions)}
    if len(set(observed)) != len(observed) or [positions[ref] for ref in observed] != sorted(positions[ref] for ref in observed):
        raise ValueError('repeat_method_order_invalid')
    sample_action_refs(trace, method.model_dump(mode='json'))


def _continuation(query, mode):
    if mode != 'href':
        if len(query.output) > 1 or query.output and query.output[0].get('ordinal') != 1:
            raise ValueError('repeat_method_continuation_ambiguous')
        return
    destinations = [item.get('attribute_href') for item in query.output]
    if destinations and (any(not isinstance(item, str) or not item.startswith(('https://', 'http://'))
                             for item in destinations) or len(set(destinations)) != 1):
        raise ValueError('repeat_method_continuation_ambiguous')


def _query_method_digest(specification):
    # WHY：每份查询已独立按自己的参数验正；这里只忽略预算及其派生上限，执行仍使用首份规格。
    value = specification.model_dump(mode='json')
    value['maxItems'] = 1
    value['outputSchema']['maxItems'] = 1
    value['outputSchema']['items']['properties']['ordinal']['maximum'] = 1
    return digest(value)


def verified_read(trace, action_ref):
    action = next(item for item in trace.actions if item.id == action_ref)
    pre = next(item for item in trace.observations if item.id == action.preObservationRef)
    post = next(item for item in trace.observations if item.id == action.postObservationRef)
    facts = [fact for fact in post.facts if fact.kind == 'verified_natural_read'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action_ref]
    if len(facts) != 1 or action.status != 'succeeded' or action.resultRef is None:
        raise ValueError('repeat_method_read_missing')
    read = VerifiedNaturalRead.model_validate(facts[0].value)
    validate_compiled_read_identity(read, action, pre, post)
    if pre.url != post.url or pre.tabId != post.tabId:
        raise ValueError('repeat_method_read_scope_changed')
    return action, read, pre, post


def _stable_keys(read, path):
    schema = schema_at_path(read.specification.outputSchema, read.readPath)
    if schema.get('type') != 'array':
        raise ValueError('repeat_method_array_required')
    key_schema = schema_at_path(schema['items'], path)
    if key_schema.get('type') not in ('string', 'integer', 'number', 'boolean'):
        raise ValueError('repeat_method_stable_key_required')
    items = value_at_path(read.output, read.readPath)
    if not isinstance(items, list) or not items:
        raise ValueError('repeat_method_representative_missing')
    keys = [value_at_path(item, path) for item in items]
    if any(type(key) not in (str, int, float, bool) or key == '' for key in keys):
        raise ValueError('repeat_method_stable_key_invalid')
    if len({digest(key) for key in keys}) != len(keys):
        raise ValueError('repeat_method_sample_key_collision')
    return {digest(key) for key in keys}


def _query_scope(action, read, pre, post, *, require_href=True):
    facts = [fact.value for fact in post.facts if fact.kind == 'dom_query'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if len(facts) != 1:
        raise ValueError('repeat_method_query_missing')
    query = facts[0]
    scope = query['scope']
    if (scope.get('url') != pre.url or scope.get('urlDigest') != read.urlDigest
            or scope.get('tabId') != pre.tabId or scope.get('frameId') is not None
            or query['query'] != {'kind': 'css', 'value': action.args.get('selector')}
            or query['requestedAttributes'] != sorted(set(action.args.get('attributes') or []))
            or query['includeText'] != action.args.get('include_text', True)
            or require_href and 'href' not in query['requestedAttributes']
            or not 1 <= query['maxResults'] <= 300
            or action.args.get('max_results', 50) != query['maxResults']
            or read.specification.maxItems != query['maxResults']):
        raise ValueError('repeat_method_query_scope_invalid')


def _advance(trace, action_ref, query, query_post):
    action = next(item for item in trace.actions if item.id == action_ref)
    pre = next(item for item in trace.observations if item.id == action.preObservationRef)
    post = next(item for item in trace.observations if item.id == action.postObservationRef)
    target = query.output[0].get('attribute_href')
    if (action.name not in ('navigate', 'click') or action.status != 'succeeded' or action.resultRef is None
            or not isinstance(target, str) or not target.startswith(('https://', 'http://'))
            or pre.tabId != query.targetId or post.tabId != query.targetId
            or pre.url != query_post.url or post.url != target or post.url == pre.url):
        raise ValueError('repeat_method_advance_unproven')
    if action.name == 'navigate' and action.args.get('url') != target:
        raise ValueError('repeat_method_advance_binding_unproven')
    return action


def sample_action_refs(trace, value):
    """Retain proven lookup samples and at most one terminal-page navigation probe."""
    iterations = value['iterations']
    declared = [ref for row in iterations for ref in
                (row['readActionRef'], row['continuationActionRef'], row['advanceActionRef']) if ref]
    positions = {item.id: index for index, item in enumerate(trace.actions)}
    first, last = positions[declared[0]], positions[declared[-1]]
    # WHY：准备中的纯等待仅保留审计；正式循环继续复用消费者 readiness，不固化秒数。
    while last + 1 < len(trace.actions) and trace.actions[last + 1].name == 'wait':
        last += 1
    extra = [item for item in trace.actions[first:last + 1] if item.id not in declared]
    lookups, validations, waits = set(), set(), set()
    for action in extra:
        if action.name == 'wait':
            validate_passive_wait(trace, action)
            waits.add(action.id)
            continue
        if action.name == 'bat_validate_selection':
            validate_selection_sample(trace, action)
            validations.add(action.id)
            continue
        if action.name != 'find_elements':
            continue
        action, read, pre, post = verified_read(trace, action.id)
        if action.effect != 'read':
            raise ValueError('repeat_method_lookup_effect_invalid')
        validate_compiled_query_read(read, action, pre, post)
        _query_scope(action, read, pre, post, require_href=False)
        _assert_same_document(pre, post)
        lookups.add(action.id)
    extra = [item for item in extra if item.id not in lookups | validations | waits]
    # WHY：准备可单独验证终页，不必为证明停止而先抓取全部页面。
    if extra:
        if len(extra) != 1 or repeat_mode(trace, value) != 'href':
            raise ValueError('repeat_method_unowned_action')
        probe = extra[0]
        terminal = next(item for item in trace.actions if item.id == iterations[-1]['readActionRef'])
        before = next(item for item in trace.observations if item.id == terminal.preObservationRef)
        post = next(item for item in trace.observations if item.id == probe.postObservationRef)
        pre = next(item for item in trace.observations if item.id == probe.preObservationRef)
        previous = iterations[-2]['advanceActionRef']
        if (probe.name != 'navigate' or probe.effect != 'navigation' or probe.status != 'succeeded' or probe.resultRef is None
                or not positions[previous] < positions[probe.id] < positions[terminal.id]
                or probe.args.get('url') != before.url or post.url != before.url
                or pre.tabId != before.tabId or post.tabId != before.tabId):
            raise ValueError('repeat_method_terminal_probe_unproven')
    if any(item.name != 'done' for item in trace.actions[last + 1:]):
        raise ValueError('repeat_method_tail_required')
    observations = {item.id: item for item in trace.observations}
    for before, after in zip(trace.actions[first:last], trace.actions[first + 1:last + 1]):
        left, right = observations[before.postObservationRef], observations[after.preObservationRef]
        if left.url != right.url or left.tabId != right.tabId:
            raise ValueError('repeat_method_observation_discontinuous')
        if before.id in lookups | validations | waits or after.id in lookups | validations | waits:
            _assert_same_document(left, right)
    return [item.id for item in trace.actions[first:last + 1]]


def _assert_same_document(left, right):
    identities = [[fact.value for fact in observation.facts if fact.kind == 'document_identity']
                  for observation in (left, right)]
    if any(len(values) != 1 or not isinstance(values[0], dict) for values in identities):
        raise ValueError('repeat_method_lookup_document_unproven')
    value = identities[0][0]
    document = value.get('documentDigest')
    if (value != identities[1][0] or set(value) != {'targetId', 'documentDigest'}
            or value['targetId'] != left.tabId or left.tabId != right.tabId
            or not isinstance(document, str) or len(document) != 64
            or any(character not in '0123456789abcdef' for character in document)):
        raise ValueError('repeat_method_lookup_document_changed')
