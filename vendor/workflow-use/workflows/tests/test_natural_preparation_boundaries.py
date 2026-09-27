"""Agent completion corrections and dynamic empty DOM queries retain distinct evidence semantics."""
import unittest
from types import SimpleNamespace

from jsonschema import Draft202012Validator

from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.dom_evidence import DomQueryEvidence
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_reads import NaturalReadFailure, compile_verified_read, find_elements_read_spec
from test_method_source_compile import method_source, reference
from test_natural_read_liveness import verified_query


def with_failed_done():
    request, registry, schema, _verified = method_source()
    corrected = request.trace.actions[-1]
    rejected = corrected.model_copy(deep=True)
    rejected.args['readRefs'] = ['missing-ref']
    rejected.status = 'failed'
    rejected.resultRef = reference('completion_read_reference_invalid')
    corrected.id, corrected.stepIndex = 'a-0003', 2
    request.trace.actions.insert(-1, rejected)
    request.trace.digest = digest(request.trace.model_dump(mode='json', exclude={'digest'}))
    return request, registry, schema


class NaturalPreparationBoundaryTests(unittest.TestCase):
    def test_failed_done_then_corrected_ref_remains_metadata(self):
        request, registry, schema = with_failed_done()
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual([row.disposition for row in compiled.coverage],
                         ['compiled', 'agent_internal', 'agent_internal'])
        self.assertEqual(compiled.coverage[1].exclusionRule, 'agent_done_metadata/v1')
        self.assertEqual(compiled.coverage[1].evidenceRefs, [request.trace.actions[1].resultRef])

    def test_unregistered_effect_invalid_args_or_unexecuted_done_is_not_metadata(self):
        for mutation in (lambda action: setattr(action, 'effect', 'ui_state'),
                         lambda action: action.args.pop('readRefs'),
                         lambda action: setattr(action, 'status', 'proposed')):
            request, registry, schema = with_failed_done()
            mutation(request.trace.actions[1])
            compiled = compile_request(request, registry, output_schema=schema)
            self.assertTrue(compiled.gaps)
            self.assertEqual(compiled.coverage[1].disposition, 'not_compilable')

    def test_failed_browser_action_keeps_its_compilation_gap(self):
        request, registry, schema = with_failed_done()
        failed = request.trace.actions[1]
        failed.name, failed.effect = 'navigate', 'navigation'
        failed.args = {'url': 'https://example.test/unavailable', 'new_tab': False}
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertIn('successful_action_result_required', [gap['reason'] for gap in compiled.gaps])
        self.assertEqual(compiled.coverage[1].disposition, 'not_compilable')

    def test_complete_empty_query_compiles_as_a_dynamic_read(self):
        action, pre, post, _segment, _coverage = verified_query('a-0001', 'a.next', 0, 100)
        request = SimpleNamespace(plan=SimpleNamespace(outputSchemaDigest=digest({'type': 'null'})))
        segment, _paths, issues = compile_verified_read(request, action, pre, post, {'type': 'null'}, [])
        self.assertEqual(issues, [])
        specification = segment['operation']['specification']
        self.assertEqual(specification['maxItems'], 100)
        self.assertEqual(specification['outputSchema']['minItems'], 0)
        Draft202012Validator(specification['outputSchema']).validate([])

    def test_observed_nonempty_query_permits_later_empty_but_rejects_truncation(self):
        _action, _pre, post, _segment, _coverage = verified_query('a-0001', 'a.next', 1, 100)
        query = DomQueryEvidence.model_validate(next(fact.value for fact in post.facts if fact.kind == 'dom_query'))
        specification = find_elements_read_spec(query)
        Draft202012Validator(specification.outputSchema).validate([])
        self.assertEqual(specification.outputSchema['minItems'], 0)
        for update in ({'complete': False}, {'truncated': True}, {'showing': 0}):
            with self.subTest(update=update), self.assertRaises(NaturalReadFailure):
                find_elements_read_spec(query.model_copy(update=update))


if __name__ == '__main__':
    unittest.main()
