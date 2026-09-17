"""Classifier authority tests: no samples, skipped actions, or unproven effects become candidates."""
import unittest

from browser_use.tools.service import Tools

from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.evidence import EvidenceRef, NormalizedObservation, TraceSource, digest
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import CompilationRequest

REF = EvidenceRef(ref='fixture:captured', digest='1' * 64)


def navigation_request(registry):
    observations = [NormalizedObservation(id=f'o-{i + 1:04d}', sequence=i, url=url, tabId='tab-1', facts=[],
                    sourceRefs=[REF]) for i, url in enumerate(['https://fixture.invalid/', 'https://fixture.invalid/next'])]
    records = [HistoryRecord(stepIndex=0, actions=[{'navigate': {'url': observations[1].url, 'new_tab': False}}],
               results=[ResultEvidence(errorPresent=False, ref=REF)], preObservationRef='o-0001',
               postObservationRefs={'0': 'o-0002'})]
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version='0.13.8', historyRef='fixture:history'),
                      judged=True, completed=True, records=records, observations=observations,
                      finalResultRef=REF, redactionManifestRef=REF), registry)
    assert not issues
    schema = {'type': 'object', 'properties': {'url': {'type': 'string'}}, 'required': ['url'], 'additionalProperties': False}
    requirement = {'id': 'requirement', 'version': 1, 'clauses': [
        {'id': 'url', 'kind': 'input', 'expression': {'actionName': 'navigate', 'argumentPath': 'url',
          'binding': {'source': 'input', 'path': ['url']}}},
        {'id': 'same-tab', 'kind': 'constraint', 'expression': {'actionName': 'navigate', 'argumentPath': 'new_tab',
          'binding': {'source': 'constant', 'value': False}}}]}
    plan = {'id': 'plan', 'version': 1, 'stepId': 'step', 'inputSchemaDigest': digest(schema),
            'outputSchemaDigest': digest({'type': 'null'}), 'callMode': 'once'}
    return {'compilerVersion': 'bat-hybrid/1', 'actionRegistryVersion': registry.schemaDigest,
            'requirement': {**requirement, 'digest': digest(requirement)}, 'plan': {**plan, 'digest': digest(plan)},
            'runtimeInputSchema': schema, 'trace': trace.model_dump(),
            'control': {'selections': [], 'branches': [], 'loops': [], 'invokes': []}, 'acceptedAnnotations': []}


def rehash(body, name):
    body[name]['digest'] = digest({k: v for k, v in body[name].items() if k != 'digest'})


class CompilerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = ActionRegistry.from_tools(Tools())

    def test_navigation_has_complete_coverage_and_stable_parameter_binding(self):
        request = CompilationRequest.model_validate(navigation_request(self.registry))
        result = compile_request(request, self.registry)
        self.assertFalse(result.gaps)
        self.assertEqual(len(result.coverage), 1)
        self.assertEqual(result.coverage[0].disposition, 'compiled')
        self.assertEqual(result.segments[0]['bindings'][1]['kind'], 'runtime_input')
        self.assertNotIn('fixture.invalid', str(result.segments))
        self.assertNotIn('outputAssembly', result.model_dump(mode='json'))
        self.assertEqual(result.canonicalDigest, compile_request(request, self.registry).canonicalDigest)

    def test_missing_binding_is_never_replaced_by_sample(self):
        raw = navigation_request(self.registry)
        raw['requirement']['clauses'].pop(0)
        rehash(raw, 'requirement')
        result = compile_request(CompilationRequest.model_validate(raw), self.registry)
        self.assertIn('sample_value_leak', [g['code'] for g in result.gaps])
        self.assertEqual(result.controlGraph['entry'], '')

    def test_changed_effect_or_missing_observation_blocks_materialization(self):
        for mutation in ('url', 'post'):
            raw = navigation_request(self.registry)
            if mutation == 'url':
                raw['trace']['observations'][1]['url'] = 'https://fixture.invalid/wrong'
            else:
                raw['trace']['actions'][0]['postObservationRef'] = None
            rehash(raw, 'trace')
            result = compile_request(CompilationRequest.model_validate(raw), self.registry)
            self.assertTrue(result.gaps)
            self.assertEqual(result.segments, [])

    def test_stale_authority_and_extra_graph_fields_rejected_at_boundary(self):
        raw = navigation_request(self.registry)
        raw['requirement']['version'] = 2
        with self.assertRaisesRegex(ValueError, 'authority_digest_mismatch'):
            CompilationRequest.model_validate(raw)
        raw = navigation_request(self.registry)
        raw['nodes'] = []
        with self.assertRaises(ValueError):
            CompilationRequest.model_validate(raw)

    def test_unregistered_action_cannot_be_classified_as_llm(self):
        raw = navigation_request(self.registry)
        raw['trace']['actions'][0]['name'] = 'future_action'
        rehash(raw, 'trace')
        result = compile_request(CompilationRequest.model_validate(raw), self.registry)
        self.assertEqual(result.segments, [])
        self.assertIn('unsupported_action', [g['code'] for g in result.gaps])


if __name__ == '__main__':
    unittest.main()
