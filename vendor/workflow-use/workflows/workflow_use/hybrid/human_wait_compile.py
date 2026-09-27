"""Compile only host-confirmed human continuation, never a model's login claim."""
from .evidence import digest, gap
from .human_wait import HumanWaitParams


def compile_human_wait(action, pre, post):
    facts = [fact for fact in post.facts if fact.kind == 'verified_human_resume'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if len(facts) != 1:
        return None, None, [gap('missing_effect_proof', [action.id],
            'verified_human_resume_required', 'collect_evidence')]
    fact, value = facts[0], facts[0].value
    try:
        params = HumanWaitParams.model_validate(action.args)
        before, after = value['before'], value['after']
        valid = (value['schemaVersion'] == 'bat.human-resume/v1' and value['resumed'] is True
            and value['params'] == action.args and value['argsDigest'] == digest(action.args)
            and value['resultDigest'] == action.resultRef.digest and bool(value['waitpointId'])
            and bool(before['sessionId']) and before['sessionId'] == after['sessionId']
            and before['tabId'] == after['tabId'] == pre.tabId == post.tabId
            and before['url'] == pre.url and after['url'] == post.url == params.resumeUrl
            and all(ref.digest == digest(value) for ref in fact.sourceRefs))
    except (KeyError, TypeError, ValueError):
        valid = False
    if not valid:
        return None, None, [gap('invalid_source', [action.id],
            'verified_human_resume_mismatch', 'reject_trace')]
    human = {'reason': 'access_restriction' if params.reason == 'access' else params.reason, 'prompt': params.prompt,
             'resumeWhen': {'operator': 'equals', 'path': ['url'],
                            'expected': {'source': 'constant', 'value': params.resumeUrl}}}
    refs = [action.resultRef, *pre.sourceRefs, *post.sourceRefs, *fact.sourceRefs]
    return {'id': 's-' + action.id, 'kind': 'deterministic',
        'operation': {'name': 'browser.wait-for-human', 'version': 1, 'human': human},
        'target': None, 'bindings': [], 'outputs': [],
        'preconditions': [{'kind': 'source_observation', 'evidenceRef': pre.id}],
        'expectedEffect': {'kind': 'read'},
        'postconditions': [{'kind': 'url', 'equals': params.resumeUrl, 'clauseRef': fact.id}],
        'proofRefs': [ref.model_dump(mode='json') for ref in refs]}, None, []
