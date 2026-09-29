"""Compile requirement-owned pure selection programs over proven live collections."""
from copy import deepcopy

from .evidence import digest, gap
from .natural_reads import VerifiedNaturalRead, runtime_read_specification


def collection_read_action_ref(trace, action):
    pre = next((item for item in trace.observations if item.id == action.preObservationRef), None)
    structures = [fact.value for fact in pre.facts if fact.kind == 'dom_structure'
                  and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id] if pre else []
    return (structures[0].get('queryCandidate') or {}).get('readActionRef') if len(structures) == 1 else None


def selection_read(trace, action, target):
    if action.name == 'navigate':
        return navigation_selection_read(trace, action)
    if (action.name != 'click' or not isinstance(target, dict)
            or target.get('strategy') != 'structure'
            or target.get('container') != {'kind': 'css', 'value': 'html'}
            or target.get('withinItem') is not None):
        return None
    read_ref = collection_read_action_ref(trace, action)
    if read_ref is None:
        return None
    observations = {item.id: item for item in trace.observations}
    pre = observations.get(action.preObservationRef)
    previous = trace.actions[:next(index for index, item in enumerate(trace.actions) if item.id == action.id)]
    for read in reversed(previous):
        post = observations.get(read.postObservationRef)
        if read.id != read_ref or read.name != 'find_elements' or post is None:
            continue
        for fact in post.facts:
            if fact.kind != 'verified_natural_read':
                continue
            value = VerifiedNaturalRead.model_validate(fact.value)
            if (value.actionRef == read.id and value.stable and value.specification.includeOrdinal
                    and value.specification.container == target.get('items', {}).get('value')
                    and value.urlDigest == target.get('scope', {}).get('urlDigest')
                    and pre is not None and value.targetId == post.tabId == pre.tabId
                    and post.url == pre.url
                    and isinstance(value.output, list)
                    and any(row.get('ordinal') == target.get('ordinal') for row in value.output)):
                return fact, value
    return None


def navigation_selection_read(trace, action):
    """A navigation can select a value, not only a clicked element, from a live read."""
    before = next((item for item in trace.observations if item.id == action.preObservationRef), None)
    destination = action.args.get('url') if isinstance(action.args, dict) else None
    if before is None or not isinstance(destination, str):
        return None
    if any(f.kind == 'natural_binding' and f.value.get('actionRef') == action.id
           and f.value.get('argumentPath') == 'url' for f in before.facts if isinstance(f.value, dict)):
        return None  # 已由输入/常量/唯一读取绑定，不再问模型。
    previous = trace.actions[:trace.actions.index(action)]
    observations = {item.id: item for item in trace.observations}
    for candidate in reversed(previous):
        post = observations.get(candidate.postObservationRef)
        if post is None or candidate.name != 'find_elements' or candidate.status != 'succeeded':
            continue
        if post.url != before.url or post.tabId != before.tabId:
            break
        for fact in post.facts:
            if fact.kind != 'verified_natural_read':
                continue
            read = VerifiedNaturalRead.model_validate(fact.value)
            if (read.actionRef == candidate.id and read.stable and read.specification.includeOrdinal
                    and read.targetId == before.tabId and read.urlDigest == digest(before.url)
                    and isinstance(read.output, list)
                    and any(row.get('attribute_href') == destination for row in read.output)):
                # WHY：整个继续查询只有同一 href 时仍由原 repeat 绑定拥有，不提前增加模型调用。
                return (fact, read) if len({row.get('attribute_href') for row in read.output}) > 1 else None
    return None


def selection_value(action, target):
    return action.args['url'] if action.name == 'navigate' else target['ordinal']


def selection_schema(action, read):
    return {'type': 'string'} if action.name == 'navigate' else {
        'type': 'integer', 'minimum': 1, 'maximum': read.specification.maxItems}


def selection_navigation_binding(request, action, key, segments):
    if action.name != 'navigate' or key != 'url':
        return None
    functions, _, issues = bind_selection_function(request, action, segments, {'target': None})
    if issues or len(functions) != 1:
        return None
    function = functions[0]
    return {'id': f'b-{action.id}-url', 'actionRef': action.id, 'argumentPath': 'url',
        'kind': 'prior_output', 'sourceRef': function['id'], 'transform': None,
        'derivation': 'selection_function', 'proofRefs': function['proofRefs'],
        'binding': {'source': 'node', 'nodeId': function['id'], 'path': []}}


def bind_selection_function(request, action, segments, click_segment):
    if action.name not in ('click', 'navigate'):
        return [], click_segment, []
    target = click_segment.get('target')
    read_ref = collection_read_action_ref(request.trace, action)
    if read_ref is None and action.name == 'click':
        return [], click_segment, []
    match = selection_read(request.trace, action, target)
    if match is None and action.name == 'navigate':
        return [], click_segment, []
    if match is None:
        return [], None, [gap('missing_binding', [action.id],
                              'collection_selection_read_required', 'collect_evidence')]
    fact, read = match
    read_segments = [item for item in segments if item.get('operation', {}).get('name') == 'browser.read-fields'
                     and item['operation']['specification'] == runtime_read_specification(read.specification)
                     and any(output['sourceRef'] == fact.id for output in item.get('outputs', []))]
    proposals = [item for observation in request.trace.observations for item in observation.facts
                 if item.kind == 'selection_function' and item.value.get('actionRef') == action.id]
    if len(read_segments) != 1 or len(proposals) != 1:
        return [], None, [gap('missing_binding', [action.id],
                              'selection_function_evidence_required', 'collect_evidence')]
    proposal, value = proposals[0], proposals[0].value
    draft = value.get('draft', {})
    example = {'input': {'candidates': read.output}, 'output': selection_value(action, target)}
    if (value.get('readFactRef') != fact.id or value.get('requirementDigest') != request.requirement.sourceDigest
            or draft.get('inputs') != {'candidates': read.specification.outputSchema}
            or draft.get('outputSchema') != selection_schema(action, read)
            or not draft.get('examples') or draft['examples'][0] != example):
        return [], None, [gap('invalid_source', [action.id], 'selection_function_source_mismatch', 'reject_trace')]
    identity = 'selection-' + action.id
    function = {'id': identity, 'kind': 'function', 'label': '按任务规则选择当前候选', 'draft': draft,
                'inputBindings': {'candidates': {'source': 'node', 'nodeId': read_segments[0]['id'], 'path': []}},
                'proofRefs': [ref.model_dump(mode='json') for ref in proposal.sourceRefs]}
    selected = deepcopy(click_segment)
    if action.name == 'click':
        selected['target']['ordinalBinding'] = {'source': 'node', 'nodeId': identity, 'path': []}
    # WHY：从一次末项点击推导 count 是样本猜测。只有需求绑定的纯函数可拥有动态选择语义。
    return [function], selected, []
