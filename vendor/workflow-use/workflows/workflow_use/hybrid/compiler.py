"""Evidence-first classifier. Model output cannot select capabilities, generate control flow, or fill gaps."""
from jsonschema import Draft202012Validator

from .alignment import validate_alignment
from .bindings import classify_binding, decide_bindings
from .capability import ORDINARY_ACTIONS, TARGET_ACTIONS
from .causal import delayed_post, supporting_wait
from .completion import completion_conditions, fact_values
from .controls import compile_loops, operation_digest, wire_branches, wire_controls
from .coverage import validate_coverage
from .evidence import ActionCoverage, Contract, digest, gap
from .invokes import compile_invokes
from .postconditions import declared_checks
from .read import compile_read
from .registry import ActionRegistry, action_effect
from .request import CompilationRequest, NaturalCompilationRequest, effective_control
from .semantic import compile_semantic


class HybridCompilation(Contract):
    mediaType: str = 'application/vnd.bat.hybrid-compilation+json;version=1'
    compilerVersion: str
    sourceDigests: list[str]
    segments: list[dict]
    controlGraph: dict
    coverage: list[ActionCoverage]
    gaps: list
    canonicalDigest: str


class NaturalHybridCompilation(HybridCompilation):
    outputAssembly: dict | None


def compile_request(request: CompilationRequest | NaturalCompilationRequest, registry: ActionRegistry,
                    verified_children=(), source_gaps=(), *, output_schema=None):
    if isinstance(request, NaturalCompilationRequest):
        from .natural_compile import compile_natural_request
        return compile_natural_request(request, registry, NaturalHybridCompilation, linear_graph, source_gaps,
                                       output_schema=output_schema)
    request = CompilationRequest.model_validate(request.model_dump())
    control_digest = digest(request.control)
    request.control = effective_control(request)
    trace = request.trace
    issues, segments, ledger = list(source_gaps), [], []
    if request.actionRegistryVersion != registry.schemaDigest or trace.source.version != registry.providerVersion:
        issues.append(gap('invalid_source', [], 'registry_version_mismatch', 'reject_trace'))
    if not trace.judged or not trace.completed or trace.finalResultRef is None:
        issues.append(gap('invalid_source', [], 'successful_judged_business_result_required', 'reject_trace'))
    # WHY: 已确认合同缺少或未被样本证明时保持 gap；不能从录像补出分支或循环。
    prior, prior_values, wait_owners = {}, {}, {}
    observations = {item.id: item for item in trace.observations}
    for action in trace.actions:
        if action.id in wait_owners:
            ledger.append(ActionCoverage(actionRef=action.id, disposition='supporting', ownerSegmentId=wait_owners[action.id],
                          exclusionRule='bounded_postcondition_wait/v1', evidenceRefs=[action.resultRef]))
            continue
        owner = segments[-1] if segments and ledger and ledger[-1].ownerSegmentId == segments[-1]['id'] else None
        support = supporting_wait(request, registry, action, owner)
        if support is not None:
            ledger.append(support)
            continue
        pre = observations.get(action.preObservationRef)
        post, waits = delayed_post(request, registry, action,
                     lambda after: proven_effect(request, action, pre, after) if pre else [])
        segment, action_issues = classify_action(request, registry, action, prior, post, prior_values)
        issues.extend(action_issues)
        if segment:
            for wait in waits:
                wait_owners[wait.id] = segment['id']
                segment['proofRefs'].extend(ref.model_dump() for ref in [wait.resultRef,
                                           *observations[wait.preObservationRef].sourceRefs, *observations[wait.postObservationRef].sourceRefs])
            segments.append(segment)
            prior[action.id] = (segment['outputSchema'] if segment['kind'] == 'explicit_llm' else
                                segment['outputs'][0]['schema'] if segment['outputs'] else {'type': 'null'})
            if segment['kind'] == 'deterministic' and segment['operation']['name'] == 'browser.read-fields':
                retain_read_value(segment, action, observations[action.postObservationRef], prior_values)
                for output in segment['outputs']:
                    alias = 'clause:' + output['sourceRef']
                    prior[alias] = output['schema']
                    prior_values.pop(alias, None)
                    if action.id in prior_values:
                        prior_values[alias] = prior_values[action.id]
        internal = action.name == 'done' and not action_issues
        ledger.append(ActionCoverage(actionRef=action.id,
                      disposition='compiled' if segment else 'agent_internal' if internal else 'not_compilable',
                      ownerSegmentId=segment['id'] if segment else None,
                      exclusionRule='agent_done_metadata/v1' if internal else None,
                      evidenceRefs=[action.resultRef] if action.resultRef else []))
    segments, invoke_issues = compile_invokes(request, segments, ledger, verified_children)
    issues.extend(invoke_issues)
    segments, controls, control_issues = compile_loops(request, segments, ledger)
    issues.extend(control_issues)
    # WHY: 重复轨迹不能被展平成 N 份同构步骤，也不能反推循环次数；需要来源明确的循环合同。
    seen_operations = set()
    for segment in segments:
        signature = operation_digest(segment)
        if signature in seen_operations:
            issues.append(gap('missing_control_intent', [], 'repeated_operation_requires_control_intent', 'confirm_intent'))
        seen_operations.add(signature)
    issues.extend(validate_coverage(trace, ledger, {segment['id'] for segment in segments}))
    issues = sorted({item.id: item for item in issues}.values(), key=lambda item: item.id)
    graph = wire_controls(linear_graph(segments), controls) if not issues else {'entry': '', 'edges': [], 'terminals': []}
    if not issues:
        graph, branch_issues = wire_branches(request, graph, segments)
        issues.extend(branch_issues)
        if not issues:
            issues.extend(validate_alignment(request, segments, graph))
        if issues:
            graph = {'entry': '', 'edges': [], 'terminals': []}
    body = dict(mediaType='application/vnd.bat.hybrid-compilation+json;version=1',
                compilerVersion=request.compilerVersion,
                sourceDigests=[request.requirement.digest, request.plan.digest, trace.digest,
                               control_digest, digest(request.acceptedAnnotations and
                               [a.model_dump() for a in request.acceptedAnnotations] or []), registry.schemaDigest],
                segments=segments, controlGraph=graph, coverage=[row.model_dump() for row in ledger],
                gaps=[item.model_dump() for item in issues])
    return HybridCompilation.model_validate({**body, 'canonicalDigest': digest(body)})


