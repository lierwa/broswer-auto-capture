"""Capture snapshots share final normalization without terminating the live collector."""
from copy import copy, deepcopy

from .action_dispatch import public_action_result
from .evidence import EvidenceRef, TraceSource, gap
from .history import from_agent_history
from .natural_output import build_verified_output_assembly
from .normalize import normalize_history
from .prior_read_bindings import attach_prior_read_bindings
from .navigation import NAVIGATION_ACTIONS, navigation_tab_ids


class CaptureSnapshots:
    async def pending_action(self, raw, action_id, before, query_evidence, model_output, step, index,
                             structure, identity, element, closed_target_id, summary):
        name = next(iter(raw))
        return {'action': raw, 'actionId': action_id, 'pre': before.id, 'queryEvidence': query_evidence,
                'intent': str(getattr(model_output, 'next_goal', '') or '')[:4000],
                'navigationTabs': await navigation_tab_ids(self.browser) if name in NAVIGATION_ACTIONS else None,
                'targetRef': structure.targetRef if structure else None,
                'targetIdentity': identity, 'targetElement': element, 'closedTargetId': closed_target_id,
                'sourceUrl': getattr(summary, 'url', None), 'nativeStep': step, 'actionIndex': index,
                'fieldReadStart': len(self.field_read_records.records)
                    if name == 'bat_read_fields' and self.field_read_records is not None else None,
                'targetScrollStart': len(self.target_scroll_records.records)
                    if name == 'bat_scroll_to' and self.target_scroll_records is not None else None,
                'visibleWaitStart': len(self.visible_wait_records.records)
                    if name == 'bat_wait_for' and self.visible_wait_records is not None else None,
                'summaryStart': len(self.summary_records.records)
                    if name == 'bat_summarize' and self.summary_records is not None else None}

    def retain_history_evidence(self, history, *, history_ref, redaction_manifest):
        if self.pending is not None:
            raise ValueError('prefix_capture_incomplete')
        # WHY：原生无动作错误也有观察；在下一次采集分配 o-id 前归档，避免重算时移动旧观察身份。
        self._normalized_source(history, history_ref, redaction_manifest, None, False, retain=True)

    def snapshot(self, history, *, history_ref, redaction_manifest):
        if self.pending is not None:
            raise ValueError('prefix_capture_incomplete')
        # WHY：附加先前读取来源只作用于副本；现场 collector、原生 history 和旧快照均不改写。
        view = copy(self)
        view.observations, view.links = deepcopy(self.observations), dict(self.links)
        attach_prior_read_bindings(view, history)
        trace, gaps = view._normalized_source(history, history_ref, redaction_manifest, None, False)
        return trace, sorted([*gaps, *self.source_gaps], key=lambda item: item.id)

    def finish(self, history, *, history_ref: str, final_output, redaction_manifest: EvidenceRef,
               source_completed: bool | None = None):
        capture_gaps = []
        if self.pending is not None:
            pending_refs = []
            try:
                step = self.align_pending(history)
                pending_refs = [self.pending['actionId']]
                if self.pending['pre'] is not None:
                    self.links[(step, self.pending['actionIndex'], 'pre')] = self.pending['pre']
            except ValueError:
                self.strip_pending_action_facts()
                capture_gaps.append(gap('invalid_source', [],
                                         'capture_callback_identity_unavailable', 'reject_trace'))
            capture_gaps.append(gap('invalid_source', pending_refs,
                                     'capture_callback_incomplete', 'reject_trace'))
            self.pending = None
        capture_gaps = [*self.source_gaps, *capture_gaps]
        completed = ((history.is_done() is True and history.is_successful() is True)
                     if source_completed is None else source_completed)
        # WHY：动作绑定与是否返回业务字段无关；最终来源必须保留在线快照中同一条绑定。
        if completed:
            attach_prior_read_bindings(self, history)
        if completed and final_output is not None:
            assembly, assembly_gaps = build_verified_output_assembly(
                self.observations, final_output, self.output_schema, self.put_evidence,
                input_value=self.input_value, input_schema=self.input_schema,
                requirement_text=self.requirement_text, result_spec=self.result_spec,
                selected_read_refs=getattr(self.field_read_records, 'selected_refs', ()))
            capture_gaps.extend(assembly_gaps)
            destination = self.done_post_observation(history)
            if assembly is not None and destination is not None:
                destination.facts.append(assembly)
            elif assembly is not None:
                capture_gaps.append(gap('missing_observation', [],
                                         'natural_output_done_observation_missing', 'collect_evidence'))
        final_ref = self.put_evidence('business-result', final_output)
        trace, gaps = self._normalized_source(history, history_ref, redaction_manifest,
                                              final_ref, source_completed)
        return trace, sorted([*gaps, *capture_gaps], key=lambda item: item.id), final_output

    def _normalized_source(self, history, history_ref, redaction_manifest, final_ref, source_completed, *, retain=False):
        source = TraceSource(version=self.registry.providerVersion, historyRef=history_ref)
        def result_ref(step, index, result):
            reference = self.results.get((step, index))
            if reference is None:
                reference = self.put_evidence('unobserved-result', public_action_result(result))
            return reference
        imported = from_agent_history(history, source=source,
                   redaction_manifest=redaction_manifest, redact_action=self.redact_action, store_result=result_ref,
                   observations=self.observations if retain else deepcopy(self.observations),
                   observation_links=self.links if retain else dict(self.links), final_result_ref=final_ref,
                   put_evidence=self.put_evidence, completed=source_completed,
                   dispatch_audit=self.dispatch_audit)
        if self.observation_scope is not None:
            self.observation_scope.attach(imported, history)
        trace, gaps = normalize_history(imported, self.registry)
        return trace, gaps
