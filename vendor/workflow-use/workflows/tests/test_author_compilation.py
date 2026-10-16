"""Native callback -> real collector snapshot -> compiler -> awaited host boundary."""
import asyncio
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from browser_use.agent.views import ActionResult
from workflow_use.hybrid.author_compilation import AuthorCompilation
from workflow_use.hybrid.author_callbacks import AuthorCaptureCallbacks, AuthorCaptureStopped
from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.evidence import gap
from workflow_use.hybrid.selection_tool import PreparedSelections
from test_method_source_compile import method_source, reference


def fixture(exchange):
    request, registry, schema, _read = method_source()
    author = SimpleNamespace(requirementId=request.requirement.id, requirementVersion=request.requirement.version,
        requirementText=request.requirement.text, task=request.requirement.taskText,
        requirementDigest=request.requirement.sourceDigest, planId=request.plan.id, planVersion=request.plan.version,
        planDigest=request.plan.sourceDigest, stepId=request.plan.stepId, callMode=request.plan.callMode,
        entryUrls=request.plan.entryUrls, inputSchema=request.runtimeInputSchema, outputSchema=schema,
        resultSpec=request.plan.resultSpec)
    collector = EvidenceCollector(object(), registry, put_evidence=lambda _kind, value: reference(value),
        redact_action=copy.deepcopy, output_schema=schema)
    action = request.trace.actions[0]
    history = SimpleNamespace(history=[SimpleNamespace(model_output=SimpleNamespace(action=[SimpleNamespace(
        model_dump=lambda **_: {action.name: action.args})]), result=[ActionResult(extracted_content='read')])])
    collector.observations = copy.deepcopy(request.trace.observations[:2])
    collector.links = {(0, 0, 'pre'): 'o-0001', (0, 0, 'post'): 'o-0002'}
    collector.results = {(0, 0): action.resultRef}
    live = AuthorCompilation(author, collector, PreparedSelections(), exchange, reference('redaction'))
    callbacks = AuthorCaptureCallbacks(collector, lambda: registry, normalize_action=lambda _: None,
        action_outcomes={}, reject_navigation_scope=lambda _: None, compilation=live)
    agent = SimpleNamespace(history=history, stop=Mock())
    callbacks.bind(agent)
    return live, callbacks, agent, request


