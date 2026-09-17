"""Compiler safety invariants beyond the happy path; no browser/model calls."""
import copy
import unittest
from browser_use.tools.service import Tools
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.registry import ActionRegistry, action_effect
from workflow_use.hybrid.request import CompilationRequest
from workflow_use.hybrid.evidence import digest
from hybrid_fixture import fixture
from test_hybrid_compiler import navigation_request, rehash


def compile_raw(raw, registry):
    for key in ('requirement', 'plan', 'trace'):
        rehash(raw, key)
    return compile_request(CompilationRequest.model_validate(raw), registry)


def click_request(registry, strategy, target):
    raw = navigation_request(registry)
    action = raw['trace']['actions'][0]
    action.update(name='click', args={'index': 19}, effect=action_effect('click'))
    raw['trace']['observations'][1]['url'] = raw['trace']['observations'][0]['url']
    raw['requirement']['clauses'] = [
        {'id': 'selection', 'kind': 'selection', 'expression': {'strategy': strategy, 'target': target}},
        {'id': 'effect', 'kind': 'completion', 'expression': {'actionRef': 'a-0001', 'factKind': 'title', 'equals': 'Changed'}}]
    raw['control']['selections'] = [{'id': 'chosen', 'clauseRefs': ['selection'], 'actionRefs': ['a-0001'],
                                    'strategy': strategy, 'target': target}]
    for i, value in enumerate(('Before', 'Changed')):
        observation = raw['trace']['observations'][i]
        observation['facts'] = [{'id': f'title-{i}', 'kind': 'title', 'value': value, 'sourceRefs': observation['sourceRefs']}]
    before = raw['trace']['observations'][0]
    before['facts'].append({'id': 'resolved', 'kind': 'resolved_target',
                           'value': {'actionRef': 'a-0001', 'index': 19, 'target': {'strategy': strategy, **target}},
                           'sourceRefs': before['sourceRefs']})
    return raw


class GateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = ActionRegistry.from_tools(Tools())

    def test_same_click_obeys_ordinal_or_title_intent_not_sample_identity(self):
        ordinal = compile_raw(click_request(self.registry, 'ordinal', {'container': '.entry', 'ordinal': 1}), self.registry)
        title = compile_raw(click_request(self.registry, 'title', {'role': 'link', 'name': 'Title X'}), self.registry)
        self.assertFalse(ordinal.gaps)
        self.assertFalse(title.gaps)
        self.assertNotEqual(ordinal.canonicalDigest, title.canonicalDigest)
        self.assertNotIn('Title X', str(ordinal.segments))
        self.assertEqual(ordinal.segments[0]['target']['ordinal'], 1)
        self.assertEqual(title.segments[0]['target']['name'], 'Title X')

    def test_missing_selection_and_unlinked_target_are_gaps(self):
        raw = click_request(self.registry, 'ordinal', {'container': '.entry', 'ordinal': 1})
        raw['control']['selections'] = []
        self.assertIn('missing_control_intent', [g['code'] for g in compile_raw(raw, self.registry).gaps])
        raw = click_request(self.registry, 'ordinal', {'container': '.entry', 'ordinal': 1})
        raw['trace']['observations'][0]['facts'].pop()
        self.assertIn('missing_effect_proof', [g['code'] for g in compile_raw(raw, self.registry).gaps])

    def test_unreviewed_locator_and_forged_effect_rejected(self):
        raw = click_request(self.registry, 'locator', {'strategy': 'xpath', 'value': '/html/body/a'})
        self.assertTrue(compile_raw(raw, self.registry).gaps)
        raw = navigation_request(self.registry)
        raw['trace']['actions'][0]['effect'] = 'none'
        self.assertIn('action_effect_mismatch', [g['reason'] for g in compile_raw(raw, self.registry).gaps])

    def test_unpaired_retry_and_cross_tab_never_become_safe_replay(self):
        for mode in ('failed', 'proposed', 'cancelled', 'cross-tab'):
            raw = navigation_request(self.registry)
            if mode == 'cross-tab':
                raw['trace']['observations'][1]['tabId'] = 'other-tab'
            else:
                raw['trace']['actions'][0]['status'] = mode
            with self.subTest(mode=mode):
                self.assertTrue(compile_raw(raw, self.registry).gaps)

    def test_repeated_history_alone_does_not_create_loop(self):
        raw = fixture('loop')['request']
        raw['control']['loops'] = []
        result = compile_raw(raw, self.registry)
        self.assertIn('repeated_operation_requires_control_intent', [g['reason'] for g in result.gaps])
        self.assertEqual(result.controlGraph['entry'], '')

    def test_changed_loop_body_or_unvisited_browser_branch_is_gap(self):
        raw = fixture('loop')['request']
        raw['trace']['actions'][1]['args']['new_tab'] = True
        self.assertTrue(compile_raw(raw, self.registry).gaps)
        raw = fixture('branch')['request']
        raw['control']['branches'][0]['outcomes']['false'] = 'a-0001'
        raw['requirement']['clauses'][-1]['expression']['branch']['outcomes']['false'] = 'a-0001'
        self.assertTrue(compile_raw(raw, self.registry).gaps)

    def test_unbounded_model_io_and_budget_and_missing_input_rejected(self):
        for mutation in ('schema', 'bytes', 'calls', 'input', 'purpose'):
            raw = fixture('semantic')['request']
            operation = raw['requirement']['clauses'][1]['expression']
            annotation = raw['acceptedAnnotations'][0]
            if mutation == 'schema':
                operation['outputSchema'] = annotation['proposedOutputSchema'] = {'type': 'string'}
            elif mutation == 'bytes':
                operation['budget']['maxInputBytes'] = 1
            elif mutation == 'calls':
                operation['budget']['maxCalls'] = 2
            elif mutation == 'input':
                annotation['inputFieldRefs'] = ['unknown']
            else:
                operation['purpose'] = 'classify'
            with self.subTest(mutation=mutation):
                if mutation == 'input':
                    with self.assertRaisesRegex(ValueError, 'unknown_annotation_input'):
                        compile_raw(raw, self.registry)
                else:
                    self.assertTrue(compile_raw(raw, self.registry).gaps)

    def test_control_annotations_are_merged_only_once_and_remain_source_bound(self):
        raw = fixture('loop')['request']
        intent = raw['control']['loops'].pop()
        raw['acceptedAnnotations'] = [{'kind': 'control_intent', 'intent': intent,
                                       'clauseRefs': intent['clauseRefs'], 'confirmedBy': 'user'}]
        self.assertFalse(compile_raw(raw, self.registry).gaps)
        raw['control']['loops'] = [intent]
        with self.assertRaisesRegex(ValueError, 'duplicate_control_annotation'):
            compile_raw(raw, self.registry)


if __name__ == '__main__':
    unittest.main()
