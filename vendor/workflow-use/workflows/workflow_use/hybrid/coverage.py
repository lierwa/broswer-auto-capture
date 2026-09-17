"""Coverage is checked independently from classification so a classifier cannot hide an action."""

import re

from .action_dispatch import NOT_DISPATCHED_RULE, not_dispatched_coverage
from .dom_evidence import DomQueryEvidence
from .evidence import ActionCoverage, NormalizedTrace, gap

NATIVE_TEXT_LOOKUP_RULE = 'native_text_lookup_observation/v1'
FAILED_NATIVE_DOM_LOOKUP_RULE = 'failed_native_dom_lookup_observation/v1'
URL_DIGEST = re.compile(r'^[a-f0-9]{64}$')


# WHY: search_page 只为首次 Agent 探索提供页面文本定位；准入必须由完整只读证据重算，不能成为复跑输出。
def search_page_coverage(registry, action, pre, post):
    if (registry is None or action.name != 'search_page' or action.effect != 'read'
            or action.status != 'succeeded' or action.resultRef is None
            or pre is None or post is None
            or pre.id != action.preObservationRef or post.id != action.postObservationRef
            or not pre.tabId or pre.tabId != post.tabId):
        return None
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None
    before = [fact for fact in pre.facts if fact.kind == 'url_digest']
    after = [fact for fact in post.facts if fact.kind == 'url_digest']
    if (len(before) != 1 or len(after) != 1
            or not isinstance(before[0].value, str) or not URL_DIGEST.fullmatch(before[0].value)
            or before[0].value != after[0].value):
        return None
    refs = {}
    for ref in [action.resultRef, *pre.sourceRefs, *post.sourceRefs]:
        refs[(ref.ref, ref.digest)] = ref
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule=NATIVE_TEXT_LOOKUP_RULE, evidenceRefs=list(refs.values()))


# WHY: 原生 DOM 查询失败只描述首次探索找路；完整同页 query 证据允许保留失败事实，但不能生成复跑动作。
def failed_native_dom_lookup_coverage(registry, action, pre, post):
    if (registry is None or action.name != 'find_elements' or action.effect != 'read'
            or action.status != 'failed' or action.resultRef is None
            or pre is None or post is None
            or pre.id != action.preObservationRef or post.id != action.postObservationRef
            or not pre.tabId or pre.tabId != post.tabId or pre.url != post.url):
        return None
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None
    before = [fact for fact in pre.facts if fact.kind == 'url_digest']
    after = [fact for fact in post.facts if fact.kind == 'url_digest']
    queries = [fact for fact in post.facts if fact.kind == 'dom_query']
    if (len(before) != 1 or len(after) != 1 or len(queries) != 1
            or not isinstance(before[0].value, str) or not URL_DIGEST.fullmatch(before[0].value)
            or before[0].value != after[0].value):
        return None
    try:
        query = DomQueryEvidence.model_validate(queries[0].value)
    except Exception:
        return None
    args = action.args if isinstance(action.args, dict) else {}
    if (query.actionRef != action.id or query.query.kind != 'css'
            or query.query.value != args.get('selector')
            or query.includeText != (args.get('include_text', True) is True)
            or query.maxResults != args.get('max_results', 50)
            or query.complete is not False or 'query_action_failed' not in query.limitations
            or query.scope.tabId != pre.tabId or query.scope.frameId is not None
            or query.scope.url != pre.url or query.scope.urlDigest != before[0].value):
        return None
    refs = _unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs,
                         *before[0].sourceRefs, *after[0].sourceRefs, *queries[0].sourceRefs])
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule=FAILED_NATIVE_DOM_LOOKUP_RULE, evidenceRefs=refs)


