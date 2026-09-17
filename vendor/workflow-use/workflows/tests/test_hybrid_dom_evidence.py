"""D1 DOM evidence copies native relationships without inventing replay identity."""
import unittest
from types import SimpleNamespace

from browser_use.agent.views import ActionResult
from browser_use.tools.service import Tools

from workflow_use.hybrid.dom_evidence import (
    DomScope,
    capture_find_elements_query,
    capture_selector_structure,
    complete_find_elements_query,
)
from workflow_use.hybrid.evidence import EvidenceRef, NormalizedTrace, TraceSource, digest
from workflow_use.hybrid.history import from_agent_history
from workflow_use.hybrid.normalize import normalize_history
from workflow_use.hybrid.registry import ActionRegistry


def node(tag, xpath, node_id, backend_id, attributes=None, frame_id='frame-1'):
    return SimpleNamespace(node_name=tag, xpath=xpath, node_id=node_id, backend_node_id=backend_id,
                           attributes=attributes or {}, frame_id=frame_id, target_id='target-1',
                           parent_node=None, children_nodes=[])


def attach(parent, *children):
    parent.children_nodes = list(children)
    for child in children:
        child.parent_node = parent


class DomEvidenceTests(unittest.TestCase):
    def test_find_elements_keeps_bounded_counts_without_result_bodies(self):
        raw_url = 'https://fixture.invalid/list?token=private'
        summary = SimpleNamespace(url=raw_url)
        query = capture_find_elements_query(summary, 'a-0001',
            {'selector': '.row', 'max_results': 50, 'include_text': True, 'attributes': ['href']},
            {'selector': '.row', 'max_results': 50, 'include_text': True, 'attributes': ['href']}, 'tab-1')
        zero = complete_find_elements_query(query, [ActionResult(
            long_term_memory='Found 0 elements matching ".row".', extracted_content='PRIVATE PAGE BODY')])
        many = complete_find_elements_query(query, [ActionResult(
            long_term_memory='Found 80 elements matching ".row".', extracted_content='PRIVATE PAGE BODY')])

        self.assertEqual((zero.total, zero.showing, zero.truncated, zero.complete), (0, 0, False, False))
        self.assertIn('zero_matches_not_collection', zero.limitations)
        self.assertEqual((many.total, many.showing, many.truncated, many.complete), (80, 50, True, False))
        self.assertIn('query_result_truncated', many.limitations)
        self.assertNotIn('PRIVATE PAGE BODY', str(zero.model_dump()))
        stored = zero.model_dump(mode='json')
        self.assertEqual(stored['scope']['urlDigest'], digest(raw_url))

    def test_callback_copies_real_ancestors_siblings_and_wrappers_before_refresh(self):
        root = node('html', 'html', 1, 101)
        body = node('body', 'html/body', 2, 102)
        listing = node('section', 'html/body/section', 3, 103, {'data-testid': 'private-list'})
        first = node('article', 'html/body/section/article[1]', 4, 104)
        second = node('article', 'html/body/section/article[2]', 5, 105)
        wrapper = node('div', 'html/body/section/article[2]/div', 6, 106)
        target = node('button', 'html/body/section/article[2]/div/button', 7, 107,
                      {'role': 'button', 'id': 'account-secret'})
        attach(root, body)
        attach(body, listing)
        attach(listing, first, second)
        attach(second, wrapper)
        attach(wrapper, target)
        raw_url = 'https://user:pass@fixture.invalid/issues?token=secret#fragment'
        summary = SimpleNamespace(url=raw_url,
            dom_state=SimpleNamespace(selector_map={47: target}))

        evidence = capture_selector_structure(summary, 'a-0001', 47, 'tab-1',
            {'strategy': 'structure', 'scope': {'url': 'https://fixture.invalid/issues'},
             'container': {'kind': 'css', 'value': '#issues'},
             'items': {'kind': 'css', 'value': '.issue-row'}, 'withinItem': None, 'ordinal': 2},
            query_verified=True)
        body_value = evidence.model_dump(mode='json')

        self.assertEqual(body_value['scope']['urlDigest'], digest(raw_url))
        by_xpath = {item['xpath']: item for item in body_value['nodes']}
        self.assertEqual(body_value['targetRef'], by_xpath['html/body/section/article[2]/div/button']['id'])
        self.assertEqual(by_xpath['html/body/section']['childrenRefs'],
                         [by_xpath['html/body/section/article[1]']['id'], by_xpath['html/body/section/article[2]']['id']])
        self.assertEqual(by_xpath['html/body/section/article[2]/div']['childrenRefs'], [body_value['targetRef']])
        self.assertEqual(by_xpath['html/body/section/article[2]/div/button']['parentRef'],
                         by_xpath['html/body/section/article[2]/div']['id'])
        self.assertEqual(by_xpath['html/body/section/article[2]/div/button']['attributes']['role'], 'button')
        self.assertEqual(body_value['queryCandidate']['items']['value'], '.issue-row')
        self.assertEqual(body_value['queryCandidate']['matchedItemOrdinal'], 2)
        self.assertFalse(body_value['coverage']['complete'])
        self.assertIn('upstream_dom_coverage_not_proven', body_value['limitations'])
        self.assertEqual(digest(body_value), digest(evidence))

        natural = capture_selector_structure(summary, 'a-0001', 47, 'tab-1').model_dump(mode='json')
        self.assertIsNone(natural['queryCandidate'])
        self.assertIn('query_candidate_unavailable', natural['limitations'])
        self.assertEqual(natural['nodes'], body_value['nodes'])

        missing = capture_selector_structure(summary, 'a-0002', 99, 'tab-1').model_dump(mode='json')
        self.assertEqual(missing['scope']['urlDigest'], digest(raw_url))

    def test_legacy_dom_scope_omits_absent_url_digest(self):
        scope = DomScope(url='https://fixture.invalid/list', tabId='tab-1', targetId=None,
                         frameId=None, document=None).model_dump(mode='json')
        self.assertNotIn('urlDigest', scope)

    def test_old_multi_action_history_never_guesses_post_action_target_context(self):
        registry = ActionRegistry.from_tools(Tools())
        actions = [registry.validate_action('click', {'index': index}) for index in (7, 9)]
        elements = [SimpleNamespace(node_name='button', x_path=f'html/body/button[{index}]', frame_id=None,
                                    attributes={'role': 'button'}) for index in (1, 2)]
        state = SimpleNamespace(url='https://fixture.invalid/list',
            tabs=[SimpleNamespace(url='https://fixture.invalid/list', target_id='tab-history')],
            interacted_element=elements)
        item = SimpleNamespace(model_output=SimpleNamespace(action=actions),
                               result=[ActionResult(error='redacted upstream failure')], state=state)
        history = SimpleNamespace(history=[item], is_done=lambda: False, is_successful=lambda: False)
        stored = []
        def put(kind, value):
            stored.append((kind, value))
            return EvidenceRef(ref=f'fixture:{kind}:{len(stored)}', digest=digest(value))
        imported = from_agent_history(history, source=TraceSource(version=registry.providerVersion,
            historyRef='fixture:legacy'), judged=False,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64),
            redact_action=lambda value: value, store_result=lambda _step, _index, result:
                put('result', {'errorPresent': bool(result.error)}), observations=[], observation_links={},
            final_result_ref=None, put_evidence=put)

        trace, gaps = normalize_history(imported, registry)

        self.assertEqual([action.status for action in trace.actions], ['proposed', 'proposed'])
        facts = [fact for observation in trace.observations for fact in observation.facts
                 if fact.kind == 'dom_structure']
        self.assertEqual(facts, [])
        self.assertTrue(any(item.reason == 'action_result_unpaired_or_ambiguous' for item in gaps))
        self.assertNotIn('redacted upstream failure', str(stored))

    def test_agent_step_error_without_model_output_is_retained_as_auxiliary_fact(self):
        registry = ActionRegistry.from_tools(Tools())
        state = SimpleNamespace(url='https://fixture.invalid/list',
            tabs=[SimpleNamespace(url='https://fixture.invalid/list', target_id='tab-aux')],
            interacted_element=[])
        item = SimpleNamespace(model_output=None, result=[ActionResult(error='PRIVATE_AGENT_STEP_ERROR')], state=state)
        history = SimpleNamespace(history=[item], is_done=lambda: False, is_successful=lambda: False)
        stored = []
        def put(kind, value):
            stored.append((kind, value))
            return EvidenceRef(ref=f'fixture:{kind}:{len(stored)}', digest=digest(value))

        imported = from_agent_history(history, source=TraceSource(version=registry.providerVersion,
            historyRef='fixture:auxiliary'), judged=False,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64),
            redact_action=lambda value: value,
            store_result=lambda _step, _index, result: put('result', {'errorPresent': bool(result.error)}),
            observations=[], observation_links={}, final_result_ref=None, put_evidence=put)
        trace, gaps = normalize_history(imported, registry)

        self.assertEqual(trace.actions, [])
        self.assertNotIn('unpaired_result_at_step:0', [entry.reason for entry in gaps])
        auxiliary = next(fact for fact in trace.observations[0].facts if fact.kind == 'agent_step_result')
        self.assertEqual(auxiliary.value['disposition'], 'agent_step_auxiliary')
        self.assertEqual(auxiliary.value['results'][0]['resultRef']['ref'], 'fixture:result:1')
        self.assertNotIn('PRIVATE_AGENT_STEP_ERROR', str(stored))

        state.tabs = []
        imported = from_agent_history(history, source=TraceSource(version=registry.providerVersion,
            historyRef='fixture:unscoped'), judged=False,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64),
            redact_action=lambda value: value,
            store_result=lambda _step, _index, result: put('result', {'errorPresent': bool(result.error)}),
            observations=[], observation_links={}, final_result_ref=None, put_evidence=put)
        _, gaps = normalize_history(imported, registry)
        self.assertIn('unpaired_result_at_step:0', [entry.reason for entry in gaps])


if __name__ == '__main__':
    unittest.main()