def classify_action(request, registry, action, prior, post_override=None, prior_values=None):
    if action.name not in registry.names:
        return None, [gap('unsupported_action', [action.id], 'unregistered_action', 'add_capability')]
    if action.effect != action_effect(action.name):
        return None, [gap('invalid_source', [action.id], 'action_effect_mismatch', 'reject_trace')]
    try:
        registry.validate_action(action.name, action.args)
    except Exception:
        return None, [gap('invalid_source', [action.id], 'invalid_action_arguments', 'reject_trace')]
    if action.status != 'succeeded' or not action.resultRef:
        return None, [gap('invalid_source', [action.id], 'successful_action_result_required', 'reject_trace')]
    observations = {item.id: item for item in request.trace.observations}
    pre, post = observations.get(action.preObservationRef), post_override or observations.get(action.postObservationRef)
    if pre is None or post is None:
        return None, [gap('missing_observation', [action.id], 'action_pre_and_post_required')]
    if pre.tabId != post.tabId:
        return None, [gap('unsupported_capability', [action.id], 'cross_tab_state_contract_required', 'add_capability')]
    if action.effect in ('none', 'read') and pre.url != post.url:
        return None, [gap('missing_effect_proof', [action.id], 'unexplained_url_change')]
    if action.name == 'done':
        return None, []
    if action.name == 'extract':
        segment, issues = compile_read(request, action, pre, post)
        if segment is not None or issues:
            return segment, issues
        return compile_semantic(request, action, prior)
    if action.name not in ORDINARY_ACTIONS:
        return None, [gap('unsupported_capability', [action.id], 'ordinary_capability_not_admitted', 'add_capability')]
    target, selection_issues = selection_target(request, action, pre)
    if selection_issues:
        return None, selection_issues
    if target is not None and not target_evidence_matches(action, target, pre):
        return None, [gap('missing_effect_proof', [action.id], 'stable_target_not_linked_to_recorded_action')]
    bind_action = action.model_copy(update={'args': {k: v for k, v in action.args.items()
                                      if target is None or k != 'index'}})
    selection_ids = [intent.id for intent in request.control.selections if action.id in intent.actionRefs]
    bindings, issues = decide_bindings(bind_action, request.requirement, request.runtimeInputSchema, prior, selection_ids, prior_values)
    if any(item.kind == 'sample_evidence' for item in bindings):
        issues.append(gap('sample_value_leak', [action.id], 'unbound_sample_argument', 'confirm_intent'))
    postconditions = proven_effect(request, action, pre, post)
    if pre.url != post.url and not any(condition['kind'] == 'url' for condition in postconditions):
        issues.append(gap('missing_effect_proof', [action.id], 'unexplained_url_change'))
    if not postconditions:
        issues.append(gap('missing_effect_proof', [action.id], 'requirement_postcondition_not_proven'))
    else:
        try:
            declared_checks(postconditions, action.args, target, allow_unresolved_target=True)
        except ValueError:
            issues.append(gap('unsupported_capability', [action.id], 'postcondition_target_not_admitted', 'add_capability'))
    if issues:
        return None, issues
    return dict(id='s-' + action.id, kind='deterministic',
                operation={'name': 'browser.workflow-step', 'version': 2, 'actionName': action.name},
                target=target, bindings=[b.model_dump() for b in bindings],
                preconditions=[{'kind': 'source_observation', 'evidenceRef': pre.id}],
                expectedEffect={'kind': action.effect}, postconditions=postconditions, outputs=[],
                proofRefs=[r.model_dump() for r in [action.resultRef, *pre.sourceRefs, *post.sourceRefs]]), []