def validate_coverage(trace: NormalizedTrace, ledger: list[ActionCoverage], segment_ids: set[str], *, registry=None):
    issues = []
    actions = {action.id: action for action in trace.actions}
    observations = {observation.id: observation for observation in trace.observations}
    seen = set()
    for row in ledger:
        action = actions.get(row.actionRef)
        if action is None or row.actionRef in seen:
            issues.append(gap('incomplete_action_coverage', [row.actionRef], 'unknown_or_duplicate_owner', 'reject_trace'))
            continue
        seen.add(row.actionRef)
        owns = row.disposition in ('compiled', 'supporting', 'retry_attempt')
        if owns and row.ownerSegmentId not in segment_ids:
            issues.append(gap('incomplete_action_coverage', [action.id], 'missing_segment_owner', 'reject_trace'))
        if not owns and row.ownerSegmentId is not None:
            issues.append(gap('incomplete_action_coverage', [action.id], 'unexpected_segment_owner', 'reject_trace'))
        if row.disposition == 'agent_internal':
            done = (action.effect == 'none' and action.name == 'done'
                    and row.exclusionRule == 'agent_done_metadata/v1')
            lookup = (action.effect == 'read' and action.name == 'find_elements' and action.status == 'succeeded'
                      and row.exclusionRule == 'native_dom_lookup_observation/v1' and row.evidenceRefs)
            failed_lookup = failed_native_dom_lookup_probe(
                registry, action, observations.get(action.preObservationRef),
                observations.get(action.postObservationRef), row)
            text_lookup = search_page_coverage(
                registry, action, observations.get(action.preObservationRef),
                observations.get(action.postObservationRef))
            text_lookup = text_lookup is not None and row == text_lookup
            dispatch = not_dispatched_coverage(trace, action)
            skipped = (row.exclusionRule == NOT_DISPATCHED_RULE and dispatch is not None
                       and row.evidenceRefs == dispatch.evidenceRefs)
            field_probe = failed_bat_field_read_probe(registry, action, row)
            wait_probe = failed_bat_wait_probe(registry, trace, action, row)
            if (not done and not lookup and not failed_lookup and not text_lookup
                    and not skipped and not field_probe and not wait_probe):
                issues.append(gap('incomplete_action_coverage', [action.id], 'invalid_exclusion', 'reject_trace'))
        if row.disposition == 'supporting':
            if (action.name != 'wait' or action.effect != 'none' or action.status != 'succeeded'
                    or row.exclusionRule not in ('unchanged_wait_after_proven_effect/v1', 'bounded_postcondition_wait/v1')
                    or not row.evidenceRefs):
                issues.append(gap('incomplete_action_coverage', [action.id], 'unproven_supporting_action', 'reject_trace'))
        if row.disposition == 'retry_attempt':
            successor = next((a for a in trace.actions if a.retryOf == action.id and a.status == 'succeeded'), None)
            if action.status != 'failed' or successor is None or not row.evidenceRefs:
                issues.append(gap('incomplete_action_coverage', [action.id], 'unproven_retry', 'reject_trace'))
        if row.disposition == 'compiled' and action.status != 'succeeded':
            issues.append(gap('incomplete_action_coverage', [action.id], 'unexecuted_action', 'reject_trace'))
        if row.disposition in ('compiled', 'supporting') and action.effect not in ('none', 'read') and not action.postObservationRef:
            issues.append(gap('missing_postcondition', [action.id], 'side_effect_without_post_observation'))
    for action_id in actions.keys() - seen:
        issues.append(gap('incomplete_action_coverage', [action_id], 'unassigned_action', 'reject_trace'))
    return sorted(issues, key=lambda item: item.id)


def failed_bat_field_read_probe(registry, action, row):
    if (registry is None or action.name != 'bat_read_fields' or action.effect != 'read'
            or action.status != 'failed' or action.resultRef is None
            or row.exclusionRule != 'failed_bat_field_read_probe/v1'
            or row.evidenceRefs != [action.resultRef]):
        return False
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return False
    return True


def failed_native_dom_lookup_probe(registry, action, pre, post, row):
    expected = failed_native_dom_lookup_coverage(registry, action, pre, post)
    return expected is not None and row == expected


def _unique_refs(refs):
    found = {}
    for ref in refs:
        found[(ref.ref, ref.digest)] = ref
    return list(found.values())


def failed_bat_wait_probe(registry, trace, action, row):
    if (registry is None or action.name != 'bat_wait_for' or action.effect != 'read'
            or action.status != 'failed' or action.resultRef is None
            or row.exclusionRule != 'failed_bat_wait_probe/v1'
            or row.evidenceRefs != [action.resultRef]):
        return False
    post = next((item for item in trace.observations if item.id == action.postObservationRef), None)
    if post is not None and any(fact.kind == 'verified_visible_wait'
                                and isinstance(fact.value, dict)
                                and fact.value.get('actionRef') == action.id for fact in post.facts):
        return False
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return False
    return True
