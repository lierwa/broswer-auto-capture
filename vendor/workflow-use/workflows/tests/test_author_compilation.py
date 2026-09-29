"""Native callback -> real collector snapshot -> compiler -> awaited host boundary."""
import asyncio
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

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
        self.assertTrue(packets[0]['response']['compilation']['gaps'])
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
        compilation = packets[0]['response']['compilation']
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
        self.assertEqual(len(packets[0]['response']['compilation']['segments']), 1)
        self.assertFalse(json.loads(packets[0]['canonicalRequest'])['trace']['completed'])
        saved.set()
        await task
        self.assertFalse(callbacks.failed)
        agent.stop.assert_not_called()

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
