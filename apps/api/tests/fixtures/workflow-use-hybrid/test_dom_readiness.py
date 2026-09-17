import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.agent.views import ActionResult
from browser_use.tools.service import Tools
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.compiler import selection_target, target_evidence_matches
from workflow_use.hybrid.postconditions import PostconditionNotMet


class DomReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_bounded_postcondition_observes_without_resending_action(self):
        page = SimpleNamespace(get_url=AsyncMock(return_value='https://fixture.invalid/not-ready'))
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=page))
        tools = Tools()
        tools.act = AsyncMock(return_value=ActionResult(extracted_content='navigated'))
        adapter = OrdinaryCapability(browser, tools)
        post = [{'kind': 'url', 'bindingArgument': 'url',
                 'settle': {'maxMs': 80, 'maxAttempts': 3, 'intervalMs': 10}}]
        with self.assertRaises(PostconditionNotMet):
            await adapter.execute_checked('navigate', {'url': 'https://fixture.invalid/ready'}, None, post)
        tools.act.assert_awaited_once()
        self.assertGreaterEqual(page.get_url.await_count, 2)

    def test_compiler_builds_structure_target_only_from_matching_complete_dom_fact(self):
        action = SimpleNamespace(id='a-1', name='click', args={'index': 19})
        binding = {'source': 'input', 'path': ['issueOrdinal']}
        intent_target = {'ordinal': 2, 'ordinalBinding': binding}
        intent = SimpleNamespace(strategy='ordinal', target=intent_target, actionRefs=['a-1'], clauseRefs=['c-select'])
        clause = SimpleNamespace(id='c-select', kind='selection',
                                 expression={'strategy': 'ordinal', 'target': intent_target})
        fact_value = {'schemaVersion': 'bat.dom-structure/v1', 'actionRef': 'a-1', 'targetRef': 'n-title',
                      'scope': {'url': 'https://fixture.invalid/issues', 'tabId': 'tab-1', 'frameId': 'frame-1'},
                      'nodes': [{'id': 'n-title', 'xpath': '/html/body/main/article[2]/a'}],
                      'queryCandidate': {'scope': {'kind': 'document', 'tabId': 'tab-1', 'frameId': 'frame-1'},
                                         'container': {'kind': 'css', 'value': '.results'},
                                         'items': {'kind': 'css', 'value': '.wrapper > article'},
                                         'withinItem': {'kind': 'css', 'value': 'a.title'},
                                         'matchedItemOrdinal': 2, 'targetRef': 'n-title', 'complete': True}}
        pre = SimpleNamespace(url='https://fixture.invalid/issues',
                              facts=[SimpleNamespace(kind='dom_structure', value=fact_value)])
        request = SimpleNamespace(control=SimpleNamespace(selections=[intent]),
                                  requirement=SimpleNamespace(clauses=[clause]),
                                  runtimeInputSchema={'type': 'object', 'properties': {'issueOrdinal': {'type': 'integer'}}})
        target, issues = selection_target(request, action, pre)
        self.assertEqual(issues, [])
        self.assertEqual(target, {'strategy': 'structure', 'scope': {'url': pre.url},
                                  'container': fact_value['queryCandidate']['container'],
                                  'items': fact_value['queryCandidate']['items'], 'ordinal': 2,
                                  'ordinalBinding': binding,
                                  'withinItem': fact_value['queryCandidate']['withinItem']})
        self.assertTrue(target_evidence_matches(action, target, pre))
        fact_value['queryCandidate']['complete'] = False
        target, issues = selection_target(request, action, pre)
        self.assertIsNone(target)
        self.assertEqual(issues[0].code, 'sample_value_leak')

    def test_xpath_target_is_proven_by_same_action_dom_target_ref(self):
        action = SimpleNamespace(id='a-2', name='click', args={'index': 7})
        target = {'strategy': 'xpath', 'scope': {'url': 'https://fixture.invalid/issues'},
                  'value': '/html/body/main/a'}
        fact = SimpleNamespace(kind='dom_structure', value={'actionRef': 'a-2', 'targetRef': 'n-1',
                               'nodes': [{'id': 'n-1', 'xpath': target['value']}]})
        pre = SimpleNamespace(url=target['scope']['url'], facts=[fact])
        self.assertTrue(target_evidence_matches(action, target, pre))
        fact.value['nodes'][0]['xpath'] = '/html/body/aside/a'
        self.assertFalse(target_evidence_matches(action, target, pre))

    def test_bound_legacy_ordinal_is_rejected_without_structure_evidence(self):
        target = {'container': '.record', 'ordinal': 1,
                  'ordinalBinding': {'source': 'input', 'path': ['itemOrdinal']}}
        intent = SimpleNamespace(strategy='ordinal', target=target, actionRefs=['a-3'], clauseRefs=['select'])
        request = SimpleNamespace(control=SimpleNamespace(selections=[intent]),
                                  requirement=SimpleNamespace(clauses=[SimpleNamespace(
                                      id='select', kind='selection',
                                      expression={'strategy': 'ordinal', 'target': target})]),
                                  runtimeInputSchema={'type': 'object', 'properties': {
                                      'itemOrdinal': {'type': 'integer'}}})
        result, issues = selection_target(request, SimpleNamespace(id='a-3', name='click', args={'index': 1}),
                                          SimpleNamespace(url='https://fixture.invalid/records', facts=[]))
        self.assertIsNone(result)
        self.assertEqual(issues[0].code, 'sample_value_leak')


if __name__ == '__main__':
    unittest.main()
