"""Loop intent can name proven clauses before history action IDs exist; ambiguity stays a gap."""
import unittest
from copy import deepcopy

from browser_use.tools.service import Tools
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.controls import semantic_loop_evidence
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import CompilationRequest
from hybrid_fixture import fixture
from test_hybrid_compiler import rehash


class LoopAlignmentTests(unittest.TestCase):
    def test_unmapped_loop_policy_is_not_silently_ignored(self):
        registry = ActionRegistry.from_tools(Tools())
        for key, value in [('stableItemKey', {'path': ['id']}), ('stopOutcomes', ['complete']),
                           ('stopOutcomes', ['complete', 'complete', 'blocked', 'failed'])]:
            raw = fixture('loop')['request']
            raw['control']['loops'][0][key] = value
            raw['requirement']['clauses'][-1]['expression']['loop'][key] = value
            rehash(raw, 'requirement')
            result = compile_request(CompilationRequest.model_validate(raw), registry)
            self.assertIn('loop_policy_not_mapped', [item['reason'] for item in result.gaps])
            self.assertEqual(result.controlGraph['entry'], '')

    def test_clause_body_and_explicit_history_body_have_the_same_graph(self):
        semantic, historical = fixture('semantic-loop'), fixture('loop')
        for key in ('segments', 'controlGraph', 'coverage'):
            self.assertEqual(semantic['response']['compilation'][key], historical['response']['compilation'][key])
        self.assertFalse(semantic['response']['compilation']['gaps'])

    def test_unknown_duplicate_and_ambiguous_clause_bodies_reject(self):
        registry = ActionRegistry.from_tools(Tools())
        for body in (['unknown'], ['url', 'url'], ['url', 'same-tab'], []):
            raw = fixture('semantic-loop')['request']
            raw['requirement']['clauses'][-2]['expression'] = {'bodyClauses': body}
            rehash(raw, 'requirement')
            result = compile_request(CompilationRequest.model_validate(raw), registry)
            self.assertTrue(result.gaps)
            self.assertEqual(result.controlGraph['entry'], '')

    def test_unrelated_middle_action_is_not_silently_absorbed_into_loop(self):
        raw = fixture('semantic-loop')['request']
        request = CompilationRequest.model_validate(raw)
        result = compile_request(request, ActionRegistry.from_tools(Tools()))
        segment = deepcopy(result.segments[0])
        unrelated = deepcopy(segment)
        unrelated['bindings'] = []
        self.assertIsNone(semantic_loop_evidence(request, request.control.loops[0], ['url'], [segment, unrelated, segment]))
