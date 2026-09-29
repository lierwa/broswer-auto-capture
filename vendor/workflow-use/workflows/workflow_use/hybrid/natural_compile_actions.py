"""One action classifier shared by preparation prefixes and final compilation."""
from .action_dispatch import not_dispatched_coverage
from .causal import delayed_post_for_conditions, supporting_wait, waits_owned_by_next_target
from .coverage import selection_validation_coverage
from .evidence import ActionCoverage, gap
from .natural_compile import (classify_natural_action, delayed_natural_post,
    failed_bat_field_read_coverage, observation_only_coverage, valid_native_action)
from .natural_media_compile import bind_recorded_playback
from .natural_readiness import NATURAL_SETTLE, consumer_readiness_by_action
from .natural_repeat import repeat_context, repeat_sample_coverage
from .natural_selection import bind_selection_function
from .visible_wait_compile import failed_visible_wait_coverage


def classify_natural_prefix(request, registry, source_gaps=(), *, output_schema=None, dependencies=None):
    trace, issues, segments, ledger = request.trace, list(source_gaps), [], []
    repeat, repeat_issues = repeat_context(request)
    issues.extend(repeat_issues)
    repeat_advances = {row['advanceActionRef'] for row in repeat['value']['iterations']} if repeat else set()
    output_paths, wait_owners = [], {}
    if request.actionRegistryVersion != registry.schemaDigest or trace.source.version != registry.providerVersion:
        issues.append(gap('invalid_source', [], 'registry_version_mismatch', 'reject_trace'))
    observations = {item.id: item for item in trace.observations}
    consumer_readiness = consumer_readiness_by_action(trace, NATURAL_SETTLE)
    for action in trace.actions:
        if repeat and action.id in repeat['probeRefs'] and valid_native_action(registry, action):
            ledger.append(repeat_sample_coverage(repeat, action))
            continue
        not_dispatched = not_dispatched_coverage(trace, action) if valid_native_action(registry, action) else None
        if not_dispatched is not None:
            ledger.append(not_dispatched)
            continue
        validation = selection_validation_coverage(registry, action)
        if validation is not None:
            ledger.append(validation)
            continue
        failed_read = failed_bat_field_read_coverage(registry, action)
        if failed_read is not None:
            ledger.append(failed_read)
            continue
        failed_wait = failed_visible_wait_coverage(
            registry, action, observations.get(action.postObservationRef))
        if failed_wait is not None:
            ledger.append(failed_wait)
            continue
        if action.id in wait_owners:
            ledger.append(ActionCoverage(actionRef=action.id, disposition='supporting',
                ownerSegmentId=wait_owners[action.id], exclusionRule='bounded_postcondition_wait/v1',
                evidenceRefs=[action.resultRef] if action.resultRef else []))
            continue
        # WHY：done 没有浏览器副作用；合法引用纠错须留审计，不能变成浏览器编译失败。
        if action.name == 'done' and action.status in ('succeeded', 'failed') and valid_native_action(registry, action):
            ledger.append(ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
                exclusionRule='agent_done_metadata/v1', evidenceRefs=[action.resultRef] if action.resultRef else []))
            continue
        owner = segments[-1] if segments and ledger and ledger[-1].ownerSegmentId == segments[-1]['id'] else None
        support = supporting_wait(request, registry, action, owner)
        if support is not None:
            ledger.append(support)
            continue
        pre, post = observations.get(action.preObservationRef), observations.get(action.postObservationRef)
        observation_only = observation_only_coverage(request, registry, action, pre, post, output_schema)
        if observation_only is not None:
            ledger.append(observation_only)
            continue
        delayed, waits = delayed_natural_post(trace, registry, action, pre)
        if delayed is not None:
            post = delayed
        segment, path, action_issues = classify_natural_action(
            request, registry, action, pre, post, output_schema, output_paths, segments,
            consumer_readiness.get(action.id), dependencies=dependencies)
        issues.extend(action_issues)
        if segment is not None:
            inserted, segment, selection_issues = ([], segment, []) if action.id in repeat_advances else \
                bind_selection_function(request, action, segments, segment)
            issues.extend(selection_issues)
            if segment is not None:
                segments.extend(inserted)
                segments.append(segment)
                for wait in waits:
                    wait_owners[wait.id] = segment['id']
                    before, after = observations[wait.preObservationRef], observations[wait.postObservationRef]
                    segment['proofRefs'].extend(ref.model_dump(mode='json') for ref in
                                                [wait.resultRef, *before.sourceRefs, *after.sourceRefs])
        if path is not None:
            if action.name in ('extract', 'bat_read_fields'):
                output_paths.extend(path)
            else:
                output_paths.append(path)
        ledger.append(ActionCoverage(actionRef=action.id, disposition='compiled' if segment else 'not_compilable',
            ownerSegmentId=segment['id'] if segment else None, exclusionRule=None,
            evidenceRefs=[action.resultRef] if action.resultRef else []))
    waits = waits_owned_by_next_target(request, registry, segments)
    if waits:
        ledger = [waits.get(item.actionRef, item) for item in ledger]
        issues = [item for item in issues if not (
            len(item.actionRefs) == 1 and item.actionRefs[0] in waits
            and item.reason == 'natural_postcondition_evidence_missing')]
    issues.extend(bind_recorded_playback(trace, registry, segments))
    return segments, ledger, issues, repeat
