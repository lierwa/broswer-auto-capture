"""Compile and independently revalidate provenance-backed natural action bindings."""

from .bindings import classify_binding
from .evidence import EvidenceRef, digest, gap
from .natural_facts import IGNORED_TECHNICAL_PARAMETERS, NaturalBindingFact, is_native_parameter
from .natural_reads import VerifiedNaturalRead, value_at_path
from .prior_read_bindings import binding_from_prior_reads
from .natural_repeat import derived_repeat_navigation_binding
from .natural_selection import selection_navigation_binding


def natural_bindings(request, action, pre, has_target, prior_segments=(), *, dependencies=None):
    args = action.args if isinstance(action.args, dict) else {}
    decisions, issues = [], []
    facts = [fact for fact in pre.facts if fact.kind == 'natural_binding'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    for key in sorted(args):
        if has_target and key in ('index', 'element_index', 'xpath'):
            continue
        # WHY：原生 viewport scroll 的显式 None 与缺省同义，不是需要绑定的元素目标。
        if action.name == 'scroll' and key == 'index' and args[key] is None:
            continue
        if key in IGNORED_TECHNICAL_PARAMETERS.get(action.name, frozenset()):
            continue
        matches = [fact for fact in facts if fact.value.get('argumentPath') == key]
        if len(matches) != 1:
            derived = (derived_repeat_navigation_binding(request, action, key, args[key], prior_segments)
                       or derived_prior_read_binding(request, action, key, args[key], prior_segments)
                       or selection_navigation_binding(request, action, key, prior_segments)) \
                if not matches else None
            if derived is not None:
                decisions.append(derived)
                continue
            if not matches and dependencies is not None:
                from .natural_prefix_dependency import defer_repeat_navigation
                if defer_repeat_navigation(request, action, key, args[key], prior_segments, dependencies):
                    continue
            issues.append(gap('missing_binding', [action.id],
                              'natural_binding_evidence_missing:' + key, 'collect_evidence'))
            continue
        fact = matches[0]
        try:
            value = NaturalBindingFact.model_validate(fact.value)
        except Exception:
            issues.append(gap('invalid_source', [action.id], 'invalid_natural_binding_fact', 'reject_trace'))
            continue
        kind = classify_binding(value.binding, request.runtimeInputSchema,
                                _prior_action_schemas(prior_segments))
        proof_refs = _binding_proof_refs(
            request, action, key, value, kind, prior_segments, fact.sourceRefs)
        if proof_refs is None:
            issues.append(gap('missing_binding', [action.id],
                              'natural_binding_provenance_mismatch:' + key, 'collect_evidence'))
            continue
        decisions.append({'id': f'b-{action.id}-{key}', 'actionRef': action.id,
            'argumentPath': key, 'kind': kind, 'sourceRef': fact.id, 'transform': None,
            'proofRefs': [ref.model_dump(mode='json') for ref in proof_refs],
            'binding': value.binding})
    return decisions, issues


def derived_prior_read_binding(request, action, key, expected, prior_segments):
    """Recover a deterministic source decision from earlier immutable verified reads."""
    previous = []
    for candidate in request.trace.actions:
        if candidate.id == action.id:
            break
        post = next((item for item in request.trace.observations
                     if item.id == candidate.postObservationRef), None)
        if post is not None:
            previous.extend(fact for fact in post.facts if fact.kind == 'verified_natural_read')
    binding = binding_from_prior_reads(action.id, key, expected, previous)
    if binding is None:
        return None
    sources = [fact for fact in previous if fact.id == binding.sourceReadRef]
    if len(sources) != 1:
        return None
    kind = classify_binding(binding.binding, request.runtimeInputSchema,
                            _prior_action_schemas(prior_segments))
    refs = _binding_proof_refs(request, action, key, binding, kind,
                               prior_segments, sources[0].sourceRefs)
    if kind != 'prior_output' or refs is None:
        return None
    # WHY：这里只派生编译决策，不把当前编译器生成的事实塞回旧浏览器 trace。
    return {'id': f'b-{action.id}-{key}', 'actionRef': action.id, 'argumentPath': key,
            'kind': kind, 'sourceRef': sources[0].id, 'transform': None,
            'derivation': 'prior_verified_read',
            'proofRefs': [ref.model_dump(mode='json') for ref in refs],
            'binding': binding.binding}


def anchored_navigation_binding(request, action, pre, post, target, prior_segments=()):
    """Bind an anchor click's proven destination to one earlier verified read value."""
    identity = target.get('identity') if isinstance(target, dict) and target.get('strategy') == 'history' else None
    if action.name != 'click' or not isinstance(identity, dict) or identity.get('nodeName') != 'a':
        return None
    dom_facts = [fact for fact in pre.facts if fact.kind == 'dom_structure'
                 and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    url_facts = [fact for fact in post.facts if fact.kind == 'url' and isinstance(fact.value, str)]
    if len(dom_facts) != 1 or len(url_facts) != 1:
        return None
    prior_action_ids = {item['id'].removeprefix('s-') for item in prior_segments
                        if item.get('outputs')}
    prior_facts = []
    for observation in request.trace.observations:
        for fact in observation.facts:
            if fact.kind != 'verified_natural_read':
                continue
            try:
                read = VerifiedNaturalRead.model_validate(fact.value)
            except Exception:
                continue
            if read.actionRef in prior_action_ids:
                prior_facts.append(fact)
    derived = binding_from_prior_reads(action.id, 'url', url_facts[0].value, prior_facts)
    if derived is None or derived.sourceReadRef is None:
        return None
    source_facts = [fact for fact in prior_facts if fact.id == derived.sourceReadRef]
    kind = classify_binding(derived.binding, request.runtimeInputSchema,
                            _prior_action_schemas(prior_segments))
    if len(source_facts) != 1 or kind != 'prior_output':
        return None
    # WHY：索引不是可复跑参数；锚点点击后的实测 URL 若唯一来自先前读取，
    # 则复跑直接导航到该值，既保留来源绑定，也让空列表分支先于 [0] 求值。
    refs = _unique_refs([*dom_facts[0].sourceRefs, *url_facts[0].sourceRefs,
                         *source_facts[0].sourceRefs])
    decision = {'id': f'b-{action.id}-url', 'actionRef': action.id, 'argumentPath': 'url',
        'kind': kind, 'sourceRef': dom_facts[0].id, 'transform': None,
        'derivation': 'anchor_navigation',
        'proofRefs': [ref.model_dump(mode='json') for ref in refs],
        'binding': derived.binding}
    return decision, url_facts[0]


def _binding_proof_refs(request, action, key, fact, kind, prior_segments, direct_refs):
    if fact.provenance == 'runtime_input':
        return _unique_refs(direct_refs) if kind == 'runtime_input' else None
    if fact.provenance == 'native_parameter':
        matched = (kind == 'authorized_constant' and is_native_parameter(
            action.name, key, action.args[key])
            and digest(fact.binding.get('value')) == digest(action.args[key]))
        return _unique_refs(direct_refs) if matched else None
    if fact.provenance == 'task_literal':
        matched = (kind == 'authorized_constant'
                   and fact.taskQuote == fact.binding.get('value') == action.args[key]
                   and isinstance(fact.taskQuote, str) and fact.taskQuote in request.requirement.text)
        return _unique_refs(direct_refs) if matched else None
    if fact.provenance == 'plan_entry_url':
        matched = (kind == 'authorized_constant' and action.name == 'navigate' and key == 'url'
                   and fact.binding.get('value') == action.args[key]
                   and fact.binding.get('value') in request.plan.entryUrls)
        return _unique_refs(direct_refs) if matched else None
    source = _verified_node_binding_source(request.trace, fact, prior_segments)
    if (fact.provenance != 'node_output' or kind != 'prior_output' or source is None
            or not _value_matches(source[0].output, fact.binding['path'], action.args[key])):
        return None
    return _unique_refs([*direct_refs, *source[1].sourceRefs])


def _prior_action_schemas(segments):
    output = {}
    for segment in segments:
        schemas = [item.get('schema') for item in segment.get('outputs', []) if isinstance(item, dict)]
        if schemas and all(schema == schemas[0] for schema in schemas):
            output[segment['id'].removeprefix('s-')] = schemas[0]
    return output


def _value_matches(output, path, expected):
    try:
        return digest(value_at_path(output, path)) == digest(expected)
    except Exception:
        return False


def _verified_node_binding_source(trace, binding_fact, prior_segments):
    source_ref = binding_fact.sourceReadRef
    node_id = binding_fact.binding.get('nodeId')
    segment = next((item for item in prior_segments if item['id'] == 's-' + str(node_id)), None)
    if (not isinstance(source_ref, str) or segment is None
            or source_ref not in {item.get('sourceRef') for item in segment.get('outputs', [])}):
        return None
    matches = [(observation, fact) for observation in trace.observations for fact in observation.facts
               if fact.id == source_ref and fact.kind == 'verified_natural_read']
    if len(matches) != 1:
        return None
    observation, source_fact = matches[0]
    try:
        source = VerifiedNaturalRead.model_validate(source_fact.value)
    except Exception:
        return None
    action = next((item for item in trace.actions if item.id == node_id), None)
    if (source.actionRef != node_id or action is None
            or observation.id not in (action.preObservationRef, action.postObservationRef)):
        return None
    return source, source_fact


def _unique_refs(refs):
    found = {}
    for ref in refs:
        if ref is not None:
            if isinstance(ref, dict):
                ref = EvidenceRef.model_validate(ref)
            found[(ref.ref, ref.digest)] = ref
    return list(found.values())
