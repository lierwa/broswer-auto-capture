"""Coverage is checked independently from classification so a classifier cannot hide an action."""

import re
from types import SimpleNamespace

from .action_dispatch import NOT_DISPATCHED_RULE, not_dispatched_coverage
from .dom_evidence import DomQueryEvidence
from .evidence import ActionCoverage, NormalizedTrace, digest, gap
from .natural_reads import VerifiedNaturalRead, validate_compiled_query_read
from .native_discovery import native_discovery_proof

NATIVE_TEXT_LOOKUP_RULE = 'native_text_lookup_observation/v1'
DOM_NODE_INSPECTION_RULE = 'dom_node_inspection_observation/v1'
NATIVE_EXTRACTION_RULE = 'native_extraction_observation/v1'
EXECUTION_EXTRACTION_RULE = 'execution_extraction_observation/v1'
FAILED_NATIVE_DOM_LOOKUP_RULE = 'failed_native_dom_lookup_observation/v1'
PREPARATION_SELECTION_VALIDATION_RULE = 'preparation_selection_validation/v1'
URL_DIGEST = re.compile(r'^[a-f0-9]{64}$')


def selection_validation_coverage(registry, action):
    """A registered pure preparation computation owns no replay browser segment."""
    if (registry is None or action.name != 'bat_validate_selection' or action.effect != 'none'
            or action.status not in ('succeeded', 'failed') or action.resultRef is None):
        return None
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None
    # WHY：成功与失败都保留真实校验回执；纯准备计算不得混入普通链路或隐藏浏览器副作用。
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule=PREPARATION_SELECTION_VALIDATION_RULE, evidenceRefs=[action.resultRef])


# WHY: search_page/dropdown_options 仅提供原生只读文本发现；选择值仍需输入或需求绑定，不能成为复跑输出。
def search_page_coverage(registry, action, pre, post):
    if (registry is None or action.name not in ('search_page', 'dropdown_options') or action.effect != 'read'
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


def dom_inspection_coverage(registry, action, pre, post):
    """Admit one same-page authoring-only DOM neighborhood inspection."""
    if (registry is None or action.name != 'bat_inspect_dom' or action.effect != 'read'
            or action.status != 'succeeded' or action.resultRef is None
            or pre is None or post is None or pre.id != action.preObservationRef
            or post.id != action.postObservationRef or not pre.tabId or pre.tabId != post.tabId
            or pre.url != post.url):
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
    refs = _unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs,
                         *before[0].sourceRefs, *after[0].sourceRefs])
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule=DOM_NODE_INSPECTION_RULE, evidenceRefs=refs)


# WHY: 原生 extract 只帮助首次 Agent 理解页面和继续业务导航；最终输出仍由 verified read/summary
# 独立装配，因此它不能成为复跑节点，也不能因为缺少 selector 证据反过来阻塞首次探索。
def native_extraction_coverage(registry, action, pre, post):
    if (registry is None or action.name != 'extract' or action.effect != 'read'
            or action.status != 'succeeded' or action.resultRef is None
            or pre is None or post is None
            or pre.id != action.preObservationRef or post.id != action.postObservationRef
            or not pre.tabId or pre.tabId != post.tabId or pre.url != post.url):
        return None
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None
    # WHY：宿主若已把同一次 extract 反读为正式记录投影，该动作应由读取节点拥有，
    # 不能再先被“仅供探索”规则吞掉。
    if any(fact.kind == 'verified_natural_read' and isinstance(fact.value, dict)
           and fact.value.get('actionRef') == action.id for fact in post.facts):
        return None
    before = [fact for fact in pre.facts if fact.kind == 'url_digest']
    after = [fact for fact in post.facts if fact.kind == 'url_digest']
    facts = [fact for fact in post.facts if fact.kind == 'native_extraction']
    if (len(before) != 1 or len(after) != 1 or len(facts) != 1
            or not isinstance(before[0].value, str) or not URL_DIGEST.fullmatch(before[0].value)
            or before[0].value != after[0].value):
        return None
    value = facts[0].value
    if (not isinstance(value, dict)
            or set(value) != {'actionRef', 'outputSchemaDigest', 'resultDigest', 'output'}
            or value.get('actionRef') != action.id
            or value.get('resultDigest') != action.resultRef.digest
            or not isinstance(value.get('outputSchemaDigest'), str)
            or not URL_DIGEST.fullmatch(value['outputSchemaDigest'])):
        return None
    refs = _unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs, *facts[0].sourceRefs])
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule=NATIVE_EXTRACTION_RULE, evidenceRefs=refs)


