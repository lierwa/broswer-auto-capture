"""Protect per-action input ownership and runtime-value postconditions for multi-field tasks."""
import unittest
from types import SimpleNamespace

from browser_use.tools.service import Tools
from workflow_use.hybrid.bindings import decide_bindings
from workflow_use.hybrid.compiler import proven_effect
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import CompilationRequest
from test_hybrid_compiler import navigation_request, rehash
from hybrid_fixture import fixture
from workflow_use.hybrid.compiler import compile_request


class InputTests(unittest.TestCase):
    def test_prior_output_requires_matching_observed_value_not_just_schema(self):
        registry = ActionRegistry.from_tools(Tools())
        for mutation in ('valid', 'clause', 'mismatch', 'missing'):
            raw = fixture('prior-navigation')['request']
            if mutation == 'valid':
                raw['requirement']['clauses'][1]['expression']['binding']['nodeId'] = 'a-0001'
            if mutation == 'mismatch':
                raw['trace']['observations'][1]['facts'][-1]['value']['output']['url'] = 'https://other.invalid/'
            if mutation == 'missing':
                raw['trace']['observations'][1]['facts'].pop()
            for key in ('requirement', 'plan', 'trace'):
                rehash(raw, key)
            compiled = compile_request(CompilationRequest.model_validate(raw), registry)
            with self.subTest(mutation=mutation):
                if mutation in ('valid', 'clause'):
                    self.assertFalse(compiled.gaps)
                    self.assertEqual(compiled.segments[1]['bindings'][1]['kind'], 'prior_output')
                else:
                    self.assertIn('prior_output_value_not_proven:url', [gap['reason'] for gap in compiled.gaps])

    def test_two_fields_do_not_share_or_ambiguously_bind_the_same_action(self):
        clauses = [SimpleNamespace(id=name, expression={'actionName': 'input', 'argumentPath': 'text',
                   'actionRefs': [action], 'binding': {'source': 'input', 'path': [name]}})
                   for action, name in [('a-0001', 'first'), ('a-0002', 'second')]]
        schema = {'type': 'object', 'properties': {'first': {'type': 'string'}, 'second': {'type': 'string'}}}
        for identity, field in [('a-0001', 'first'), ('a-0002', 'second')]:
            # Pydantic evidence hashes the clause, so use normal request clause objects.
            from workflow_use.hybrid.request import RequirementClause
            requirement = SimpleNamespace(id='req', clauses=[RequirementClause(id=c.id, kind='input', expression=c.expression) for c in clauses])
            action = SimpleNamespace(id=identity, name='input', args={'text': 'sample'})
            bindings, gaps = decide_bindings(action, requirement, schema, {})
            self.assertFalse(gaps)
            self.assertEqual(bindings[0].sourceRef, field)
            self.assertEqual(bindings[0].kind, 'runtime_input')

    def test_dynamic_postcondition_preserves_binding_instead_of_sample_text(self):
        expression = {'actionRef': 'a-0001', 'factKind': 'target_value', 'bindingArgument': 'text'}
        request = SimpleNamespace(control=SimpleNamespace(selections=[]),
                                  requirement=SimpleNamespace(clauses=[SimpleNamespace(id='filled', kind='completion', expression=expression)]))
        action = SimpleNamespace(id='a-0001', name='input', args={'text': 'first sample'})
        pre = SimpleNamespace(facts=[SimpleNamespace(kind='target_value', value='')])
        post = SimpleNamespace(facts=[SimpleNamespace(kind='target_value', value='first sample')])
        self.assertEqual(proven_effect(request, action, pre, post), [
            {'kind': 'target_value', 'clauseRef': 'filled', 'bindingArgument': 'text'}])

    def test_unknown_or_empty_action_scope_is_rejected(self):
        registry = ActionRegistry.from_tools(Tools())
        for refs in ([], ['a-9999'], ['a-0001', 'a-0001']):
            request = navigation_request(registry)
            request['requirement']['clauses'][0]['expression']['actionRefs'] = refs
            rehash(request, 'requirement')
            with self.assertRaisesRegex(ValueError, 'invalid_clause_action_refs'):
                CompilationRequest.model_validate(request)
