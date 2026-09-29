"""Snapshot purity and stable observation identity across native model retries."""
import asyncio
import copy
import unittest
from types import SimpleNamespace

from browser_use.agent.views import ActionResult
from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.selection_tool import PreparedSelections
from test_method_source_compile import method_source, reference
from test_prepared_selection_dispatch import fixture
from test_prior_read_bindings import read_fact


class CapturePrefixTests(unittest.TestCase):
    def test_execution_only_final_preserves_online_prior_read_binding(self):
        collector, request = self.collector()
        collector.observations = copy.deepcopy(request.trace.observations[:2])
        source, destination = collector.observations
        source.facts = [read_fact('prior-url', [{'title': 'Next', 'url': 'https://example.test/2'}])]
        destination.facts = []
        collector.links = {(0, 0, 'post'): source.id, (1, 0, 'pre'): destination.id}
        def action(name, args):
            return SimpleNamespace(model_dump=lambda **_: {name: args})
        history = SimpleNamespace(history=[
            SimpleNamespace(model_output=SimpleNamespace(action=[action('find_elements', {})]),
                            result=[ActionResult(extracted_content='read')]),
            SimpleNamespace(model_output=SimpleNamespace(action=[action('navigate', {'url': 'https://example.test/2'})]),
                            result=[ActionResult(extracted_content='navigated')])])
        args = {'history_ref': 'fixture:prefix', 'redaction_manifest': reference('redaction')}
        prefix, _ = collector.snapshot(history, **args)
        final, _, _ = collector.finish(history, final_output=None, source_completed=True, **args)
        def bindings(trace):
            return [fact for observation in trace.observations for fact in observation.facts
                    if fact.kind == 'natural_binding']
        self.assertEqual(len(bindings(prefix)), 1)
        self.assertEqual(bindings(final), bindings(prefix))

    def collector(self):
        request, registry, _schema, _read = method_source()
        collector = EvidenceCollector(object(), registry, put_evidence=lambda _kind, value: reference(value),
            redact_action=copy.deepcopy, output_schema=request.plan.resultSpec.schemaValue)
        return collector, request

    def test_snapshot_is_non_terminal_pure_and_pending_is_never_consumed(self):
        collector, request = self.collector()
        action = request.trace.actions[0]
        history = SimpleNamespace(history=[SimpleNamespace(model_output=SimpleNamespace(action=[SimpleNamespace(
            model_dump=lambda **_: {action.name: action.args})]), result=[ActionResult(extracted_content='read')])])
        collector.observations = copy.deepcopy(request.trace.observations[:2])
        collector.links = {(0, 0, 'pre'): 'o-0001', (0, 0, 'post'): 'o-0002'}
        collector.results = {(0, 0): action.resultRef}
        before = copy.deepcopy((collector.observations, collector.links, collector.results))
        args = {'history_ref': 'fixture:prefix', 'redaction_manifest': reference('redaction')}
        first, gaps = collector.snapshot(history, **args)
        second, _ = collector.snapshot(history, **args)
        self.assertEqual(gaps, [])
        self.assertEqual(first, second)
        self.assertFalse(first.completed)
        self.assertIsNone(first.finalResultRef)
        self.assertEqual((collector.observations, collector.links, collector.results), before)
        collector.pending = {'action': 'not finished'}
        with self.assertRaisesRegex(ValueError, 'prefix_capture_incomplete'):
            collector.snapshot(history, **args)
        self.assertEqual(collector.pending, {'action': 'not finished'})

    def test_native_model_error_keeps_one_stable_observation_without_an_action(self):
        collector, request = self.collector()
        url = request.trace.observations[0].url
        history = SimpleNamespace(history=[SimpleNamespace(model_output=None,
            result=[ActionResult(error='model parse error')],
            state=SimpleNamespace(url=url, tabs=[SimpleNamespace(url=url, target_id='tab-1')]))])
        args = {'history_ref': 'fixture:prefix', 'redaction_manifest': reference('redaction')}
        collector.retain_history_evidence(history, **args)
        first, gaps = collector.snapshot(history, **args)
        self.assertEqual(gaps, [])
        self.assertEqual(first.actions, [])
        self.assertEqual(len(first.observations), 1)
        for index in range(2):
            item = request.trace.observations[index].model_copy(deep=True)
            item.id, item.sequence = f'o-{index + 2:04d}', index + 1
            collector.observations.append(item)
        collector.retain_history_evidence(history, **args)
        second, _ = collector.snapshot(history, **args)
        self.assertEqual(second.observations[0], first.observations[0])
        self.assertEqual(len(second.observations), 3)

    def test_prepared_selection_attachment_is_idempotent_and_rejects_conflicts(self):
        _, trace, _ = fixture()
        original = copy.deepcopy(trace)
        prepared = PreparedSelections()
        prepared.request = SimpleNamespace(requirementDigest='a' * 64)
        prepared.clicks = {'o-0002': {'readFactRef': 'read-proof', 'draft': {'source': 'original'}}}
        first = prepared.attach(trace)
        self.assertEqual(prepared.attach(first), first)
        self.assertEqual(trace, original)
        prepared.clicks['o-0002']['draft'] = {'source': 'changed'}
        with self.assertRaisesRegex(ValueError, 'snapshot_conflict'):
            prepared.attach(first)


if __name__ == '__main__':
    unittest.main()
