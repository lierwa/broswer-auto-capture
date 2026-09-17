"""Evidence capture through native Agent callbacks. The Agent remains the sole exploration loop."""
import json
import time
from copy import deepcopy

from browser_use.tools.extraction.views import ExtractionResult
from jsonschema import Draft202012Validator
from .action_identity import history_action_refs, provisional_action_ref, resolve_history_step
from .action_dispatch import dispatch_target, public_action_result
from .browser_context import browser_context_value
from .dom_evidence import (
    attach_query_candidate,
    capture_find_elements_query,
    capture_selector_structure,
    complete_find_elements_query,
    empty_structure,
    safe_url,
)
from .evidence import EvidenceRef, NormalizedObservation, ObservationFact, TraceSource, digest, gap
from .field_read_evidence import FieldReadEvidenceFailure, verified_field_read
from .history import from_agent_history
from .natural_effects import read_page_effect, read_target_state, read_target_value
from .natural_facts import binding_facts
from .natural_output import build_verified_output_assembly
from .normalize import normalize_history
from .post_action_target import (
    callback_target_element,
    capture_target_identity,
    refreshed_target_element,
    target_observation_diagnostic,
    verified_labeled_query,
)
from .postconditions import read_fact
from .semantic import bounded_schema
from .snapshot_consistency import ObservationUrlChanged, capture_consistent_post_snapshot, resolve_closed_target_id
from .summary_evidence import SummaryEvidenceFailure, verified_summary
from .target_scroll import TargetScrollEvidenceFailure, verified_target_scroll
from .visible_wait import VisibleWaitEvidenceFailure, verified_visible_wait