def execution_extraction_coverage(registry, action, pre, post, result_spec, output_schema):
    """Execution reads are never safe to erase merely because the public result is null.

    A native extract may choose a later target or prove the final browser state.  Until that value is
    projected into a replayable read/decision contract, compilation must keep the action as a gap.
    """
    return None


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


def unused_verified_dom_read_coverage(registry, action, pre, post):
    """Keep an unused complete query in source audit without replaying its pure DOM read."""
    if (registry is None or action.name != 'find_elements' or action.effect != 'read'
            or action.status != 'succeeded' or action.resultRef is None or pre is None or post is None
            or pre.id != action.preObservationRef or post.id != action.postObservationRef
            or not pre.tabId or pre.tabId != post.tabId or pre.url != post.url):
        return None
    try:
        registry.validate_action(action.name, action.args)
        queries = [fact for fact in post.facts if fact.kind == 'dom_query'
                   and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
        reads = [fact for fact in post.facts if fact.kind == 'verified_natural_read'
                 and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
        if len(queries) != 1 or len(reads) != 1:
            return None
        query = DomQueryEvidence.model_validate(queries[0].value)
        read = VerifiedNaturalRead.model_validate(reads[0].value)
        args = action.args if isinstance(action.args, dict) else {}
        if (query.complete is not True or query.query.kind != 'css'
                or query.query.value != args.get('selector')
                or query.maxResults != args.get('max_results', 50)
                or query.includeText != (args.get('include_text', True) is True)
                or query.scope.tabId != pre.tabId or query.scope.frameId is not None
                or query.scope.url != pre.url or query.scope.urlDigest != read.urlDigest):
            return None
        validate_compiled_query_read(read, action, pre, post)
        if not queries[0].sourceRefs or not reads[0].sourceRefs:
            return None
    except Exception:
        return None
    refs = _unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs,
                         *queries[0].sourceRefs, *reads[0].sourceRefs])
    # WHY：TS runtime-scope 已验证该通用只读排除规则；新规则会断开跨层同页证据边界。
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule='native_dom_lookup_observation/v1', evidenceRefs=refs)


def native_dom_lookup_observation_coverage(registry, action, pre, post, *, allow_complete_discovery=False):
    """Classify a proven local discovery query without lending it business-read semantics."""
    if (registry is None or action.name != 'find_elements' or action.effect != 'read'
            or action.status != 'succeeded' or action.resultRef is None or pre is None or post is None
            or pre.id != action.preObservationRef or post.id != action.postObservationRef
            or not pre.tabId or pre.tabId != post.tabId or pre.url != post.url):
        return None
    before = [fact for fact in pre.facts if fact.kind == 'url_digest']
    after = [fact for fact in post.facts if fact.kind == 'url_digest']
    queries = [fact for fact in post.facts if fact.kind == 'dom_query'
               and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if (len(before) != 1 or len(after) != 1 or len(queries) != 1
            or not isinstance(before[0].value, str) or not URL_DIGEST.fullmatch(before[0].value)
            or before[0].value != after[0].value):
        return None
    try:
        registry.validate_action(action.name, action.args)
        query = DomQueryEvidence.model_validate(queries[0].value)
        args = action.args
        if (query.query.kind != 'css' or query.query.value != args.get('selector')
                or query.includeText != (args.get('include_text', True) is True)
                or query.requestedAttributes != sorted(set(args.get('attributes') or []))
                or query.maxResults != args.get('max_results', 50)
                or query.scope.tabId != pre.tabId or query.scope.frameId is not None
                or query.scope.url != pre.url or query.scope.urlDigest != before[0].value
                or not queries[0].sourceRefs or any(ref.digest != digest(query.model_dump(mode='json'))
                                                  for ref in queries[0].sourceRefs)):
            return None
        # WHY：只有最终消费分析证明无执行依赖时，完整文本探查才可保留为准备审计。
        # 已有 verified read 仍走独立的读取活性验证；不能靠“只读”吞掉业务值来源。
        if query.complete and ((query.includeText and not allow_complete_discovery)
                               or query.total is None or query.truncated is not False
                               or query.total != query.showing or query.total > query.maxResults):
            return None
        if any(fact.kind == 'verified_natural_read' and isinstance(fact.value, dict)
               and fact.value.get('actionRef') == action.id for fact in post.facts):
            return None
        discovery_refs = native_discovery_proof(action, pre, post, query) if (
            allow_complete_discovery and query.complete and query.includeText) else []
        if discovery_refs is None:
            return None
    except Exception:
        return None
    refs = _unique_refs([action.resultRef, *pre.sourceRefs, *post.sourceRefs,
                        *before[0].sourceRefs, *after[0].sourceRefs, *queries[0].sourceRefs, *discovery_refs])
    return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                          exclusionRule='native_dom_lookup_observation/v1', evidenceRefs=refs)