def retain_read_value(segment, action, observation, values):
    specification = segment['operation']['specification']
    expected = {'actionRef': action.id, 'specificationDigest': digest(specification), 'resultDigest': action.resultRef.digest}
    matched = [fact.value['output'] for fact in observation.facts if fact.kind == 'verified_field_output'
               and isinstance(fact.value, dict) and 'output' in fact.value
               and {key: value for key, value in fact.value.items() if key != 'output'} == expected]
    if len(matched) == 1 and Draft202012Validator(specification['outputSchema']).is_valid(matched[0]):
        values[action.id] = matched[0]


def selection_target(request, action, pre=None):
    if action.name not in TARGET_ACTIONS:
        return None, []
    intents = [intent for intent in request.control.selections if action.id in intent.actionRefs]
    if len(intents) != 1:
        return None, [gap('missing_control_intent', [action.id], 'one_confirmed_selection_required', 'confirm_intent')]
    intent = intents[0]
    clauses = [c for c in request.requirement.clauses if c.id in intent.clauseRefs]
    if not any(c.kind == 'selection' and c.expression == {'strategy': intent.strategy, 'target': intent.target} for c in clauses):
        return None, [gap('missing_control_intent', [action.id], 'selection_not_authorized_by_clause', 'confirm_intent')]
    target = intent.target
    if intent.strategy == 'ordinal':
        valid = _valid_ordinal_intent(target, request)
        if valid and pre is not None:
            structure = _structure_target(action, target, pre)
            if structure is not None:
                return structure, []
        # WHY: runtime ordinal bindings are admitted only after same-snapshot DOM evidence compiled a structure target.
        if 'container' not in target or 'ordinalBinding' in target:
            valid = False
    elif intent.strategy == 'title':
        valid = set(target) == {'role', 'name'} and all(isinstance(value, str) and value for value in target.values())
    else:
        valid = _valid_locator(target)
    if not valid:
        return None, [gap('sample_value_leak', [action.id], 'invalid_or_ephemeral_target', 'confirm_intent')]
    return {'strategy': intent.strategy, **target}, []


def _valid_ordinal_intent(target, request):
    keys = set(target)
    legacy = keys in ({'container', 'ordinal'}, {'container', 'ordinal', 'ordinalBinding'})
    minimal = keys in ({'ordinal'}, {'ordinal', 'ordinalBinding'})
    structure = keys in ({'strategy', 'scope', 'container', 'items', 'ordinal', 'withinItem'},
                         {'strategy', 'scope', 'container', 'items', 'ordinal', 'ordinalBinding', 'withinItem'})
    if not (legacy or minimal or structure) or type(target.get('ordinal')) is not int or target['ordinal'] < 1:
        return False
    if legacy and (not isinstance(target.get('container'), str) or not target['container']):
        return False
    if structure and (target.get('strategy') != 'structure' or not _css_query(target.get('container'))
                      or not _css_query(target.get('items')) or (target.get('withinItem') is not None
                      and not _css_query(target.get('withinItem')))):
        return False
    binding = target.get('ordinalBinding')
    if binding is None:
        return True
    kind = classify_binding(binding, request.runtimeInputSchema, {})
    return kind in ('runtime_input', 'authorized_constant') and (
        kind != 'authorized_constant' or binding.get('value') == target['ordinal'])


def _valid_locator(target):
    if set(target) not in ({'strategy', 'value'}, {'strategy', 'value', 'scope'}):
        return False
    if target.get('strategy') not in ('css', 'xpath') or not isinstance(target.get('value'), str) or not target['value']:
        return False
    scope = target.get('scope')
    return scope is None or (isinstance(scope, dict) and set(scope) == {'url'} and isinstance(scope['url'], str)
                             and bool(scope['url']))