class EvidenceCollector:
    """Use max_actions_per_step=1 and register_new_step_callback / on_step_end on the native Agent.

    put_evidence and redact_action are mandatory product ports. No history screenshots, DOM, prompts,
    credentials or whole-page DOM are serialized by this adapter. Public ActionResult values are
    retained as execution evidence in the controlled source artifact.
    """
    def __init__(self, browser, registry, *, put_evidence, redact_action, input_value=None, input_schema=None,
                 requirement_text='', output_schema=None, sanitize_evidence_value=None, field_read_records=None,
                 target_scroll_records=None, visible_wait_records=None, summary_records=None, dispatch_audit=None):
        self.browser, self.registry = browser, registry
        self.put_evidence, self.redact_action = put_evidence, redact_action
        self.input_value, self.input_schema = input_value, input_schema or {}
        self.requirement_text, self.output_schema = requirement_text, output_schema or {}
        self.sanitize_evidence_value = sanitize_evidence_value
        self.field_read_records = field_read_records
        self.target_scroll_records = target_scroll_records
        self.visible_wait_records = visible_wait_records
        self.summary_records = summary_records
        self.dispatch_audit = dispatch_audit
        self.observations, self.links, self.results = [], {}, {}
        self.source_gaps = []
        self.pending = None

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
                                      self.input_schema, self.requirement_text)]
        selector_index = arguments.get('index')
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
        if self.dispatch_audit is not None:
            self.dispatch_audit.propose(_step, 0, raw,
                dispatch_target(summary, selector_index))
        facts.extend(await self.natural_effect_facts(name, target_element))
        before = await self.observe(summary, facts)
        self.pending = {'action': raw, 'actionId': action_id, 'pre': before.id, 'queryEvidence': query_evidence,
                        'targetRef': structure.targetRef if structure else None,
                        'targetIdentity': target_identity, 'closedTargetId': closed_target_id,
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

    async def after_step(self, agent):
        if self.pending is None:
            if self.dispatch_audit is not None:
                self.dispatch_audit.close()
            return  # A model/observation failure is retained by the history normalizer as a gap.
        step = self.align_pending(agent.history)
        item = agent.history.history[step]
        self.links[(step, 0, 'pre')] = self.pending['pre']
        facts_before_live = []
        if self.pending['queryEvidence'] is not None:
            facts_before_live.append(self.dom_query_fact(
                complete_find_elements_query(self.pending['queryEvidence'], item.result)))
        for index, result in enumerate(item.result):
            value = result.model_dump(mode='json')
            self.results[(step, index)] = self.put_evidence('action-result', value)
        facts_after_live = []
        if 'extract' in self.pending['action']:
            facts_after_live.extend(await self.extract_facts(item.result, step))
        if 'bat_read_fields' in self.pending['action']:
            facts_after_live.extend(self.field_read_facts(item.result, step))
        if 'bat_summarize' in self.pending['action']:
            facts_after_live.extend(self.summary_facts(item.result, step))
        after = await capture_consistent_post_snapshot(self.browser, facts_before_live, facts_after_live,
            self.post_action_facts, self.observe,
            closed_target_id=self.pending.get('closedTargetId'))
        if 'bat_scroll_to' in self.pending['action']:
            after.facts.extend(self.target_scroll_facts(item.result, step, after))
        if 'bat_wait_for' in self.pending['action']:
            after.facts.extend(self.visible_wait_facts(item.result, step, after))
        self.links[(step, 0, 'post')] = after.id
        self.pending = None
        if self.dispatch_audit is not None:
            self.dispatch_audit.close()

    async def extract_facts(self, results, step):
        if len(results) != 1 or results[0].error:
            self.source_gaps.append(gap('invalid_source', [self.pending['actionId']],
                                         'native_extraction_result_unpaired', 'reject_trace'))
            return []
        result, result_ref, facts = results[0], self.results[(step, 0)], []
        structured_claim = (result.metadata or {}).get('structured_extraction') is True
        try:
            facts.append(self.native_extraction_fact(result, result_ref))
        except Exception:
            if structured_claim:
                self.source_gaps.append(gap('invalid_source', [self.pending['actionId']],
                                             'native_extraction_evidence_invalid', 'reject_trace'))
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
                element = await refreshed_target_element(self.browser, summary, identity)
            except Exception as error:
                facts.append(self.value_fact('target_observation_diagnostic', target_observation_diagnostic(self.pending['actionId'], 'refresh', error)))
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
        kind = 'scroll_position' if name == 'scroll' else (
               'visible_overlays' if name in ('click', 'send_keys') else None)
        if kind is not None:
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

    async def observe(self, summary, facts, *, expected_tab_id=None):
        tab_id = expected_tab_id if expected_tab_id is not None else self.browser.agent_focus_target_id
        if self.browser.agent_focus_target_id != tab_id:
            raise ValueError('observation_tab_changed')
        if not tab_id or tab_id not in {tab.target_id for tab in summary.tabs}:
            raise ValueError('observation_tab_identity_unavailable')
        # WHY：summary.title 来自异步 Target 缓存；即时事实用同一 tab 的公开 Page 查询。
        title = await read_fact('title', None, self.browser)
        live_url = await read_fact('url', None, self.browser)
        if self.browser.agent_focus_target_id != tab_id:
            raise ValueError('observation_tab_changed')
        if not isinstance(summary.url, str) or digest(summary.url) != digest(live_url):
            raise ObservationUrlChanged()
        observed_url = safe_url(live_url)
        if observed_url is None:
            raise ValueError('observation_url_unavailable')
        body = {'url': observed_url, 'tabId': str(tab_id), 'titleDigest': digest(title)}
        reference = self.put_evidence('observation', body)
        values = [self.value_fact('browser_context', browser_context_value(summary, tab_id)),
                  self.fact('url', observed_url), self.fact('url_digest', digest(live_url)), self.fact('title', title),
                  self.fact('monotonic_ms', time.monotonic_ns() // 1000000), *facts]
        observation = NormalizedObservation(id=f'o-{len(self.observations) + 1:04d}', sequence=len(self.observations),
                      url=observed_url, tabId=str(tab_id), facts=values, sourceRefs=[reference],
                      documentDigest=digest(summary.dom_state.llm_representation()) if hasattr(summary.dom_state, 'llm_representation') else None)
        self.observations.append(observation)
        return observation

    def fact(self, kind, value):
        reference = self.put_evidence('fact', {'kind': kind, 'value': value})
        return ObservationFact(id='fact-' + reference.digest, kind=kind, value=value, sourceRefs=[reference])

    def value_fact(self, kind, value):
        reference = self.put_evidence(kind.replace('_', '-'), value)
        return ObservationFact(id='fact-' + reference.digest, kind=kind, value=value, sourceRefs=[reference])

    def dom_fact(self, value):
        body = value.model_dump(mode='json')
        reference = self.put_evidence('dom-structure', body)
        return ObservationFact(id='fact-' + reference.digest, kind='dom_structure', value=body,
                               sourceRefs=[reference])

    def dom_query_fact(self, value):
        body = value.model_dump(mode='json')
        reference = self.put_evidence('dom-query', body)
        return ObservationFact(id='fact-' + reference.digest, kind='dom_query', value=body,
                               sourceRefs=[reference])

    def finish(self, history, *, history_ref: str, final_output, redaction_manifest: EvidenceRef,
               source_judged: bool | None = None, source_completed: bool | None = None):
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
            assembly, assembly_gaps = build_verified_output_assembly(
                self.observations, final_output, self.output_schema, self.put_evidence)
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
        judged = history.is_validated() is True if source_judged is None else source_judged
        imported = from_agent_history(history, source=source, judged=judged,
                   redaction_manifest=redaction_manifest, redact_action=self.redact_action, store_result=result_ref,
                   observations=deepcopy(self.observations), observation_links=self.links, final_result_ref=final_ref,
                   put_evidence=self.put_evidence, completed=source_completed,
                   dispatch_audit=self.dispatch_audit)
        trace, gaps = normalize_history(imported, self.registry)
        return trace, sorted([*gaps, *capture_gaps], key=lambda item: item.id)

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


def extraction_value(result, arguments, url):
    """Decode only the pinned upstream result envelope; content still needs independent field proof."""
    metadata = result.metadata or {}
    if metadata.get('structured_extraction') is True:
        extracted = ExtractionResult.model_validate(metadata.get('extraction_result'))
        if extracted.is_partial or extracted.source_url != url:
            raise ValueError('extraction_source_incomplete')
        return extracted.data
    content = result.extracted_content or ''
    prefix = f"<url>\n{url}\n</url>\n<query>\n{arguments.get('query', '')}\n</query>\n<result>\n"
    suffix = '\n</result>'
    if content.startswith(prefix) and content.endswith(suffix):
        return json.loads(content[len(prefix):-len(suffix)])
    # Existing normalized pure JSON sources stay readable; unknown wrappers never get searched/trimmed.
    return json.loads(content)


def target_value(action_ref, target_ref, value, sanitizer):
    safe = sanitizer('value', value) if sanitizer is not None and isinstance(value, str) else value
    return {'actionRef': action_ref, 'targetRef': target_ref, 'value': safe}


def replace_action_identity(value, previous, current):
    if isinstance(value, dict):
        return {key: (current if key in ('actionRef', 'nodeId') and item == previous
                      else replace_action_identity(item, previous, current))
                for key, item in value.items()}
    if isinstance(value, list):
        return [replace_action_identity(item, previous, current) for item in value]
    return value


def schema_reachable(candidate, root):
    if digest(candidate) == digest(root):
        return True
    if not isinstance(root, dict):
        return False
    children = list((root.get('properties') or {}).values()) if isinstance(root.get('properties'), dict) else []
    if isinstance(root.get('items'), dict):
        children.append(root['items'])
    return any(schema_reachable(candidate, child) for child in children if isinstance(child, dict))
