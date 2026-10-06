"""Project native observation context into ordinary, per-run node values."""
from .evidence import digest
from .fixed_control_dispatch import observed_fact

CONTEXT_SCHEMA = {'type': 'object', 'properties': {
    'url': {'type': 'string'}, 'tabId': {'type': 'string'}},
    'required': ['url', 'tabId'], 'additionalProperties': False}


def context_facts(observation):
    context = observed_fact(observation, 'browser_context')
    url = observed_fact(observation, 'url_digest')
    if context is None or url is None or url.value != digest(observation.url):
        return None
    value = context.value
    if (not isinstance(value, dict) or value.get('schemaVersion') != 'bat.browser-context/v1'
            or value.get('focusTargetId') != observation.tabId):
        return None
    tabs = [tab for tab in value.get('tabs', []) if isinstance(tab, dict)
            and tab.get('targetId') == observation.tabId]
    if len(tabs) != 1 or tabs[0].get('urlDigest') != url.value:
        return None
    return context, url


def context_outputs(post):
    return [{'schema': CONTEXT_SCHEMA, 'sourceRef': post.id}] if context_facts(post) is not None else []


def immediate_context_completion(segment, post, pre=None, action=None):
    # WHY：普通节点输出取完成后的现场；等待前的 URL 不能绑定成等待后的输出。
    conditions = segment.get('postconditions', [])
    return bool(conditions) and all(context_condition_holds(condition, pre, post, action) for condition in conditions)


def context_condition_holds(condition, pre, post, action):
    facts = context_facts(post)
    kind = condition.get('kind')
    if facts is None or kind not in ('url', 'url_digest', 'active_tab'):
        return False
    context, url = facts
    source = context if kind == 'active_tab' else url
    if condition.get('clauseRef') != source.id:
        return False
    current = {'url': post.url, 'url_digest': url.value, 'active_tab': post.tabId}[kind]
    if condition.get('changed') is True or condition.get('unchanged') is True:
        before = context_facts(pre) if pre is not None else None
        if before is None:
            return False
        previous = {'url': pre.url, 'url_digest': before[1].value, 'active_tab': pre.tabId}[kind]
        return (current != previous) == (condition.get('changed') is True)
    if 'equals' in condition:
        return condition['equals'] == current
    key = condition.get('bindingArgument')
    arguments = action.args if action is not None and isinstance(action.args, dict) else {}
    expected = arguments.get(key)
    if not isinstance(expected, str):
        return False
    if kind == 'active_tab':
        return action.name == 'switch' and key == 'tab_id' and expected == post.tabId[-4:]
    return key == 'url' and current == (digest(expected) if kind == 'url_digest' else expected)


def prior_context_binding(request, action, key, expected, prior_segments):
    field = 'url' if action.name == 'navigate' and key == 'url' else (
        'tabId' if action.name == 'switch' and key == 'tab_id' else None)
    if field is None or not isinstance(expected, str):
        return None
    segments = {item['id']: item for item in prior_segments
                if item.get('operation', {}).get('name') == 'browser.workflow-step'}
    observations = {item.id: item for item in request.trace.observations}
    for previous in reversed(request.trace.actions[:request.trace.actions.index(action)]):
        segment, post = segments.get('s-' + previous.id), observations.get(previous.postObservationRef)
        if segment is None or post is None or segment.get('outputs') not in ([], context_outputs(post)):
            continue
        if not immediate_context_completion(segment, post, observations.get(previous.preObservationRef), previous):
            continue
        matched = post.url == expected if field == 'url' else post.tabId[-4:] == expected
        if not matched:
            continue
        facts = context_facts(post)
        if facts is None:
            continue
        segment['outputs'] = context_outputs(post)
        # WHY：样本地址/四位 tab 只证明来源；复跑绑定完整的本次节点输出，不冻结样本编号。
        refs = [ref.model_dump(mode='json') for fact in facts for ref in fact.sourceRefs]
        return {'id': f'b-{action.id}-{key}', 'actionRef': action.id, 'argumentPath': key,
                'kind': 'prior_output', 'sourceRef': post.id, 'transform': None,
                'derivation': 'prior_browser_context', 'proofRefs': refs,
                'binding': {'source': 'node', 'nodeId': previous.id, 'path': [field]}}
    return None


async def native_switch_parameters(browser, parameters):
    target_id = parameters.get('tab_id')
    if set(parameters) != {'tab_id'} or not isinstance(target_id, str) or len(target_id) < 4:
        raise ValueError('switch_runtime_target_required')
    tabs = await browser.get_tabs()
    candidates = [str(tab.target_id) for tab in tabs if str(tab.target_id)[-4:] == target_id[-4:]]
    if len(candidates) != 1 or (len(target_id) > 4 and candidates != [target_id]) \
            or str(await browser.get_target_id_from_tab_id(target_id[-4:])) != candidates[0]:
        raise ValueError('switch_runtime_target_missing_or_ambiguous')
    return {'tab_id': target_id[-4:]}
