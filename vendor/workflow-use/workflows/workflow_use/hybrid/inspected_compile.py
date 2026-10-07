"""Adapt read-only method origins without manufacturing executed navigation evidence."""
from copy import deepcopy

from .evidence import ActionCoverage, gap
from .method_inspection import InspectedMethod, inspected_method_read, latest_method_read
from .natural_readiness import NATURAL_SETTLE
from .natural_repeat_evidence import _assert_same_document
from .natural_selection import bind_selection_function


def coalesced_navigation(trace, inspected):
    """Only consecutive, same-document, same-read navigation can replace a proposal."""
    observations = {o.id: o for o in trace.observations}
    before = observations.get(inspected.preObservationRef)
    for action in trace.actions[trace.actions.index(inspected) + 1:]:
        # WHY：旧页 wait 不能跨导航搬成播放后态；首版合并只接收紧邻的真实导航。
        if (action.name != 'navigate' or action.status != 'succeeded' or before is None
                or action.args.get('url') != inspected.args.get('action', {}).get('navigate', {}).get('url')):
            return None
        try:
            _assert_same_document(before, observations[action.preObservationRef])
            match = latest_method_read(trace.observations, observations[action.preObservationRef], action.args['url'])
            inspection = inspected_method_read(trace, inspected)
            if match and match[0].id == inspection[0].id:
                return action
        except (ValueError, KeyError):
            return None
        return None
    return None


def inspected_navigation_source(trace, action):
    if action.name != 'navigate':
        return None
    for inspected in reversed(trace.actions[:trace.actions.index(action)]):
        if inspected.name == 'bat_inspect_action' and inspected.status == 'succeeded':
            return inspected if coalesced_navigation(trace, inspected) == action else None
    return None


def reused_method_program(trace, action, read):
    if action.name != 'navigate':
        return None
    for inspected in reversed(trace.actions[:trace.actions.index(action)]):
        if inspected.name != 'bat_inspect_action' or inspected.status != 'succeeded':
            continue
        if coalesced_navigation(trace, inspected) != action:
            return None
        proposals = [f for o in trace.observations for f in o.facts if f.kind == 'selection_function'
                     and f.value.get('methodRef') == inspected.id and f.value.get('readFactRef') == read.id]
        return deepcopy(proposals[0].value['draft']) if len(proposals) == 1 else None
    return None


def inspection_coverage(trace, action):
    if action.name != 'bat_inspect_action' or action.resultRef is None:
        return None
    if action.status == 'failed':
        return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
            exclusionRule='failed_method_inspection/v1', evidenceRefs=[action.resultRef])
    if action.status == 'succeeded':
        actual = coalesced_navigation(trace, action)
        if actual is not None:
            return ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                exclusionRule='coalesced_method_inspection/v1', evidenceRefs=[action.resultRef, actual.resultRef])
    return None


def compile_inspected_navigation(request, registry, action, segments, repeat):
    try:
        if request.compilerVersion != 'bat-hybrid/3' or repeat is not None:
            raise ValueError('inspected_navigation_scope_unsupported')
        registry.validate_action(action.name, action.args)
        if action.status != 'succeeded' or action.effect != 'read' or action.resultRef is None:
            raise ValueError('inspected_navigation_successful_inspection_required')
        before = next(o for o in request.trace.observations if o.id == action.preObservationRef)
        after = next(o for o in request.trace.observations if o.id == action.postObservationRef)
        _assert_same_document(before, after)
        facts = [f for f in before.facts if f.kind == 'inspected_method' and f.value.get('actionRef') == action.id]
        fact, read = inspected_method_read(request.trace, action)
        value = InspectedMethod.model_validate(facts[0].value)
        if value.requirementDigest != request.requirement.sourceDigest or value.registryDigest != registry.schemaDigest:
            raise ValueError('inspected_navigation_source_mismatch')
        following = request.trace.actions[request.trace.actions.index(action) + 1:]
        # WHY：插入导航会换文档，首版只容许运行时重观察的页面级等待；不搬运旧 DOM 读或点击。
        if any(a.name not in ('wait', 'done') for a in following):
            raise ValueError('inspected_navigation_continuation_unsupported')
        proof = [ref.model_dump(mode='json') for ref in [action.resultRef, *facts[0].sourceRefs]]
        segment = {'id': 's-' + action.id, 'kind': 'deterministic',
            'operation': {'name': 'browser.workflow-step', 'version': 2, 'actionName': 'navigate'},
            'target': None, 'bindings': [],
            'preconditions': [{'kind': 'source_observation', 'evidenceRef': before.id}],
            'expectedEffect': {'kind': 'navigation'},
            'postconditions': [{'kind': 'url', 'bindingArgument': 'url', 'clauseRef': facts[0].id,
                                'settle': NATURAL_SETTLE}], 'outputs': [], 'proofRefs': proof}
        functions, segment, issues = bind_selection_function(request, action, segments, segment)
        if issues:
            return [], None, issues
        function = functions[0]
        segment['bindings'] = [{'id': 'b-' + action.id + '-url', 'actionRef': action.id,
            'argumentPath': 'url', 'kind': 'prior_output', 'sourceRef': function['id'], 'transform': None,
            'derivation': 'selection_function', 'proofRefs': function['proofRefs'],
            'binding': {'source': 'node', 'nodeId': function['id'], 'path': []}}]
        return functions, segment, []
    except (ValueError, TypeError, KeyError, IndexError, StopIteration) as error:
        reason = str(error) if str(error).startswith('inspected_navigation_') else 'inspected_navigation_evidence_invalid'
        return [], None, [gap('missing_binding', [action.id], reason, 'collect_evidence')]
