"""Evidence capture through native Agent callbacks. The Agent remains the sole exploration loop."""
from copy import deepcopy

from browser_use.tools.extraction.views import ExtractionResult
from jsonschema import Draft202012Validator

from .action_dispatch import dispatch_target, public_action_result
from .action_identity import history_action_refs, provisional_action_ref, resolve_history_step
from .capture_observation import ObservationCapture
from .capture_values import extraction_value, replace_action_identity, schema_reachable, target_value
from .dom_evidence import (
    CollectionReadRequired,
    attach_query_candidate,
    capture_find_elements_query,
    capture_selector_structure,
    complete_find_elements_query,
    empty_structure,
    unbound_collection_choice,
)
from .dom_reference_tool import sanitized_inspection_result
from .evidence import EvidenceRef, TraceSource, digest, gap
from .field_read_evidence import FieldReadEvidenceFailure, verified_field_read
from .history import from_agent_history
from .host_read_facts import attach_host_read_facts
from .natural_effects import read_page_effect, read_target_state, read_target_value
from .natural_facts import binding_facts
from .natural_reads import NaturalReadFailure, capture_find_elements_read
from .navigation import NAVIGATION_ACTIONS, navigation_tab_ids, reconcile_captured_navigation
from .natural_output import build_verified_output_assembly
from .normalize import normalize_history
from .post_action_target import (
    callback_target_element,
    capture_target_identity,
    refreshed_target_element,
    retained_action_target_element,
    target_observation_diagnostic,
    verified_collection_query,
    verified_labeled_query,
)
from .prior_read_bindings import attach_prior_read_bindings
from .record_projection_snapshot import capture_host_snapshots
from .rendered_field_text import FieldReadError
from .semantic import bounded_schema
from .snapshot_consistency import capture_consistent_post_snapshot, resolve_closed_target_id
from .summary_evidence import SummaryEvidenceFailure, verified_summary
from .target_scroll import TargetScrollEvidenceFailure, verified_target_scroll
from .visible_wait import VisibleWaitEvidenceFailure, verified_visible_wait


