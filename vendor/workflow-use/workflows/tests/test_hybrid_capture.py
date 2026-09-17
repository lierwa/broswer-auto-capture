"""Native callback evidence boundaries: real action models/results, in-memory browser ports."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.agent.views import ActionResult
from browser_use.tools.service import Tools

from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.evidence import EvidenceRef, NormalizedTrace, digest
from workflow_use.hybrid.natural_effects import OVERLAY_SELECTOR
from workflow_use.hybrid.registry import ActionRegistry


class CaptureTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.registry = ActionRegistry.from_tools(Tools())
        self.stored = []
        self.summary = SimpleNamespace(url='https://fixture.invalid/', title='Fixture',
                       tabs=[SimpleNamespace(target_id='actual-tab')], dom_state=SimpleNamespace(selector_map={}),
                       screenshot='NEVER_STORE_SCREENSHOT', raw_dom='NEVER_STORE_DOM')
        self.browser = SimpleNamespace(agent_focus_target_id='actual-tab',
                       get_current_page=AsyncMock(return_value=SimpleNamespace(
                           get_title=AsyncMock(side_effect=lambda: self.summary.title),
                           get_url=AsyncMock(side_effect=lambda: self.summary.url),
                           get_target_info=AsyncMock(return_value={'targetId': 'actual-tab'}))),
                       get_browser_state_summary=AsyncMock(return_value=self.summary))
        def put(kind, value):
            self.stored.append((kind, value))
            return EvidenceRef(ref=f'fixture:{kind}:{len(self.stored)}', digest=digest(value))
        self.collector = EvidenceCollector(self.browser, self.registry, put_evidence=put, redact_action=lambda value: value)

    async def test_single_native_action_preserves_pre_post_and_real_tab(self):
        action = self.registry.validate_action('navigate', {'url': 'https://fixture.invalid/next', 'new_tab': False})
        output = SimpleNamespace(action=[action])
        await self.collector.before_action(self.summary, output, 1)
        self.summary.url = 'https://fixture.invalid/next'
        history = SimpleNamespace(history=[SimpleNamespace(model_output=output, result=[ActionResult(extracted_content='navigated')])],
                                  is_done=lambda: True, is_successful=lambda: True, is_validated=lambda: True)
        await self.collector.after_step(SimpleNamespace(history=history))
        trace, gaps = self.collector.finish(history, history_ref='fixture:history', final_output=None,
                                           redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64))
        self.assertFalse(gaps)
        self.assertEqual(trace.actions[0].preObservationRef, 'o-0001')
        self.assertEqual(trace.actions[0].postObservationRef, 'o-0002')
        self.assertEqual([item.tabId for item in trace.observations], ['actual-tab', 'actual-tab'])
        self.assertNotIn('NEVER_STORE', str(self.stored))
        self.assertTrue(trace.judged)

    async def test_multi_action_rejected_instead_of_fabricating_post_observation(self):
        action = self.registry.validate_action('wait', {'seconds': 1})
        with self.assertRaisesRegex(ValueError, 'single_action_capture_required'):
            await self.collector.before_action(self.summary, SimpleNamespace(action=[action, action]), 1)
        self.assertEqual(self.collector.observations, [])

    async def test_incomplete_callback_returns_trace_and_gap_without_inventing_result(self):
        target = SimpleNamespace(node_name='button', xpath='html/body/button', node_id=1, backend_node_id=2,
            attributes={'role': 'button'}, frame_id=None, target_id='actual-tab', parent_node=None,
            children_nodes=[])
        self.summary.dom_state.selector_map = {47: target}
        action = self.registry.validate_action('click', {'index': 47})
        output = SimpleNamespace(action=[action])
        await self.collector.before_action(self.summary, output, 1)
        history = SimpleNamespace(history=[SimpleNamespace(model_output=output, result=[])],
            is_done=lambda: False, is_successful=lambda: False, is_validated=lambda: False)

        trace, gaps = self.collector.finish(history, history_ref='fixture:incomplete', final_output=None,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64))

        self.assertEqual(trace.actions[0].status, 'proposed')
        self.assertIn('capture_callback_incomplete', [item.reason for item in gaps])
        structure = next(fact for fact in trace.observations[0].facts if fact.kind == 'dom_structure')
        self.assertEqual(structure.value['actionRef'], 'a-0001')
        self.assertEqual(structure.sourceRefs[0].digest, digest(structure.value))

    async def test_structure_is_copied_without_a_preset_target_query(self):
        root = SimpleNamespace(node_name='body', xpath='html/body', node_id=1, backend_node_id=101,
            attributes={}, frame_id=None, target_id='actual-tab', parent_node=None, children_nodes=[])
        target = SimpleNamespace(node_name='button', xpath='html/body/button[1]', node_id=2,
            backend_node_id=102, attributes={'id': 'original-secret'}, frame_id=None,
            target_id='actual-tab', parent_node=root, children_nodes=[])
        root.children_nodes = [target]
        self.summary.dom_state.selector_map = {47: target}
        query = AsyncMock(side_effect=AssertionError('preset_target_query_forbidden'))
        self.browser.get_current_page = AsyncMock(return_value=SimpleNamespace(
            get_elements_by_css_selector=query,
            get_title=AsyncMock(return_value='Fixture'), get_url=AsyncMock(return_value=self.summary.url),
            get_target_info=AsyncMock(return_value={'targetId': 'actual-tab'})))
        action = self.registry.validate_action('click', {'index': 47})

        await self.collector.before_action(self.summary, SimpleNamespace(action=[action]), 1)

        fact = next(item for item in self.collector.observations[0].facts if item.kind == 'dom_structure')
        selected = next(item for item in fact.value['nodes'] if item['id'] == fact.value['targetRef'])
        self.assertEqual(selected['xpath'], 'html/body/button[1]')
        self.assertIsNone(fact.value['queryCandidate'])
        self.assertIn('query_candidate_unavailable', fact.value['limitations'])
        self.assertEqual([item.args[0] for item in query.await_args_list], ['html', OVERLAY_SELECTOR])

    async def test_incomplete_repeated_action_links_only_its_callback_position(self):
        action = self.registry.validate_action('wait', {'seconds': 1})
        output = SimpleNamespace(action=[action])
        history = SimpleNamespace(history=[], is_done=lambda: False, is_successful=lambda: False,
                                  is_validated=lambda: False)
        await self.collector.before_action(self.summary, output, 1)
        history.history.append(SimpleNamespace(model_output=output, result=[ActionResult()]))
        await self.collector.after_step(SimpleNamespace(history=history))
        await self.collector.before_action(self.summary, output, 2)
        history.history.append(SimpleNamespace(model_output=output, result=[]))

        trace, gaps = self.collector.finish(history, history_ref='fixture:repeated', final_output=None,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64))

        self.assertEqual([item.status for item in trace.actions], ['succeeded', 'proposed'])
        self.assertEqual(trace.actions[0].preObservationRef, 'o-0001')
        self.assertEqual(trace.actions[0].postObservationRef, 'o-0002')
        self.assertEqual(trace.actions[1].preObservationRef, 'o-0003')
        self.assertIn('capture_callback_incomplete', [item.reason for item in gaps])

    async def test_title_uses_live_page_and_rejects_a_tab_change_during_read(self):
        page = await self.browser.get_current_page()
        page.get_title = AsyncMock(return_value='Saved')
        observed = await self.collector.observe(self.summary, [])
        self.assertEqual(next(f.value for f in observed.facts if f.kind == 'title'), 'Saved')
        self.assertEqual(self.summary.title, 'Fixture')
        async def switched():
            self.browser.agent_focus_target_id = 'other-tab'
            return 'Saved'
        page.get_title = switched
        with self.assertRaisesRegex(ValueError, 'observation_tab_changed'):
            await self.collector.observe(self.summary, [])
        self.assertEqual(len(self.collector.observations), 1)

    async def test_redaction_cannot_drop_or_rename_actions(self):
        action = self.registry.validate_action('navigate', {'url': 'https://fixture.invalid/next'})
        output = SimpleNamespace(action=[action])
        await self.collector.before_action(self.summary, output, 1)
        history = SimpleNamespace(history=[SimpleNamespace(model_output=output, result=[ActionResult()])],
                                  is_done=lambda: True, is_successful=lambda: True, is_validated=lambda: True)
        await self.collector.after_step(SimpleNamespace(history=history))
        self.collector.redact_action = lambda value: value.clear() or {}
        with self.assertRaisesRegex(ValueError, 'invalid_redacted_action'):
            self.collector.finish(history, history_ref='fixture:history', final_output=None,
                                  redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64))

    async def test_find_elements_query_preserves_executable_selector_and_public_result(self):
        selector = '[data-marker="fixture-only"]'
        action = self.registry.validate_action('find_elements', {
            'selector': selector, 'max_results': 10, 'include_text': False, 'attributes': ['href']})
        output = SimpleNamespace(action=[action])
        await self.collector.before_action(self.summary, output, 1)
        result = ActionResult(long_term_memory=f'Found 1 element matching "{selector}".')
        history = SimpleNamespace(history=[SimpleNamespace(model_output=output, result=[result])],
                                  is_done=lambda: True, is_successful=lambda: True, is_validated=lambda: True)
        await self.collector.after_step(SimpleNamespace(history=history))

        trace, _ = self.collector.finish(history, history_ref='fixture:history', final_output=None,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64))

        fact = next(fact for observation in trace.observations for fact in observation.facts
                    if fact.kind == 'dom_query')
        self.assertEqual(fact.value['query']['value'], selector)
        self.assertTrue(fact.value['complete'])
        self.assertNotIn('query_selector_redacted', fact.value['limitations'])
        self.assertIn(selector, str(trace.model_dump(mode='json')))
        self.assertIn(selector, str(self.stored))

    async def test_native_extraction_uses_live_source_url_and_direct_fact_digest(self):
        schema = {'type': 'object', 'properties': {'value': {'type': 'string', 'maxLength': 20}},
                  'required': ['value'], 'additionalProperties': False}
        self.summary.url = 'https://fixture.invalid/list?filter=live'
        collector = EvidenceCollector(self.browser, self.registry, put_evidence=self.collector.put_evidence,
            redact_action=lambda value: value, output_schema=schema)
        action = self.registry.validate_action('extract', {'query': 'Read the bounded value'})
        output = SimpleNamespace(action=[action])
        await collector.before_action(self.summary, output, 1)
        result = ActionResult(metadata={'structured_extraction': True, 'extraction_result': {
            'data': {'value': 'fixture'}, 'schema_used': schema,
            'source_url': self.summary.url, 'is_partial': False}})
        history = SimpleNamespace(history=[SimpleNamespace(model_output=output, result=[result])],
            is_done=lambda: True, is_successful=lambda: True, is_validated=lambda: True)

        await collector.after_step(SimpleNamespace(history=history))
        trace, gaps = collector.finish(history, history_ref='fixture:structured-extract', final_output=None,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64))

        native = next(fact for fact in trace.observations[1].facts if fact.kind == 'native_extraction')
        self.assertFalse(gaps)
        self.assertEqual(native.value['output'], {'value': 'fixture'})
        self.assertEqual(native.sourceRefs[0].digest, digest(native.value))
        self.assertEqual(trace.observations[0].url, self.summary.url)
        self.assertNotIn('?filter=live', str(native.value))

        tampered = trace.model_dump(mode='json')
        target = next(fact for fact in tampered['observations'][1]['facts']
                      if fact['kind'] == 'native_extraction')
        target['value']['output']['value'] = 'changed'
        tampered['digest'] = digest({key: value for key, value in tampered.items() if key != 'digest'})
        with self.assertRaisesRegex(ValueError, 'fact_source_digest_mismatch'):
            NormalizedTrace.model_validate(tampered)

    async def test_extra_extract_result_keeps_original_error_and_is_rejected_as_unpaired(self):
        action = self.registry.validate_action('extract', {
            'query': 'Read the bounded value', 'extract_links': False, 'already_collected': []})
        output = SimpleNamespace(action=[action])
        await self.collector.before_action(self.summary, output, 1)
        results = [ActionResult(extracted_content='first'), ActionResult(error='PRIVATE_AUXILIARY_ERROR')]
        history = SimpleNamespace(history=[SimpleNamespace(model_output=output, result=results)],
            is_done=lambda: False, is_successful=lambda: False, is_validated=lambda: False)

        await self.collector.after_step(SimpleNamespace(history=history))
        trace, gaps = self.collector.finish(history, history_ref='fixture:extra-extract-result', final_output=None,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64))

        self.assertEqual(trace.actions[0].status, 'proposed')
        self.assertIn('unpaired_result_at_step:0', [item.reason for item in gaps])
        self.assertIn('native_extraction_result_unpaired', [item.reason for item in gaps])
        self.assertEqual([kind for kind, _ in self.stored].count('action-result'), 2)
        self.assertIn('PRIVATE_AUXILIARY_ERROR', str(self.stored))

    async def test_scroll_captures_fixed_page_effect_before_and_after(self):
        page = await self.browser.get_current_page()
        page.evaluate = AsyncMock(side_effect=['{"x":0,"y":0}', '{"x":0,"y":300}'])
        action = self.registry.validate_action('scroll', {'down': True, 'pages': 1.0})
        output = SimpleNamespace(action=[action])

        await self.collector.before_action(self.summary, output, 1)
        history = SimpleNamespace(history=[SimpleNamespace(model_output=output, result=[ActionResult()])],
            is_done=lambda: True, is_successful=lambda: True, is_validated=lambda: True)
        await self.collector.after_step(SimpleNamespace(history=history))
        trace, gaps = self.collector.finish(history, history_ref='fixture:scroll-effect', final_output=None,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64))

        self.assertFalse(gaps)
        self.assertEqual(next(f.value for f in trace.observations[0].facts if f.kind == 'scroll_position'),
                         '{"x":0,"y":0}')
        self.assertEqual(next(f.value for f in trace.observations[1].facts if f.kind == 'scroll_position'),
                         '{"x":0,"y":300}')

if __name__ == '__main__':
    unittest.main()