def native_dom_lookup_exclusion(registry, action, pre, post, row, consumed_query_ids):
    if row.exclusionRule != 'native_dom_lookup_observation/v1':
        return False
    if consumed_query_ids is not None and action.id in consumed_query_ids:
        return False
    expected = native_dom_lookup_observation_coverage(registry, action, pre, post)
    if expected is not None:
        return row == expected
    expected = unused_verified_dom_read_coverage(registry, action, pre, post)
    if consumed_query_ids is None:
        return False
    if expected is not None:
        return row == expected
    expected = native_dom_lookup_observation_coverage(registry, action, pre, post, allow_complete_discovery=True)
    return expected is not None and row == expected


def validate_coverage(trace: NormalizedTrace, ledger: list[ActionCoverage], segment_ids: set[str], *, registry=None,
                      result_spec=None, output_schema=None, consumed_query_ids=None, compiled_segments=()):
    issues = []
    actions = {action.id: action for action in trace.actions}
    observations = {observation.id: observation for observation in trace.observations}
    fixed_waits = _fixed_target_waits(trace, registry, compiled_segments)
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
            lookup = native_dom_lookup_exclusion(registry, action, observations.get(action.preObservationRef),
                                                 observations.get(action.postObservationRef), row, consumed_query_ids)
            failed_lookup = failed_native_dom_lookup_probe(
                registry, action, observations.get(action.preObservationRef),
                observations.get(action.postObservationRef), row)
            text_lookup = search_page_coverage(
                registry, action, observations.get(action.preObservationRef),
                observations.get(action.postObservationRef))
            text_lookup = text_lookup is not None and row == text_lookup
            inspection = dom_inspection_coverage(
                registry, action, observations.get(action.preObservationRef),
                observations.get(action.postObservationRef))
            inspection = inspection is not None and row == inspection
            extraction = None if getattr(result_spec, 'mode', None) == 'execution' else native_extraction_coverage(
                registry, action, observations.get(action.preObservationRef),
                observations.get(action.postObservationRef))
            extraction = extraction is not None and row == extraction
            execution_extraction = execution_extraction_coverage(
                registry, action, observations.get(action.preObservationRef),
                observations.get(action.postObservationRef), result_spec, output_schema)
            execution_extraction = execution_extraction is not None and row == execution_extraction
            dispatch = not_dispatched_coverage(trace, action)
            skipped = (row.exclusionRule == NOT_DISPATCHED_RULE and dispatch is not None
                       and row.evidenceRefs == dispatch.evidenceRefs)
            field_probe = failed_bat_field_read_probe(registry, action, row)
            wait_probe = failed_bat_wait_probe(registry, trace, action, row)
            selection_probe = selection_validation_coverage(registry, action)
            selection_probe = selection_probe is not None and row == selection_probe
            if (not done and not lookup and not failed_lookup and not text_lookup and not inspection and not extraction
                    and not execution_extraction
                    and not skipped and not field_probe and not wait_probe and not selection_probe):
                issues.append(gap('incomplete_action_coverage', [action.id], 'invalid_exclusion', 'reject_trace'))
        if row.disposition == 'supporting':
            from .natural_repeat import validate_repeat_coverage
            fixed_target_wait = fixed_waits.get(row.actionRef) == row
            if (not validate_repeat_coverage(trace, row) and not fixed_target_wait and (action.name != 'wait' or action.effect != 'none' or action.status != 'succeeded'
                    or row.exclusionRule not in ('unchanged_wait_after_proven_effect/v1', 'bounded_postcondition_wait/v1')
                    or not row.evidenceRefs)):
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


def _fixed_target_waits(trace, registry, segments):
    if registry is None or not segments:
        return {}
    from .causal import waits_owned_by_next_target
    # WHY：复用同一来源证明，不仅凭规则名放行；独立校验不可改变已编译 proofRefs。
    owners = [{**segment, 'proofRefs': list(segment.get('proofRefs', []))} for segment in segments]
    return waits_owned_by_next_target(SimpleNamespace(trace=trace), registry, owners)


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