class AuthorCompilationTests(unittest.IsolatedAsyncioTestCase):
    async def test_compilation_gap_is_saved_without_stopping_native_agent(self):
        packets = []
        async def exchange(payload, _compilation):
            packets.append(json.loads(payload))
        live, callbacks, agent, _request = fixture(exchange)
        live.collector.source_gaps.append(gap('missing_binding', ['a-0001'], 'selection_annotation_unavailable'))
        await callbacks.after_step(agent)
        self.assertTrue(packets[0]['candidate']['response']['compilation']['gaps'])
        self.assertIsNone(live.failure)
        self.assertFalse(callbacks.failed)
        agent.stop.assert_not_called()
        live.before_action({'click': {'index': 1}})

    async def test_native_model_error_without_action_saves_empty_prefix_and_allows_native_retry(self):
        packets = []
        async def exchange(payload, _compilation):
            packets.append(json.loads(payload))
        live, callbacks, agent, _request = fixture(exchange)
        live.collector.observations.clear(); live.collector.links.clear(); live.collector.results.clear()
        agent.history.history = [SimpleNamespace(model_output=None, result=[ActionResult(error='invalid model output')],
            state=SimpleNamespace(url='https://example.test/list', tabs=[SimpleNamespace(
                url='https://example.test/list', target_id='tab-1')]))]
        await callbacks.after_step(agent)
        compilation = packets[0]['candidate']['response']['compilation']
        self.assertEqual(compilation['segments'], [])
        self.assertEqual(compilation['coverage'], [])
        self.assertEqual(compilation['gaps'], [])
        self.assertFalse(callbacks.failed)
        agent.stop.assert_not_called()

    async def test_callback_waits_for_saved_real_read_node(self):
        packets, saved = [], asyncio.Event()
        async def exchange(payload, _compilation):
            packets.append(json.loads(payload))
            await saved.wait()
        live, callbacks, agent, _request = fixture(exchange)
        task = asyncio.create_task(callbacks.after_step(agent))
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        self.assertEqual(packets[0]['phase'], 'prefix')
        self.assertEqual(len(packets[0]['candidate']['response']['compilation']['segments']), 1)
        self.assertFalse(json.loads(packets[0]['canonicalRequest'])['trace']['completed'])
        saved.set()
        await task
        self.assertFalse(callbacks.failed)
        agent.stop.assert_not_called()

    async def test_candidate_exception_keeps_real_source_and_allows_next_native_step(self):
        packets = []
        async def exchange(payload, compilation):
            packets.append(json.loads(payload))
            self.assertEqual(compilation, {'segments': []})
        live, callbacks, agent, _request = fixture(exchange)
        with patch('workflow_use.hybrid.author_compilation.compile_natural_prefix', side_effect=RuntimeError('internal')):
            await callbacks.after_step(agent)
        self.assertEqual(packets[0]['candidate'], {'kind': 'error', 'stage': 'compile',
                                                  'code': 'hybrid_native_compilation_failed'})
        source = json.loads(packets[0]['canonicalRequest'])
        self.assertEqual(len(source['trace']['actions']), 1)
        self.assertIsNone(live.failure)
        self.assertFalse(callbacks.failed)
        agent.stop.assert_not_called()
        live.before_action({'click': {'index': 1}})

    async def test_source_failure_cannot_be_misclassified_as_candidate_failure(self):
        packets = []
        async def exchange(payload, _compilation): packets.append(json.loads(payload))
        live, callbacks, agent, _request = fixture(exchange)
        with patch.object(live.collector, 'snapshot', side_effect=ValueError('source invalid')):
            with self.assertRaisesRegex(AuthorCaptureStopped, 'hybrid_compilation_source_invalid'):
                await callbacks.after_step(agent)
        self.assertEqual(packets, [])
        self.assertEqual(live.failure, 'hybrid_compilation_source_invalid')
        agent.stop.assert_called_once()

    async def test_final_candidate_exception_preserves_completed_source_and_has_no_stop(self):
        packets = []
        async def exchange(payload, _compilation): packets.append(json.loads(payload))
        live, _callbacks, _agent, request = fixture(exchange)
        original, gaps = request.model_dump(), []
        with patch('workflow_use.hybrid.author_compilation.compilation_response', side_effect=ValueError('compile')):
            await live.finish(request, gaps)
        self.assertEqual(request.model_dump(), original)
        self.assertEqual(gaps, [])
        self.assertIsNone(live.failure)
        self.assertEqual(packets[0]['phase'], 'final')
        self.assertTrue(json.loads(packets[0]['canonicalRequest'])['trace']['completed'])
        self.assertEqual(packets[0]['candidate']['kind'], 'error')

    async def test_annotation_failure_is_attempted_once_per_stable_action(self):
        async def exchange(_payload, _compilation): pass
        live, _callbacks, _agent, request = fixture(exchange)
        live.selection_model = object()
        trace = request.trace.model_copy(deep=True)
        trace.actions[0] = trace.actions[0].model_copy(update={'name': 'navigate',
            'args': {'url': 'https://example.test/', 'new_tab': False}})
        live.collector.observations = copy.deepcopy(trace.observations)
        attempts = []
        async def annotate(_request, source, _model, *, skip_action_refs):
            if source.actions[0].id not in skip_action_refs:
                attempts.append(source.actions[0].id)
                raise ValueError('annotation provider failure')
            return source, []
        with patch('workflow_use.hybrid.author_compilation.annotate_selections', side_effect=annotate):
            with self.assertRaises(ValueError): await live.annotate(trace)
            await live.annotate(trace)
        self.assertEqual(attempts, ['a-0001'])

    async def test_final_annotation_exception_hands_off_source_with_candidate_error(self):
        from workflow_use.hybrid.author import finish_author_source
        packets = []
        async def exchange(payload, _compilation): packets.append(json.loads(payload))
        live, _callbacks, _agent, request = fixture(exchange)
        tools = SimpleNamespace(_bat_selections=PreparedSelections())
        output = next(f.value['output'] for o in request.trace.observations for f in o.facts
                      if f.kind == 'verified_natural_read')
        with patch('workflow_use.hybrid.author.annotate_repeat_method', side_effect=ValueError('annotation')):
            result = await finish_author_source(tools, live.request, request.trace, [], live.collector.registry,
                                                output, True, {'semantic_annotation': object()}, live)
        self.assertTrue(json.loads(result['canonicalRequest'])['trace']['completed'])
        self.assertEqual(result['output'], output)
        self.assertEqual(packets[0]['candidate'], {'kind': 'error', 'stage': 'annotation',
                                                  'code': 'hybrid_semantic_annotation_failed'})
        self.assertEqual(len(packets), 1)

    async def test_save_failure_stops_native_agent_with_its_own_layer(self):
        async def exchange(_payload, _compilation):
            raise ValueError('hybrid_compilation_host_rejected')
        live, callbacks, agent, _request = fixture(exchange)
        with self.assertRaisesRegex(AuthorCaptureStopped, 'hybrid_compilation_host_rejected'):
            await callbacks.after_step(agent)
        self.assertEqual(callbacks.collector.source_gaps[-1].reason, 'hybrid_compilation_host_rejected')
        agent.stop.assert_called_once()
        self.assertEqual(len(callbacks.collector.observations), 2)

    async def test_final_rejection_keeps_source_and_adds_fixed_gap(self):
        async def exchange(_payload, _compilation):
            raise ValueError('hybrid_compilation_ack_timeout')
        live, _callbacks, _agent, request = fixture(exchange)
        before, gaps = request.model_dump(), []
        await live.finish(request, gaps)
        self.assertEqual(request.model_dump(), before)
        self.assertEqual(gaps[0].reason, 'hybrid_compilation_ack_timeout')


if __name__ == '__main__':
    unittest.main()
