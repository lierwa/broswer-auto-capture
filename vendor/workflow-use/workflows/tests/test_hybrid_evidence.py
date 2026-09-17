"""H3 invariants: public registry, lossless proposals, causality, and independent coverage."""
import contextlib
import io
import json
import unittest
from pathlib import Path

from browser_use.tools.service import Tools
from workflow_use.healing.deterministic_converter import DeterministicWorkflowConverter
from workflow_use.hybrid.coverage import validate_coverage
from workflow_use.hybrid.evidence import ActionCoverage, EvidenceRef, NormalizedTrace, TraceSource, digest
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history, structure_fixture_input
from workflow_use.hybrid.registry import ActionRegistry

ROOT = Path(__file__).resolve().parents[4]
REF = EvidenceRef(ref='fixture:redaction', digest='0' * 64)


def history(actions, results=None):
    actual = results if results is not None else [ResultEvidence(errorPresent=False, ref=REF) for _ in actions]
    return HistoryInput(source=TraceSource(version='0.13.8', historyRef='fixture:history'), judged=True, completed=True,
                        records=[HistoryRecord(stepIndex=0, actions=actions, results=actual)],
                        observations=[], redactionManifestRef=REF, finalResultRef=REF)


class EvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = ActionRegistry.from_tools(Tools())

    def test_registry_is_public_schema_and_rejects_invalid_args(self):
        self.assertIn('click', self.registry.names)
        self.assertIn('evaluate', self.registry.names)
        self.registry.validate_action('click', {'index': 1})
        with self.assertRaises(Exception):
            self.registry.validate_action('click', {'index': -1})
        for args in ({'url': 'https://fixture.invalid/', 'unexpected': 'ignored'},
                     {'url': 'https://fixture.invalid/', 'new_tab': 0}):
            with self.subTest(args=args), self.assertRaises(Exception):
                self.registry.validate_action('navigate', args)
        self.assertEqual(self.registry.schemaDigest, ActionRegistry.from_tools(Tools()).schemaDigest)

    def test_unknown_action_retained_with_gap_instead_of_converter_skip(self):
        trace, issues = normalize_history(history([{'future_action': {}}]), self.registry)
        self.assertEqual(trace.actions[0].name, 'future_action')
        self.assertIn('unsupported_action', [g.code for g in issues])
        converter = DeterministicWorkflowConverter()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertIsNone(converter._convert_action_to_step('future_action', {}, None, {}))

    def test_real_structural_fixtures_preserve_every_action_in_order(self):
        for name in ('short', 'full'):
            with self.subTest(name=name):
                fixture = json.loads((ROOT / f'apps/api/tests/fixtures/workflow-use-hybrid/{name}.json').read_text())
                trace, issues = normalize_history(structure_fixture_input(fixture, REF), self.registry)
                expected = [next(iter(action)) for step in fixture['history'] for action in step['actions']]
                self.assertEqual([a.name for a in trace.actions], expected)
                self.assertTrue(issues)
                self.assertFalse(trace.judged)
                self.assertEqual(trace.digest, normalize_history(structure_fixture_input(fixture, REF), self.registry)[0].digest)

    def test_unpaired_proposal_never_becomes_success(self):
        source = history([{'click': {'index': 1}}, {'click': {'index': 2}}],
                         [ResultEvidence(errorPresent=False, ref=REF)])
        trace, _ = normalize_history(source, self.registry)
        self.assertEqual([a.status for a in trace.actions], ['succeeded', 'proposed'])
        source.records[0].results[0].errorPresent = True
        trace, _ = normalize_history(source, self.registry)
        self.assertEqual([a.status for a in trace.actions], ['proposed', 'proposed'])

    def test_multiple_action_fields_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exactly_one'):
            normalize_history(history([{'click': {'index': 1}, 'go_back': {}}]), self.registry)

    def test_missing_post_observation_is_gap(self):
        _, issues = normalize_history(history([{'click': {'index': 1}}]), self.registry)
        self.assertIn('missing_postcondition', [g.code for g in issues])

    def test_tampered_digest_and_action_order_rejected(self):
        trace, _ = normalize_history(history([{'click': {'index': 1}}]), self.registry)
        body = trace.model_dump()
        body['actions'][0]['args'] = {'index': 2}
        with self.assertRaisesRegex(ValueError, 'trace_digest_mismatch'):
            NormalizedTrace.model_validate(body)
        body['digest'] = digest({k: v for k, v in body.items() if k != 'digest'})
        body['actions'][0]['id'] = 'a-0002'
        body['digest'] = digest({k: v for k, v in body.items() if k != 'digest'})
        with self.assertRaisesRegex(ValueError, 'action_order'):
            NormalizedTrace.model_validate(body)

    def test_duplicate_coverage_and_side_effect_exclusion_rejected(self):
        trace, _ = normalize_history(history([{'click': {'index': 1}}]), self.registry)
        row = ActionCoverage(actionRef='a-0001', disposition='agent_internal',
                             exclusionRule='agent_done_metadata/v1', evidenceRefs=[REF])
        reasons = [g.reason for g in validate_coverage(trace, [row, row], set())]
        self.assertIn('invalid_exclusion', reasons)
        self.assertIn('unknown_or_duplicate_owner', reasons)
        self.assertTrue(validate_coverage(trace, [], set()))


if __name__ == '__main__':
    unittest.main()
