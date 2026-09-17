"""Compile and classify the selector-only visible wait without expanding natural_compile."""
from .evidence import ActionCoverage, EvidenceRef, gap
from .postconditions import declared_checks
from .visible_wait import VerifiedVisibleWait, VisibleWaitParams


def failed_visible_wait_coverage(registry, action, post):
    if (action.name != 'bat_wait_for' or action.effect != 'read'
            or action.status != 'failed' or action.resultRef is None
            or _facts(post, 'verified_visible_wait', action.id)):
        return None
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule='failed_bat_wait_probe/v1', evidenceRefs=[action.resultRef])


def compile_visible_wait(action, pre, post, bindings, binding_issues):
    facts = _facts(post, 'verified_visible_wait', action.id)
    if len(facts) != 1:
        return None, None, [gap('missing_effect_proof', [action.id],
                                'verified_visible_wait_required', 'collect_evidence')]
    fact = facts[0]
    try:
        params = VisibleWaitParams.model_validate(action.args)
        verified = VerifiedVisibleWait.model_validate(fact.value)
    except Exception:
        return None, None, [gap('invalid_source', [action.id],
                                'verified_visible_wait_invalid', 'reject_trace')]
    before, after = _fact_value(pre, 'url_digest'), _fact_value(post, 'url_digest')
    identity_matches = (verified.selector == params.selector and verified.ready is True
                        and verified.targetId == pre.tabId == post.tabId
                        and verified.resultDigest == action.resultRef.digest
                        and before is not None and after is not None
                        and before.value == verified.urlDigest == after.value)
    if not identity_matches:
        return None, None, [gap('invalid_source', [action.id],
                                'verified_visible_wait_mismatch', 'reject_trace')]
    if binding_issues or len(bindings) != 1 or bindings[0]['argumentPath'] != 'selector':
        return None, None, binding_issues or [gap('missing_binding', [action.id],
            'visible_wait_selector_binding_required', 'collect_evidence')]
    target = {'strategy': 'css', 'value': params.selector,
              'scope': {'url': pre.url, 'urlDigest': verified.urlDigest}}
    postconditions = [{'kind': 'target_visible', 'equals': 'true', 'clauseRef': fact.id}]
    try:
        declared_checks(postconditions, action.args, target)
    except ValueError:
        return None, None, [gap('unsupported_capability', [action.id],
            'visible_wait_postcondition_not_admitted', 'add_capability')]
    refs = _unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs, *fact.sourceRefs,
                         *(ref for binding in bindings for ref in binding['proofRefs'])])
    segment = {'id': 's-' + action.id, 'kind': 'deterministic',
        'operation': {'name': 'browser.workflow-step', 'version': 2, 'actionName': action.name},
        'target': target, 'bindings': bindings,
        'preconditions': [{'kind': 'source_observation', 'evidenceRef': pre.id}],
        'expectedEffect': {'kind': 'read'}, 'postconditions': postconditions,
        'outputs': [], 'proofRefs': [ref.model_dump(mode='json') for ref in refs]}
    return segment, None, []


def _facts(observation, kind, action_ref):
    return [] if observation is None else [fact for fact in observation.facts
        if fact.kind == kind and isinstance(fact.value, dict) and fact.value.get('actionRef') == action_ref]


def _fact_value(observation, kind):
    values = [fact for fact in observation.facts if fact.kind == kind]
    return values[0] if len(values) == 1 else None


def _unique_refs(refs):
    found = {}
    for ref in refs:
        if ref is not None:
            if isinstance(ref, dict):
                ref = EvidenceRef.model_validate(ref)
            found[(ref.ref, ref.digest)] = ref
    return list(found.values())