class EvidenceCollector(ObservationCapture):
    """Use max_actions_per_step=1 and register_new_step_callback / on_step_end on the native Agent.

    put_evidence and redact_action are mandatory product ports. No history screenshots, DOM, prompts,
    credentials or whole-page DOM are serialized by this adapter. Public ActionResult values are
    retained as execution evidence in the controlled source artifact.
    """
    def __init__(self, browser, registry, *, put_evidence, redact_action, input_value=None, input_schema=None,
                 requirement_text='', output_schema=None, sanitize_evidence_value=None, field_read_records=None,
                 target_scroll_records=None, visible_wait_records=None, summary_records=None, dispatch_audit=None,
                 result_spec=None, entry_urls=()):
        self.browser, self.registry = browser, registry
        self.put_evidence, self.redact_action = put_evidence, redact_action
        self.input_value, self.input_schema = input_value, input_schema or {}
        self.requirement_text, self.output_schema = requirement_text, output_schema or {}
        self.entry_urls = tuple(entry_urls)
        self.result_spec = result_spec
        self.sanitize_evidence_value = sanitize_evidence_value
        self.field_read_records = field_read_records
        self.target_scroll_records = target_scroll_records
        self.visible_wait_records = visible_wait_records
        self.summary_records = summary_records
        self.dispatch_audit = dispatch_audit
        self.observations, self.links, self.results = [], {}, {}
        self.host_read_captures = []
        self.completed_queries = []
        self.source_gaps = []
        self.pending = None
        self.observation_scope = None

    async def before_action(self, summary, model_output, _step):
        if self.pending is not None:
            raise ValueError('unpaired_capture_callback')
        actions = model_output.action
        if len(actions) != 1:
            raise ValueError('single_action_capture_required')
        raw = actions[0].model_dump(exclude_unset=True)
        if len(raw) != 1:
            raise ValueError('single_action_capture_required')
        action_id = provisional_action_ref(_step)
        name, arguments = next(iter(raw.items()))
        closed_target_id = resolve_closed_target_id(summary, raw)
        facts = [] if name == 'bat_summarize' else [self.value_fact('natural_binding', item.model_dump(mode='json'))
            for item in binding_facts(action_id, name, arguments, self.input_value,
                                      self.input_schema, self.requirement_text, self.entry_urls)]
        selector_index = arguments.get('index')
        if self.dispatch_audit is not None:
            self.dispatch_audit.propose(_step, 0, raw, dispatch_target(summary, selector_index))
        if self.observation_scope is not None:
            summary = await self.observation_scope.verify_before_action(summary, _step, selector_index, name)
        structure, target_element, target_identity = None, None, None
        if isinstance(selector_index, int) and not isinstance(selector_index, bool):
            # WHY: 节点图是 mutable 快照；任何页面查询/read completion await 之前先复制。
            structure = capture_selector_structure(summary, action_id, selector_index,
                self.browser.agent_focus_target_id, sanitize_value=self.sanitize_evidence_value)
            try:
                target_identity = capture_target_identity(
                    summary, selector_index, self.browser.agent_focus_target_id)
                target_element = await callback_target_element(
                    self.browser, summary, selector_index, self.browser.agent_focus_target_id)
                query_target = None
                if name == 'click':
                    target_identity, query_target = await verified_collection_query(
                        self.browser, summary, target_identity, self.completed_queries, selector_index)
                if query_target is None:
                    target_identity, query_target = await verified_labeled_query(
                        self.browser, summary, target_identity)
                if query_target is not None:
                    structure = attach_query_candidate(structure, query_target, True)
                    structure.limitations = [item for item in structure.limitations
                                             if item != 'query_candidate_unavailable']
                if name in ('input', 'select_dropdown'):
                    value = await read_target_value(target_element)
                    facts.append(self.fact('target_value', target_value(
                        action_id, structure.targetRef, value, self.sanitize_evidence_value)))
            except CollectionReadRequired:
                raise
            except Exception:
                structure.limitations.append('target_effect_read_failed')
        elif name in ('click', 'input', 'dropdown_options', 'select_dropdown'):
            structure = empty_structure(action_id, summary, self.browser.agent_focus_target_id,
                                        None, 'action_target_index_missing')
        if structure is not None:
            facts.append(self.dom_fact(structure))
        redacted_arguments = None
        if name == 'find_elements':
            redacted_action = self.redact_action(deepcopy(raw))
            if isinstance(redacted_action, dict) and isinstance(redacted_action.get(name), dict):
                redacted_arguments = redacted_action[name]
        query_evidence = capture_find_elements_query(summary, action_id, arguments, redacted_arguments,
                         self.browser.agent_focus_target_id) if name == 'find_elements' else None
        facts.extend(await self.natural_effect_facts(name, target_element))
        before = await self.observe(summary, facts)
        self.pending = {'action': raw, 'actionId': action_id, 'pre': before.id, 'queryEvidence': query_evidence,
                        'navigationTabs': await navigation_tab_ids(self.browser) if name in NAVIGATION_ACTIONS else None,
                        'targetRef': structure.targetRef if structure else None,
                        'targetIdentity': target_identity, 'targetElement': target_element,
                        'closedTargetId': closed_target_id,
                        'sourceUrl': getattr(summary, 'url', None), 'nativeStep': _step, 'actionIndex': 0,
                        'fieldReadStart': (len(self.field_read_records.records)
                                           if name == 'bat_read_fields' and self.field_read_records is not None else None),
                        'targetScrollStart': (len(self.target_scroll_records.records)
                                              if name == 'bat_scroll_to'
                                              and self.target_scroll_records is not None else None),
                        'visibleWaitStart': (len(self.visible_wait_records.records)
                                             if name == 'bat_wait_for'
                                             and self.visible_wait_records is not None else None),
                        'summaryStart': (len(self.summary_records.records)
                                         if name == 'bat_summarize' and self.summary_records is not None else None)}
        if name == 'click' and structure is not None and unbound_collection_choice(structure):
            # WHY：在第一次试做中要求 Agent 补读候选，动作未派发；不能事后把当前序号编成固定 XPath。
            raise CollectionReadRequired()

    async def after_step(self, agent):
        if self.pending is None:
            if self.dispatch_audit is not None:
                self.dispatch_audit.close()
            return  # A model/observation failure is retained by the history normalizer as a gap.
        step = self.align_pending(agent.history)
        item = agent.history.history[step]
        self.links[(step, 0, 'pre')] = self.pending['pre']
        await reconcile_captured_navigation(self, item.result)
        for index, result in enumerate(item.result):
            value = (sanitized_inspection_result(result) if 'bat_inspect_dom' in self.pending['action']
                     else result.model_dump(mode='json'))
            self.results[(step, index)] = self.put_evidence('action-result', value)
        facts_before_live = []
        if self.pending['queryEvidence'] is not None:
            completed_query = complete_find_elements_query(self.pending['queryEvidence'], item.result)
            facts_before_live.append(self.dom_query_fact(completed_query))
            facts_before_live.extend(await self.find_elements_read_facts(completed_query, item.result, step))
        facts_after_live = []
        if 'extract' in self.pending['action']:
            facts_after_live.extend(await self.extract_facts(item.result, step))
        if 'bat_read_fields' in self.pending['action']:
            facts_after_live.extend(self.field_read_facts(item.result, step))
        if 'bat_summarize' in self.pending['action']:
            facts_after_live.extend(self.summary_facts(item.result, step))
        after = await capture_consistent_post_snapshot(self.browser, facts_before_live, facts_after_live,
            self.post_action_facts, self.observe,
            closed_target_id=self.pending.get('closedTargetId'),
            snapshot_reader=self.observation_scope.capture_post if self.observation_scope is not None else None)
        if 'bat_scroll_to' in self.pending['action']:
            after.facts.extend(self.target_scroll_facts(item.result, step, after))
        if 'bat_wait_for' in self.pending['action']:
            after.facts.extend(self.visible_wait_facts(item.result, step, after))
        self.links[(step, 0, 'post')] = after.id
        for capture in self.host_read_captures:
            if capture['actionRef'] == self.pending['actionId'] and capture['postObservationRef'] is None:
                capture['postObservationRef'] = after.id
        self.pending = None
        if self.dispatch_audit is not None:
            self.dispatch_audit.close()

    async def find_elements_read_facts(self, query, results, step):
        if query.complete is not True or len(results) != 1 or results[0].error:
            return []
        try:
            result_ref = self.results[(step, 0)]
            verified = await capture_find_elements_read(self.browser, query, {
                'targetId': self.browser.agent_focus_target_id,
                'url': self.pending['sourceUrl'],
            }, result_ref.digest, self.pending['actionId'])
        except NaturalReadFailure as error:
            self.source_gaps.append(gap('missing_effect_proof', [self.pending['actionId']],
                                         error.reason, 'collect_evidence'))
            return []
        except FieldReadError as error:
            # WHY：保留适配器自己的错误码，区分隐藏文本、集合漂移与字段缺失；不持久化页面值。
            self.source_gaps.append(gap('missing_effect_proof', [self.pending['actionId']],
                                         str(error), 'collect_evidence'))
            return []
        except Exception:
            self.source_gaps.append(gap('missing_effect_proof', [self.pending['actionId']],
                                         'find_elements_read_evidence_missing', 'collect_evidence'))
            return []
        self.completed_queries.append((query, verified))
        return [self.value_fact('verified_natural_read', verified.model_dump(mode='json'))]

    async def extract_facts(self, results, step):
        if len(results) != 1 or results[0].error:
            self.source_gaps.append(gap('invalid_source', [self.pending['actionId']],
                                         'native_extraction_result_unpaired', 'reject_trace'))
            return []
        result, result_ref, facts = results[0], self.results[(step, 0)], []
        structured_claim = (result.metadata or {}).get('structured_extraction') is True
        try:
            native = self.native_extraction_fact(result, result_ref)
            facts.append(native)
        except Exception:
            if structured_claim and not facts:
                self.source_gaps.append(gap('invalid_source', [self.pending['actionId']],
                                             'native_extraction_evidence_invalid', 'reject_trace'))
        try:
            snapshots = await capture_host_snapshots(self.browser)
            self.host_read_captures.append({
                'actionRef': self.pending['actionId'], 'resultDigest': result_ref.digest,
                'snapshots': snapshots, 'postObservationRef': None,
            })
        except Exception:
            pass
        return facts

    def field_read_facts(self, results, step):
        try:
            verified = verified_field_read(
                records=self.field_read_records,
                start=self.pending.get('fieldReadStart'),
                arguments=self.pending['action']['bat_read_fields'],
                results=results,
                result_ref=self.results.get((step, 0)),
                action_ref=self.pending['actionId'],
            )
        except FieldReadEvidenceFailure as error:
            self.source_gaps.append(gap(error.kind, [self.pending['actionId']], error.reason, error.resolution))
            return []
        if verified is None:
            return []
        return [self.value_fact('verified_natural_read', verified.model_dump(mode='json'))]

    def summary_facts(self, results, step):
        try:
            verified = verified_summary(records=self.summary_records, start=self.pending.get('summaryStart'),
                arguments=self.pending['action']['bat_summarize'], results=results,
                result_ref=self.results.get((step, 0)), action_ref=self.pending['actionId'])
        except SummaryEvidenceFailure as error:
            self.source_gaps.append(gap('invalid_source', [self.pending['actionId']], error.reason, 'reject_trace'))
            return []
        return [] if verified is None else [self.value_fact(
            'verified_natural_summary', verified.model_dump(mode='json'))]

    def target_scroll_facts(self, results, step, post):
        pre = next((item for item in self.observations if item.id == self.pending['pre']), None)
        try:
            verified = verified_target_scroll(
                records=self.target_scroll_records,
                start=self.pending.get('targetScrollStart'),
                arguments=self.pending['action']['bat_scroll_to'],
                results=results,
                result_ref=self.results.get((step, 0)),
                action_ref=self.pending['actionId'],
                pre=pre,
                post=post,
            )
        except TargetScrollEvidenceFailure as error:
            self.source_gaps.append(gap('invalid_source', [self.pending['actionId']], error.reason, 'reject_trace'))
            return []
        if verified is None:
            return []
        return [self.value_fact('verified_target_scroll', verified.model_dump(mode='json'))]

    def visible_wait_facts(self, results, step, post):
        pre = next((item for item in self.observations if item.id == self.pending['pre']), None)
        try:
            verified = verified_visible_wait(
                records=self.visible_wait_records,
                start=self.pending.get('visibleWaitStart'),
                arguments=self.pending['action']['bat_wait_for'],
                results=results,
                result_ref=self.results.get((step, 0)),
                action_ref=self.pending['actionId'],
                pre=pre,
                post=post,
            )
        except VisibleWaitEvidenceFailure as error:
            self.source_gaps.append(gap('invalid_source', [self.pending['actionId']], str(error), 'reject_trace'))
            return []
        if verified is None:
            return []
        return [self.value_fact('verified_visible_wait', verified.model_dump(mode='json'))]

    async def post_action_facts(self, summary):
        name, arguments = next(iter(self.pending['action'].items()))
        facts = []
        if name == 'navigate' and isinstance(arguments.get('url'), str):
            try:
                page = await self.browser.get_current_page()
                matched = page is not None and await page.get_url() == arguments['url']
                facts.append(self.fact('natural_postcondition', {'actionRef': self.pending['actionId'],
                    'kind': 'url', 'bindingArgument': 'url', 'matched': matched}))
            except Exception:
                pass
        identity, element = self.pending.get('targetIdentity'), None
        if identity is not None:
            try:
                element = await retained_action_target_element(
                    self.browser, summary, identity, self.pending.get('targetElement'))
            except Exception:
                try:
                    element = await refreshed_target_element(self.browser, summary, identity)
                except Exception as error:
                    facts.append(self.value_fact('target_observation_diagnostic', target_observation_diagnostic(
                        self.pending['actionId'], 'refresh', error)))
        if element is not None and name in ('input', 'select_dropdown'):
            try:
                value = await read_target_value(element)
                facts.append(self.fact('target_value', target_value(self.pending['actionId'],
                    self.pending['targetRef'], value, self.sanitize_evidence_value)))
            except Exception as error:
                facts.append(self.value_fact('target_observation_diagnostic', target_observation_diagnostic(self.pending['actionId'], 'value', error)))
        facts.extend(await self.natural_effect_facts(name, element, diagnose=True))
        return facts

    async def natural_effect_facts(self, name, element, diagnose=False):
        facts = []
        if element is not None:
            try:
                facts.append(self.fact('target_state', await read_target_state(element)))
            except Exception as error:
                if diagnose:
                    facts.append(self.value_fact('target_observation_diagnostic', target_observation_diagnostic(self.pending['actionId'], 'state', error)))
        kinds = (['scroll_position'] if name == 'scroll' else
                 ['visible_overlays'] if name == 'send_keys' else
                 ['media_playback', 'visible_overlays'] if name == 'click' else
                 ['media_playback'] if name == 'wait' else [])
        for kind in kinds:
            try:
                page = await self.browser.get_current_page()
                if page is not None:
                    facts.append(self.fact(kind, await read_page_effect(kind, page)))
            except Exception:
                pass
        return facts

    def native_extraction_fact(self, result, result_ref):
        arguments = self.pending['action']['extract']
        metadata = result.metadata or {}
        extracted = ExtractionResult.model_validate(metadata.get('extraction_result')) \
            if metadata.get('structured_extraction') is True else None
        schema = extracted.schema_used if extracted is not None else None
        if not isinstance(schema, dict) or not bounded_schema(schema) or not schema_reachable(schema, self.output_schema):
            raise ValueError('native_extraction_schema_unproven')
        value = extraction_value(result, arguments, self.pending['sourceUrl'])
        Draft202012Validator(schema).validate(value)
        body = {'actionRef': self.pending['actionId'], 'outputSchemaDigest': digest(schema),
                'resultDigest': result_ref.digest, 'output': value}
        return self.value_fact('native_extraction', body)

    def finish(self, history, *, history_ref: str, final_output, redaction_manifest: EvidenceRef,
               source_completed: bool | None = None):
        capture_gaps = []
        if self.pending is not None:
            pending_refs = []
            try:
                step = self.align_pending(history)
                pending_refs = [self.pending['actionId']]
                if self.pending['pre'] is not None:
                    self.links[(step, 0, 'pre')] = self.pending['pre']
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
        if completed and final_output is not None:
            final_output = self.attach_host_reads(final_output)
            attach_prior_read_bindings(self, history)
            assembly, assembly_gaps = build_verified_output_assembly(
                self.observations, final_output, self.output_schema, self.put_evidence,
                input_value=self.input_value, input_schema=self.input_schema,
                requirement_text=self.requirement_text, result_spec=self.result_spec)
            capture_gaps.extend(assembly_gaps)
            destination = self.done_post_observation(history)
            if assembly is not None and destination is not None:
                destination.facts.append(assembly)
            elif assembly is not None:
                capture_gaps.append(gap('missing_observation', [],
                                         'natural_output_done_observation_missing', 'collect_evidence'))
        final_ref = self.put_evidence('business-result', final_output)
        source = TraceSource(version=self.registry.providerVersion, historyRef=history_ref)
        def result_ref(step, index, result):
            reference = self.results.get((step, index))
            if reference is None:
                reference = self.put_evidence('unobserved-result', public_action_result(result))
            return reference
        imported = from_agent_history(history, source=source,
                   redaction_manifest=redaction_manifest, redact_action=self.redact_action, store_result=result_ref,
                   observations=deepcopy(self.observations), observation_links=self.links, final_result_ref=final_ref,
                   put_evidence=self.put_evidence, completed=source_completed,
                   dispatch_audit=self.dispatch_audit)
        if self.observation_scope is not None:
            self.observation_scope.attach(imported, history)
        trace, gaps = normalize_history(imported, self.registry)
        return trace, sorted([*gaps, *capture_gaps], key=lambda item: item.id), final_output

    def attach_host_reads(self, final_output):
        """Attach one or more mappings emitted by a uniquely proven same-page read."""
        return attach_host_read_facts(self, final_output)

    def align_pending(self, history):
        """Bind one callback to its native history position before publishing its facts."""
        step = resolve_history_step(history, self.pending['nativeStep'])
        action_index = self.pending['actionIndex']
        item = history.history[step]
        actions = item.model_output.action if item.model_output else []
        if len(actions) != 1 or action_index >= len(actions):
            raise ValueError('captured_action_missing')
        if actions[action_index].model_dump(exclude_unset=True) != self.pending['action']:
            raise ValueError('captured_action_mismatch')
        action_ref = history_action_refs(history)[(step, action_index)]
        self.rebase_pending_action(self.pending['actionId'], action_ref)
        return step

    def rebase_pending_action(self, previous, current):
        if previous == current:
            return
        observation = next((item for item in self.observations if item.id == self.pending['pre']), None)
        if observation is None:
            raise ValueError('captured_pre_observation_missing')
        observation.facts = [self.rebase_fact(item, previous, current) for item in observation.facts]
        query = self.pending.get('queryEvidence')
        if query is not None and query.actionRef == previous:
            self.pending['queryEvidence'] = query.model_copy(update={'actionRef': current})
        self.pending['actionId'] = current

    def rebase_fact(self, fact, previous, current):
        value = replace_action_identity(fact.value, previous, current)
        if value == fact.value:
            return fact
        direct = {'dom_structure', 'dom_query', 'natural_binding', 'native_extraction',
                  'verified_natural_read', 'verified_natural_summary', 'verified_output_assembly'}
        return self.value_fact(fact.kind, value) if fact.kind in direct else self.fact(fact.kind, value)

    def strip_pending_action_facts(self):
        observation = next((item for item in self.observations if item.id == self.pending['pre']), None)
        if observation is None:
            return
        previous = self.pending['actionId']
        observation.facts = [fact for fact in observation.facts
                             if replace_action_identity(fact.value, previous, None) == fact.value]

    def done_post_observation(self, history):
        for step in range(len(history.history) - 1, -1, -1):
            item = history.history[step]
            actions = item.model_output.action if item.model_output else []
            if len(actions) != 1 or 'done' not in actions[0].model_dump(exclude_unset=True):
                continue
            reference = self.links.get((step, 0, 'post'))
            return next((observation for observation in self.observations if observation.id == reference), None)
        return None