def _structure_target(action, intent_target, pre):
    facts = [fact.value for fact in pre.facts if fact.kind == 'dom_structure' and isinstance(fact.value, dict)
             and fact.value.get('actionRef') == action.id]
    if len(facts) != 1:
        return None
    fact, ordinal = facts[0], intent_target['ordinal']
    candidate = fact.get('queryCandidate')
    if not isinstance(candidate, dict) or candidate.get('complete') is not True:
        return None
    if not _candidate_scope_matches(candidate.get('scope'), fact.get('scope')):
        return None
    if candidate.get('targetRef') != fact.get('targetRef') or candidate.get('matchedItemOrdinal') != ordinal:
        return None
    required = ('container', 'items')
    if any(not _css_query(candidate.get(key)) for key in required):
        return None
    within = candidate.get('withinItem')
    if within is not None and not _css_query(within):
        return None
    if intent_target.get('strategy') == 'structure' and any(intent_target.get(key) != candidate.get(key)
            for key in ('container', 'items', 'withinItem')):
        return None
    scope = intent_target.get('scope', {'url': pre.url})
    if not isinstance(scope, dict) or set(scope) != {'url'} or scope.get('url') != pre.url:
        return None
    target = {'strategy': 'structure', 'scope': scope, 'container': candidate['container'],
              'items': candidate['items'], 'ordinal': ordinal, 'withinItem': within}
    if 'ordinalBinding' in intent_target:
        target['ordinalBinding'] = intent_target['ordinalBinding']
    return target


def _css_query(value):
    return isinstance(value, dict) and set(value) == {'kind', 'value'} and value.get('kind') == 'css' \
        and isinstance(value.get('value'), str) and bool(value['value'])


def _candidate_scope_matches(candidate, scope):
    if not isinstance(candidate, dict) or not isinstance(scope, dict) or candidate.get('kind') != 'document':
        return False
    return candidate.get('tabId') == scope.get('tabId') and candidate.get('frameId') == scope.get('frameId')


def target_evidence_matches(action, target, pre):
    if target['strategy'] == 'structure':
        source = _structure_target(action, {'ordinal': target['ordinal'],
                  **({'ordinalBinding': target['ordinalBinding']} if 'ordinalBinding' in target else {})}, pre)
        return source == target
    if target['strategy'] == 'xpath':
        if _xpath_fact_matches(action, target, pre):
            return True
    return any(fact.kind == 'resolved_target' and fact.value == {
        'actionRef': action.id, 'index': action.args.get('index'), 'target': target} for fact in pre.facts)


def _xpath_fact_matches(action, target, pre):
    for fact in pre.facts:
        value = fact.value
        if fact.kind != 'dom_structure' or not isinstance(value, dict) or value.get('actionRef') != action.id:
            continue
        if target.get('scope', {}).get('url', pre.url) != pre.url:
            continue
        nodes = [node for node in value.get('nodes', []) if node.get('id') == value.get('targetRef')]
        if len(nodes) == 1 and nodes[0].get('xpath') == target['value']:
            return True
    return False


def proven_effect(request, action, pre, post):
    if action.name == 'navigate':
        if action.args.get('new_tab') or pre.tabId != post.tabId:
            return []  # cross-tab requires a separately verified return/switch contract
        return [{'kind': 'url', 'bindingArgument': 'url'}] if post.url == action.args.get('url') else []
    conditions = []
    selection_ids = [intent.id for intent in request.control.selections if action.id in intent.actionRefs]
    for condition in completion_conditions(request.requirement.clauses, action.id, selection_ids):
        expected = action.args.get(condition['bindingArgument']) if 'bindingArgument' in condition else condition.get('equals')
        before, after = fact_values(condition, pre), fact_values(condition, post)
        if len(before) == len(after) == 1 and before[0] != after[0] and (condition.get('changed') is True or after[0] == expected):
            conditions.append(condition)
    return conditions


def linear_graph(segments):
    terminals = [{'id': status, 'status': status} for status in ('completed', 'partial', 'missing', 'timeout', 'blocked',
                                                                  'human_required', 'failed', 'cancelled')]
    edges = []
    for index, segment in enumerate(segments):
        following = segments[index + 1]['id'] if index + 1 < len(segments) else 'completed'
        edges.append({'from': segment['id'], 'outcome': 'success', 'to': following})
        failures = ('timeout', 'failed', 'cancelled') if segment['kind'] == 'explicit_llm' else (
            'missing', 'timeout', 'blocked', 'human_required', 'failed', 'cancelled')
        if segment['kind'] == 'deterministic' and segment['operation']['name'] == 'task-chain.invoke':
            failures = ('partial', 'blocked', 'human_required', 'timeout', 'failed', 'cancelled')
        edges.extend({'from': segment['id'], 'outcome': status, 'to': status} for status in failures)
    return {'entry': segments[0]['id'] if segments else 'completed', 'edges': edges, 'terminals': terminals}
