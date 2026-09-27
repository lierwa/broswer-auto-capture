"""Protect explicit completion declarations across Browser-Use public registration."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import ValidationError

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import CompletionReview, _business_result, _review_and_continue, _review_completion
from workflow_use.hybrid.author_tools import AuthorTools
from workflow_use.hybrid.capture_observation import ObservationCapture
from workflow_use.hybrid.evidence import EvidenceRef, NormalizedObservation, TraceSource, digest
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.registry import ActionRegistry


class AuthorCompletionTests(unittest.IsolatedAsyncioTestCase):
    async def test_execution_review_receives_confirmed_mode_without_list_output_proof(self):
        captured = []
        class Model:
            async def ainvoke(self, messages, output_format):
                captured.append(json.loads(messages[1].content))
                return SimpleNamespace(completion=CompletionReview(
                    status='supported', reason='Chosen detail observed from a complete scoped query.'))
        request = SimpleNamespace(task='Choose a matching entry and open it.', requirementText='Open matching entry.',
            entryUrls=['https://example.test/'], input=None, outputSchema={'type': 'null'},
            resultSpec=SimpleNamespace(mode='execution'))
        history = SimpleNamespace(agent_steps=lambda: ['read candidates', 'click', 'done'],
                                  urls=lambda: ['https://example.test/'])
        collector = self._collector()
        review, error = await _review_completion(SimpleNamespace(get_browser_state_summary=self._page_state),
            collector, request, history, Model(), None)
        self.assertIsNone(error)
        self.assertEqual(review.status, 'supported')
        self.assertEqual(captured[0]['resultMode'], 'execution')
        self.assertEqual(captured[0]['outputSchema'], {'type': 'null'})
        self.assertEqual(captured[0]['collectionProofCandidates'], [])
        self.assertEqual(len(collector.observations[-1].facts), 1)

    def setUp(self):
        self.output_model, self.unwrap = output_model_for({'type': 'null'}, 'CompletionOutput')
        self.tools = AuthorTools(output_model=self.output_model)

    def test_initial_and_agent_public_reregistration_have_identical_schema(self):
        initial = ActionRegistry.from_tools(self.tools)
        # Agent.__init__ uses this public hook before creating its action models.
        self.tools.use_structured_output_action(self.output_model)
        rebuilt = ActionRegistry.from_tools(self.tools)
        self.assertEqual(initial.schemaDigest, rebuilt.schemaDigest)
        self.assertIs(self.tools.get_output_model(), self.output_model)

    def test_native_done_root_json_values_are_plain_json_values(self):
        class History:
            def __init__(self, value): self.value = value
            def is_done(self): return True
            def is_successful(self): return True
            def get_structured_output(self, model):
                return model.model_validate_json(json.dumps({'value': self.value}, ensure_ascii=False))

        cases = [
            ({'type': 'array', 'items': {'type': 'object', 'properties': {
                'title': {'type': 'string'}, 'url': {'type': 'string'}},
                'required': ['title', 'url'], 'additionalProperties': False}},
             [{'title': 'First', 'url': 'https://example.test/1'}]),
            ({'type': 'array', 'items': {'type': 'string'}}, ['First', 'Second']),
            ({'type': 'string'}, 'Ready'),
            ({'type': 'null'}, None),
        ]
        for schema, expected in cases:
            with self.subTest(schema=schema):
                model, unwrap = output_model_for(schema, 'RootOutput')
                completed, output, gaps = _business_result(
                    History(expected), False, model, unwrap, schema)
                self.assertTrue(completed)
                self.assertEqual(gaps, [])
                self.assertEqual(output, expected)

    def test_success_and_reason_are_required_and_visible_to_the_model(self):
        model = self.tools.registry.registry.actions['done'].param_model
        schema = model.model_json_schema()
        self.assertEqual(set(schema['required']), {'success', 'reason', 'readRefs'})
        self.assertEqual(schema['properties']['success']['type'], 'boolean')
        self.assertNotIn('default', schema['properties']['success'])
        self.assertNotIn('data', schema['properties'])
        for invalid in ({'reason': 'blocked', 'readRefs': []},
                        {'success': False, 'readRefs': []},
                        {'success': False, 'reason': 'blocked'},
                        {'success': 'false', 'reason': 'blocked', 'readRefs': []},
                        {'success': True, 'reason': 'Observed.', 'readRefs': [], 'data': {'value': None}}):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                model.model_validate(invalid)

    async def test_explicit_failure_preserves_reason_without_business_data(self):
        result = await self.tools.registry.execute_action(
            'done', {'success': False, 'reason': 'The target changed before selection.', 'readRefs': []},
            browser_session=SimpleNamespace(downloaded_files=['existing-download.pdf'], cdp_client=None),
            file_system=SimpleNamespace())
        self.assertTrue(result.is_done)
        self.assertIs(result.success, False)
        self.assertEqual(result.extracted_content, 'The target changed before selection.')
        self.assertIsNone(result.attachments)
        self.assertEqual(result.metadata['batCompletion'], {
            'success': False, 'reason': 'The target changed before selection.'})

    async def test_business_data_keeps_its_original_null_contract(self):
        model = self.tools.registry.registry.actions['done'].param_model
        with self.assertRaises(ValidationError):
            model.model_validate({'success': True, 'reason': 'Observed.', 'readRefs': [],
                                  'data': {'value': 'not-null'}})
        result = await self.tools.registry.execute_action(
            'done', {'success': True, 'reason': 'Observed.', 'readRefs': []},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        business_output = self.output_model.model_validate_json(result.extracted_content)
        self.assertIsNone(self.unwrap(business_output))
        self.assertIs(result.success, True)

    async def test_invalid_read_reference_cannot_end_source(self):
        result = await self.tools.registry.execute_action(
            'done', {'success': True, 'reason': 'Observed.', 'readRefs': ['r999']},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        self.assertEqual(result.error, 'completion_read_reference_invalid')
        self.assertFalse(result.is_done)
        self.assertIsNot(result.success, True)
        self.assertIsNone(result.extracted_content)

    async def test_specific_gap_continues_same_agent_with_cumulative_budget(self):
        class History:
            def __init__(self, steps): self.history = list(range(steps))
            def is_done(self): return True
            def is_successful(self): return True
            def agent_steps(self): return [f'Step {i}' for i in self.history]
            def urls(self): return ['https://example.test/'] * len(self.history)

        class Model:
            def __init__(self): self.calls = []
            async def ainvoke(self, messages, output_format):
                self.calls.append((messages, output_format))
                status = 'investigate' if len(self.calls) == 1 else 'supported'
                return SimpleNamespace(completion=CompletionReview(
                    status=status, reason='One relevant view was not checked.',
                    followUp='Inspect the other visible view.' if status == 'investigate' else None))

        class Agent:
            def __init__(self):
                self.history, self.state, self.follow_ups, self.runs = History(2), SimpleNamespace(n_steps=3), [], []
            def add_new_task(self, task): self.follow_ups.append(task)
            async def run(self, *, max_steps, on_step_end):
                self.runs.append((max_steps, on_step_end))
                self.history, self.state.n_steps = History(4), 5
                return self.history

        browser = SimpleNamespace(get_browser_state_summary=self._page_state)
        request = SimpleNamespace(task='Choose the latest eligible item.', requirementText='Latest eligible item.',
                                  entryUrls=['https://example.test/'], input=None, maxSteps=6)
        agent, model = Agent(), Model()
        callback = lambda _agent: None
        collector = self._collector()
        collector.observations[-1].facts.append(collector.value_fact('media_playback', 'playing'))
        history, approved, gaps, failed = await _review_and_continue(
            agent, browser, collector, request, model, callback)

        self.assertIs(history, agent.history)
        self.assertTrue(approved)
        self.assertFalse(failed)
        self.assertEqual(gaps, [])
        self.assertEqual(agent.runs, [(6, callback)])
        self.assertEqual(len(agent.follow_ups), 1)
        self.assertIn('Inspect the other visible view.', agent.follow_ups[0])
        self.assertEqual(len(model.calls), 2)
        self.assertEqual(json.loads(model.calls[0][0][1].content)['history'], ['Step 0', 'Step 1'])
        self.assertEqual(json.loads(model.calls[0][0][1].content)['observations'][0]['facts'],
                         [{'kind': 'media_playback', 'value': 'playing'}])
        reviews = [fact for fact in collector.observations[-1].facts if fact.kind == 'native_completion_review']
        self.assertEqual([(fact.value['stage'], fact.value['status']) for fact in reviews],
                         [('initial', 'investigate'), ('continuation', 'supported')])
        self.assertEqual(reviews[0].value['followUp'], 'Inspect the other visible view.')
        self.assertEqual(reviews[1].value['collectionActionRefs'], [])
        for fact in reviews:
            self.assertEqual(fact.sourceRefs[0].digest, digest(fact.value))
        # Review decisions are private source facts, not fresh browser evidence fed back to the next review.
        self.assertEqual(json.loads(model.calls[1][0][1].content)['observations'][0]['facts'],
                         [{'kind': 'media_playback', 'value': 'playing'}])
        restored = NormalizedObservation.model_validate_json(collector.observations[-1].model_dump_json())
        self.assertEqual([fact.value for fact in restored.facts if fact.kind == 'native_completion_review'],
                         [fact.value for fact in reviews])

    async def test_concrete_gap_without_two_steps_keeps_source_incomplete(self):
        class Model:
            async def ainvoke(self, _messages, output_format):
                return SimpleNamespace(completion=CompletionReview(
                    status='investigate', reason='Another view may matter.', followUp='Inspect the other view.'))

        history = SimpleNamespace(agent_steps=lambda: ['done'], urls=lambda: ['https://example.test/'])
        agent = SimpleNamespace(history=history, state=SimpleNamespace(n_steps=5),
                                add_new_task=lambda _task: self.fail('no budget for a follow-up'))
        request = SimpleNamespace(task='Find the latest item.', requirementText='Latest item.',
                                  entryUrls=['https://example.test/'], input=None, maxSteps=5)
        result, approved, gaps, failed = await _review_and_continue(
            agent, SimpleNamespace(get_browser_state_summary=self._page_state),
            self._collector(), request, Model(), None)

        self.assertIs(result, history)
        self.assertFalse(approved)
        self.assertFalse(failed)
        self.assertEqual([item.reason for item in gaps], ['completion_review_step_budget_exhausted'])

    async def test_rejected_collection_review_retains_model_and_host_decisions(self):
        review = CompletionReview(status='supported', reason='Selected query covers the list.',
                                  collectionActionRefs=['a-0001'])
        class Model:
            async def ainvoke(self, _messages, output_format):
                return SimpleNamespace(completion=review)
        request = SimpleNamespace(task='Read all pages.', requirementText='Read all pages.',
            entryUrls=['https://example.test/'], input=None, outputSchema={'type': 'array'})
        collector = self._collector()
        history = SimpleNamespace(agent_steps=lambda: ['done'], urls=lambda: ['https://example.test/'])
        with patch('workflow_use.hybrid.author.collection_proof_candidates',
                   return_value=[{'queryActionRefs': ['a-0002']}]):
            effective, reason = await _review_completion(
                SimpleNamespace(get_browser_state_summary=self._page_state), collector, request, history, Model(), [])
        self.assertIsNone(reason)
        self.assertEqual(effective.status, 'investigate')
        self.assertEqual(effective.reason, 'collection_scope_reference_missing')
        decisions = [fact.value for fact in collector.observations[-1].facts]
        self.assertEqual([(item['origin'], item['status']) for item in decisions],
                         [('model', 'supported'), ('host', 'investigate')])
        self.assertEqual(decisions[0]['collectionActionRefs'], ['a-0001'])
        self.assertEqual(decisions[0]['reason'], review.reason)

    async def test_unresolved_continuation_keeps_both_reasons_and_rejects_source(self):
        reviews = iter([
            CompletionReview(status='investigate', reason='Next-page stop is not established.',
                             followUp='Inspect the final continuation control.', collectionActionRefs=['a-0001']),
            CompletionReview(status='unresolved', reason='The continuation condition remains unproven.',
                             collectionActionRefs=['a-0002'])])
        class Model:
            async def ainvoke(self, _messages, output_format):
                return SimpleNamespace(completion=next(reviews))
        history = SimpleNamespace(agent_steps=lambda: ['done'], urls=lambda: ['https://example.test/'],
                                  is_done=lambda: True, is_successful=lambda: True)
        async def run(**_kwargs): return history
        agent = SimpleNamespace(history=history, state=SimpleNamespace(n_steps=2),
                                add_new_task=lambda _task: None, run=run)
        request = SimpleNamespace(task='Read all pages.', requirementText='Read all pages.',
                                  entryUrls=['https://example.test/'], input=None, maxSteps=5)
        collector = self._collector()
        _history, approved, gaps, failed = await _review_and_continue(
            agent, SimpleNamespace(get_browser_state_summary=self._page_state), collector, request, Model(), None)
        self.assertFalse(approved)
        self.assertFalse(failed)
        self.assertEqual([item.reason for item in gaps], ['completion_review_after_continuation_unresolved'])
        facts = [fact.value for fact in collector.observations[-1].facts]
        self.assertEqual([(item['stage'], item['reason'], item['collectionActionRefs']) for item in facts], [
            ('initial', 'Next-page stop is not established.', ['a-0001']),
            ('continuation', 'The continuation condition remains unproven.', ['a-0002'])])

    def test_review_payload_is_bounded(self):
        for value in ({'reason': 'x' * 1001}, {'followUp': 'x' * 1001},
                      {'collectionActionRefs': ['a-0001'] * 33}, {'collectionActionRefs': ['x' * 81]}):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                CompletionReview.model_validate({'status': 'unresolved', 'reason': 'Missing evidence.', **value})

    @staticmethod
    def _collector():
        collector = ObservationCapture()
        collector.put_evidence = lambda _kind, value: EvidenceRef(ref='sha256:' + digest(value), digest=digest(value))
        collector.observations = [NormalizedObservation(id='o-0001', sequence=0, url='https://example.test/',
            tabId='tab-1', facts=[], sourceRefs=[collector.put_evidence('observation', {'url': 'https://example.test/'})])]
        return collector

    @staticmethod
    async def _page_state(*, include_screenshot):
        assert include_screenshot is False
        return SimpleNamespace(url='https://example.test/', title='Example',
                               dom_state=SimpleNamespace(llm_representation=lambda: 'Two visible views'))

    def test_interim_done_and_final_done_keep_distinct_trace_positions(self):
        reference = EvidenceRef(ref='fixture:done', digest='1' * 64)
        registry = ActionRegistry.from_tools(self.tools)
        observations = [NormalizedObservation(id=f'o-{index:04d}', sequence=index - 1,
            url='https://example.test/', tabId='tab-1', facts=[], sourceRefs=[reference])
            for index in range(1, 5)]
        def record(step, pre, post):
            return HistoryRecord(stepIndex=step, actions=[{'done': {
                'success': True, 'reason': 'Observed.', 'readRefs': []}}],
                results=[ResultEvidence(errorPresent=False, is_done=True, success=True, ref=reference)],
                preObservationRef=pre, postObservationRefs={'0': post})
        trace, gaps = normalize_history(HistoryInput(
            source=TraceSource(version=registry.providerVersion, historyRef='fixture:history'),
            completed=True, records=[record(0, 'o-0001', 'o-0002'), record(1, 'o-0003', 'o-0004')],
            observations=observations, finalResultRef=reference, redactionManifestRef=reference), registry)

        self.assertEqual(gaps, [])
        self.assertEqual([(item.id, item.name) for item in trace.actions],
                         [('a-0001', 'done'), ('a-0002', 'done')])
        self.assertTrue(trace.completed)


if __name__ == '__main__':
    unittest.main()
