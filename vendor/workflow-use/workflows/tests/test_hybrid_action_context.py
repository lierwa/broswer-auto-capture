"""A action identity, event target and public-result evidence contracts."""
import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.agent.views import ActionResult
from browser_use.tools.service import Tools
from cdp_use.cdp.registry import EventRegistry
from pydantic import BaseModel

from workflow_use.hybrid.action_capture_policy import ACTION_CAPTURE_POLICIES, action_capture_policy
from workflow_use.hybrid.action_dispatch import ActionDispatchAudit, bind_tools_act, not_dispatched_coverage
from workflow_use.hybrid.author import author_tools
from workflow_use.hybrid.browser_context import browser_context_value
from workflow_use.hybrid.dialog_event_bridge import DialogEventBridge
from workflow_use.hybrid.evidence import (
    EvidenceRef,
    NormalizedObservation,
    ObservationFact,
    NormalizedTrace,
    TraceSource,
    digest,
)
from workflow_use.hybrid.history import from_agent_history
from workflow_use.hybrid.normalize import normalize_history
from workflow_use.hybrid.native_event_capture import NativeEventCapture
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.snapshot_consistency import (
    ObservationStateTransitionPending,
    _RetryPolicy,
    capture_consistent_post_snapshot,
    resolve_closed_target_id,
)


class EventCaptureFixture:
    async def arm(self, action_name, target):
        self.armed = (action_name, target)
        self.expectation = action_capture_policy(action_name).event_expectation
        return {'status': 'armed', 'eventExpectation': self.expectation,
                'events': [], 'limitations': []}

    async def complete(self):
        return {'status': 'captured', 'eventExpectation': self.expectation,
                'limitations': [], 'events': [{
            'sequence': 0, 'documentId': 'document-live',
            'scope': {'url': 'https://fixture.invalid/action?value=raw#part',
                      'urlDigest': '2' * 64, 'isTop': True, 'targetId': 'tab-live',
                      'sessionId': 'session-live', 'frameId': 'frame-live',
                      'executionContextId': 7, 'contextUniqueId': 'context-live'},
            'event': {'type': 'click', 'isTrusted': True},
            'graph': {'targetRef': 'n-actual', 'composedPath': [
                {'kind': 'element', 'ref': 'n-actual'}, {'kind': 'element', 'ref': 'n-button'}],
                'nodes': [{'id': 'n-actual', 'tag': 'span', 'parentRef': 'n-button',
                           'childrenRefs': [], 'attributes': {'data-value': 'raw'},
                           'properties': {}, 'directText': 'Open',
                           'namespace': 'http://www.w3.org/1999/xhtml', 'assignedSlotRef': None,
                           'root': {'kind': 'document', 'mode': None, 'hostRef': None}}]},
            'limitations': []}]}


class ActionContextTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.registry = ActionRegistry.from_tools(Tools())
        self.stored = []

    def put(self, kind, value):
        self.stored.append((kind, value))
        return EvidenceRef(ref=f'fixture:{kind}:{len(self.stored)}', digest=digest(value))

    async def test_formal_author_registry_has_an_explicit_capture_policy_for_every_action(self):
        class Output(BaseModel):
            status: str

        schema = {'type': 'object', 'properties': {'status': {'type': 'string'}},
                  'required': ['status'], 'additionalProperties': False}
        registry = ActionRegistry.from_tools(author_tools(Output, schema))

        self.assertEqual(set(registry.names), set(ACTION_CAPTURE_POLICIES))
        self.assertEqual(action_capture_policy('scroll').event_expectation, 'optional')
        self.assertEqual(action_capture_policy('select_dropdown').event_expectation, 'required')
        self.assertEqual(action_capture_policy('switch').boundary, 'tab')

    async def test_public_browser_context_keeps_tabs_scroll_and_closed_dialogs(self):
        summary = SimpleNamespace(tabs=[SimpleNamespace(target_id='tab-a', url='https://fixture.invalid/a'),
            SimpleNamespace(target_id='tab-b', url='https://fixture.invalid/b')],
            page_info=SimpleNamespace(scroll_x=0, scroll_y=720, pixels_above=720, pixels_below=100,
                                      viewport_width=1280, viewport_height=720),
            closed_popup_messages=['[confirm] confirm-token', '[prompt] prompt-token'])

        value = browser_context_value(summary, 'tab-b')

        self.assertEqual(value['focusTargetId'], 'tab-b')
        self.assertEqual([item['targetId'] for item in value['tabs']], ['tab-a', 'tab-b'])
        self.assertEqual(value['viewport']['scrollY'], 720)
        self.assertEqual(value['closedPopupMessages'],
                         ['[confirm] confirm-token', '[prompt] prompt-token'])

    async def test_exact_position_joins_intent_actual_event_and_public_result(self):
        capture = EventCaptureFixture()
        audit = ActionDispatchAudit(capture)
        action = self.registry.validate_action('click', {'index': 8})
        raw = action.model_dump(exclude_unset=True)
        audit.propose(11, 0, raw, {'targetId': 'tab-live', 'frameId': 'frame-live'})
        await audit.enter(raw)
        result = ActionResult(extracted_content='clicked raw value', metadata={'coordinates': [4, 8]})
        await audit.complete(result)
        audit.close()
        exact_result = result.model_dump(mode='json')
        result.extracted_content = 'agent history enrichment'
        history = history_fixture(action, result, 11)
        structure = {'schemaVersion': 'bat.dom-structure/v1', 'actionRef': 'a-0001',
                     'targetRef': 'n-intended'}
        structure_ref = self.put('dom-structure', structure)
        observation = observation_fixture(ObservationFact(id='fact-' + structure_ref.digest,
            kind='dom_structure', value=structure, sourceRefs=[structure_ref]))
        post = observation_fixture(observation_id='o-0002', sequence=1)
        imported = from_agent_history(history, source=TraceSource(version=self.registry.providerVersion,
            historyRef='fixture:action-context'), judged=True,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64),
            redact_action=lambda value: value,
            store_result=lambda _step, _index, value: self.put('action-result', value.model_dump(mode='json')),
            observations=[observation, post], observation_links={(0, 0, 'pre'): observation.id,
                (0, 0, 'post'): post.id},
            final_result_ref=None, put_evidence=self.put, dispatch_audit=audit)

        trace, gaps = normalize_history(imported, self.registry)

        self.assertFalse(gaps)
        self.assertEqual(trace.actions[0].args, {'index': 8})
        self.assertEqual(trace.actions[0].resultRef.digest, digest(exact_result))
        facts = {fact.kind: fact for fact in trace.observations[0].facts}
        self.assertTrue(facts['native_action_dispatch'].value['entered'])
        self.assertEqual(facts['native_action_dispatch'].value['eventCapture']['eventCount'], 1)
        self.assertEqual(facts['native_action_result'].value['result'], exact_result)
        event = facts['native_dom_event'].value
        self.assertEqual(event['intentTargetRef'], 'n-intended')
        self.assertEqual(event['actual']['graph']['targetRef'], 'n-actual')
        self.assertEqual(event['actual']['graph']['nodes'][0]['attributes']['data-value'], 'raw')
        self.assertEqual(capture.armed, ('click', {'targetId': 'tab-live', 'frameId': 'frame-live'}))

        tampered = trace.model_dump(mode='json')
        target = next(fact for fact in tampered['observations'][0]['facts']
                      if fact['kind'] == 'native_action_result')
        target['value']['result']['extracted_content'] = 'changed'
        tampered['digest'] = digest({key: value for key, value in tampered.items() if key != 'digest'})
        with self.assertRaisesRegex(ValueError, 'fact_source_digest_mismatch'):
            NormalizedTrace.model_validate(tampered)

    async def test_repeated_parameters_keep_native_positions_and_missing_event_is_explicit(self):
        capture = EventCaptureFixture()
        audit = ActionDispatchAudit(capture)
        action = self.registry.validate_action('click', {'index': 8})
        raw = action.model_dump(exclude_unset=True)
        results = [ActionResult(extracted_content='first'), ActionResult(error='target disappeared')]
        for step, result in enumerate(results, start=1):
            audit.propose(step, 0, raw)
            if step == 1:
                await audit.enter(raw)
                await audit.complete(result)
            audit.close()
        history = SimpleNamespace(history=[history_item(action, results[0], 1), history_item(action, results[1], 2)],
            is_done=lambda: False, is_successful=lambda: False, is_validated=lambda: False)

        resolved, invalid = audit.resolve(history)

        self.assertFalse(invalid)
        self.assertEqual(resolved[(0, 0)]['actionRef'], 'a-0001')
        self.assertEqual(resolved[(1, 0)]['actionRef'], 'a-0002')
        self.assertTrue(resolved[(0, 0)]['entered'])
        self.assertFalse(resolved[(1, 0)]['entered'])
        self.assertEqual(resolved[(1, 0)]['eventCapture']['status'], 'not_dispatched')

    async def test_not_dispatched_failure_has_separate_dispatch_and_result_evidence(self):
        audit = ActionDispatchAudit(EventCaptureFixture())
        action = self.registry.validate_action('click', {'index': 99})
        raw = action.model_dump(exclude_unset=True)
        audit.propose(3, 0, raw)
        audit.close()
        result = ActionResult(error='native target unavailable')
        history = history_fixture(action, result, 3)
        observation = observation_fixture()
        exact_result = result.model_dump(mode='json')
        imported = from_agent_history(history, source=TraceSource(version=self.registry.providerVersion,
            historyRef='fixture:not-dispatched'), judged=False,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64),
            redact_action=lambda value: value,
            store_result=lambda _step, _index, _result: self.put('action-result', exact_result),
            observations=[observation], observation_links={(0, 0, 'pre'): observation.id},
            final_result_ref=None, put_evidence=self.put, dispatch_audit=audit)
        trace, gaps = normalize_history(imported, self.registry)

        self.assertFalse(gaps)
        dispatch = next(fact for fact in trace.observations[0].facts if fact.kind == 'native_action_dispatch')
        public = next(fact for fact in trace.observations[0].facts if fact.kind == 'native_action_result')
        self.assertFalse(dispatch.value['entered'])
        self.assertEqual(dispatch.value['eventCapture']['status'], 'not_dispatched')
        self.assertEqual(public.value['result']['error'], 'native target unavailable')
        self.assertIsNotNone(not_dispatched_coverage(trace, trace.actions[0]))

    async def test_dispatched_event_is_retained_when_public_result_is_missing(self):
        capture = EventCaptureFixture()
        audit = ActionDispatchAudit(capture)
        action = self.registry.validate_action('click', {'index': 8})
        raw = action.model_dump(exclude_unset=True)
        audit.propose(4, 0, raw)
        await audit.enter(raw)
        await audit.complete()
        audit.close()
        history = SimpleNamespace(history=[SimpleNamespace(model_output=SimpleNamespace(action=[action]),
            result=[], metadata=SimpleNamespace(step_number=4))], is_done=lambda: False,
            is_successful=lambda: False, is_validated=lambda: False)
        observation = observation_fixture()
        imported = from_agent_history(history, source=TraceSource(version=self.registry.providerVersion,
            historyRef='fixture:missing-result'), judged=False,
            redaction_manifest=EvidenceRef(ref='fixture:redaction', digest='1' * 64),
            redact_action=lambda value: value,
            store_result=lambda _step, _index, value: self.put('action-result', value.model_dump(mode='json')),
            observations=[observation], observation_links={(0, 0, 'pre'): observation.id},
            final_result_ref=None, put_evidence=self.put, dispatch_audit=audit)

        kinds = [fact.kind for fact in imported.observations[0].facts]
        self.assertIn('native_action_dispatch', kinds)
        self.assertIn('native_dom_event', kinds)
        self.assertNotIn('native_action_result', kinds)
        self.assertIn('native_action_result_not_received', [item.reason for item in imported.importGaps])

    async def test_native_capture_reuses_one_session_owner_per_target(self):
        class Browser:
            agent_focus_target_id = 'target-live'
            calls = 0

            async def get_or_create_cdp_session(inner, *, target_id, focus):
                inner.calls += 1
                return SimpleNamespace(target_id=target_id, session_id=f'session-{inner.calls}')

        browser = Browser()
        capture = NativeEventCapture(browser)
        first, _ = await capture._action_sessions('click', None)
        second, _ = await capture._action_sessions('click', None)

        self.assertEqual(browser.calls, 1)
        self.assertIs(first[0], second[0])

    async def test_native_capture_ignores_other_session_fanout_and_deduplicates_payload(self):
        capture = NativeEventCapture(SimpleNamespace())
        capture.sessions['session-owner'] = {'targetId': 'target-live'}
        capture.active = {'eventTypes': frozenset({'click'}), 'eventExpectation': 'required',
                          'events': [], 'limitations': [],
                          'sessionIds': ['session-owner'], 'intendedFrames': {}, 'seenPayloads': {}}
        payload = {'schemaVersion': 'bat.native-dom-event-payload/v2', 'sequence': 4,
                   'documentId': 'document-live', 'scope': {'url': 'https://fixture.invalid/', 'isTop': True},
                   'event': {'type': 'click', 'isTrusted': True},
                   'graph': {'targetRef': None, 'composedPath': [], 'nodes': []}}
        event = {'name': capture.binding, 'payload': json.dumps(payload), 'executionContextId': 7}

        await capture._on_binding_called(event, 'session-other')
        await capture._on_binding_called(event, 'session-owner')
        await capture._on_binding_called(event, 'session-owner')

        self.assertEqual(len(capture.active['events']), 1)
        self.assertEqual(capture.active['events'][0]['actionSequence'], 0)
        self.assertEqual(capture.active['events'][0]['scope']['sessionId'], 'session-owner')

    async def test_delivery_barrier_uses_the_canonical_session_owned_by_target(self):
        calls = []

        class Runtime:
            async def evaluate(inner, *, params, session_id):
                calls.append((params, session_id))

        capture = NativeEventCapture(SimpleNamespace())
        capture.client = SimpleNamespace(send=SimpleNamespace(Runtime=Runtime()))
        capture.installed['target-live'] = {'targetId': 'target-live',
                                            'sessionId': 'session-owner', 'identifier': 'script'}
        active = {'sessionIds': ['session-owner'], 'limitations': []}

        await capture._barrier(active)

        self.assertEqual(calls, [({'expression': 'void 0', 'returnByValue': True}, 'session-owner')])
        self.assertEqual(active['limitations'], [])

    async def test_dialog_bridge_releases_the_cdp_receiver_before_native_handler_sends(self):
        registry = EventRegistry()
        command_response = asyncio.Event()
        handler_finished = asyncio.Event()

        async def native_dialog_handler(_params, _session_id):
            await command_response.wait()
            handler_finished.set()

        registry.register('Page.javascriptDialogOpening', native_dialog_handler)
        browser = SimpleNamespace(cdp_client=SimpleNamespace(_event_registry=registry))
        bridge = DialogEventBridge(browser)
        bridge.start()
        try:
            handled = await asyncio.wait_for(registry.handle_event(
                'Page.javascriptDialogOpening', {'type': 'confirm'}, 'session-live'), timeout=0.1)
            self.assertTrue(handled)
            self.assertFalse(handler_finished.is_set())

            # Models the CDP response that only the now-released receiver can deliver.
            command_response.set()
            await bridge.settle()
            self.assertTrue(handler_finished.is_set())
        finally:
            await bridge.close()

        self.assertIs(registry._handlers['Page.javascriptDialogOpening'], native_dialog_handler)

    async def test_dialog_bridge_wraps_future_popup_registration_but_not_other_events(self):
        registry = EventRegistry()
        browser = SimpleNamespace(cdp_client=SimpleNamespace(_event_registry=registry))
        bridge = DialogEventBridge(browser)
        bridge.start()
        dialog_release, other_release = asyncio.Event(), asyncio.Event()
        dialog_started, other_started = asyncio.Event(), asyncio.Event()

        async def later_dialog_handler(_params, _session_id):
            dialog_started.set()
            await dialog_release.wait()

        async def other_handler(_params, _session_id):
            other_started.set()
            await other_release.wait()

        try:
            registry.register('Page.javascriptDialogOpening', later_dialog_handler)
            registry.register('Runtime.bindingCalled', other_handler)
            dialog_dispatch = asyncio.create_task(registry.handle_event(
                'Page.javascriptDialogOpening', {}, 'session-live'))
            other_dispatch = asyncio.create_task(registry.handle_event(
                'Runtime.bindingCalled', {}, 'session-live'))
            await dialog_started.wait()
            await other_started.wait()

            self.assertTrue((await asyncio.wait_for(dialog_dispatch, timeout=0.1)))
            self.assertFalse(other_dispatch.done())
            dialog_release.set()
            other_release.set()
            await bridge.settle()
            self.assertTrue((await asyncio.wait_for(other_dispatch, timeout=0.1)))
        finally:
            await bridge.close()

        self.assertIs(registry._handlers['Page.javascriptDialogOpening'], later_dialog_handler)

    async def test_native_dispatch_settles_dialog_before_event_delivery_barrier(self):
        calls = []

        class Audit:
            active = (7, 0)

            async def enter(inner, _raw):
                calls.append('enter')

            async def complete(inner, _result=None):
                calls.append('event-barrier')

        class ToolOwner:
            async def act(inner, *_args, **_kwargs):
                calls.append('native-action')
                return SimpleNamespace(error=None)

        async def settle():
            calls.append('dialog-settle')

        tools = ToolOwner()
        original = tools.act
        restore = bind_tools_act(tools, Audit(), settle_dispatch=settle)
        try:
            action = SimpleNamespace(model_dump=lambda **_kwargs: {'click': {'index': 4}})
            await tools.act(action=action)
        finally:
            restore()

        self.assertEqual(calls, ['enter', 'native-action', 'dialog-settle', 'event-barrier'])
        self.assertEqual(tools.act, original)

    async def test_dialog_bridge_coalesces_one_dialog_fanned_out_to_multiple_target_sessions(self):
        registry = EventRegistry()
        release = asyncio.Event()
        started = asyncio.Event()
        calls = []

        async def native_dialog_handler(params, session_id):
            calls.append((params['message'], session_id))
            started.set()
            await release.wait()

        class Sessions:
            def get_target_id_from_session_id(inner, _session_id):
                return 'target-dialog'

        registry.register('Page.javascriptDialogOpening', native_dialog_handler)
        browser = SimpleNamespace(cdp_client=SimpleNamespace(_event_registry=registry), session_manager=Sessions())
        bridge = DialogEventBridge(browser)
        bridge.start()
        params = {'type': 'confirm', 'message': 'same logical dialog', 'url': 'https://fixture.invalid/dialog'}
        try:
            self.assertTrue(await registry.handle_event('Page.javascriptDialogOpening', params, 'session-a'))
            self.assertTrue(await registry.handle_event('Page.javascriptDialogOpening', params, 'session-b'))
            await started.wait()
            self.assertEqual(calls, [('same logical dialog', 'session-a')])
            release.set()
            await bridge.settle()

            self.assertTrue(await registry.handle_event('Page.javascriptDialogOpening', params, 'session-a'))
            await bridge.settle()
            self.assertEqual(len(calls), 2)
        finally:
            await bridge.close()

    async def test_close_snapshot_waits_for_target_removal_and_uses_recovered_focus(self):
        opener = 'target-opener'
        child = 'target-child'

        class Browser:
            agent_focus_target_id = child
            tab_reads = 0

            async def get_tabs(inner):
                inner.tab_reads += 1
                if inner.tab_reads == 1:
                    return [SimpleNamespace(target_id=opener), SimpleNamespace(target_id=child)]
                inner.agent_focus_target_id = opener
                return [SimpleNamespace(target_id=opener)]

            async def get_or_create_cdp_session(inner, *, target_id, focus):
                return SimpleNamespace(target_id=inner.agent_focus_target_id)

            async def get_browser_state_summary(inner, *, cached):
                return SimpleNamespace(url='https://fixture.invalid/opener',
                    tabs=[SimpleNamespace(target_id=opener)])

            async def get_current_page(inner):
                return SimpleNamespace(get_url=AsyncMock(return_value='https://fixture.invalid/opener'))

        observed = []
        async def observe(_summary, _facts, *, expected_tab_id):
            observed.append(expected_tab_id)
            return 'post-observation'

        result = await capture_consistent_post_snapshot(Browser(), [], [], AsyncMock(return_value=[]), observe,
            closed_target_id=child, _policy=_RetryPolicy(timeout_seconds=0.2, max_attempts=3,
                                                        interval_seconds=0))

        self.assertEqual(result, 'post-observation')
        self.assertEqual(observed, [opener])

    async def test_close_snapshot_rejects_a_tool_result_when_target_still_exists(self):
        child = 'target-child'

        class Browser:
            agent_focus_target_id = child

            async def get_tabs(inner):
                return [SimpleNamespace(target_id=child)]

        with self.assertRaises(ObservationStateTransitionPending):
            await capture_consistent_post_snapshot(Browser(), [], [], AsyncMock(return_value=[]),
                AsyncMock(return_value=[]),
                closed_target_id=child, _policy=_RetryPolicy(timeout_seconds=0.2, max_attempts=2,
                                                            interval_seconds=0))

    async def test_close_target_is_resolved_from_the_pre_action_tab_list(self):
        summary = SimpleNamespace(tabs=[SimpleNamespace(target_id='full-target-ABCD'),
                                        SimpleNamespace(target_id='full-target-EFGH')])

        self.assertEqual(resolve_closed_target_id(summary, {'close': {'tab_id': 'EFGH'}}),
                         'full-target-EFGH')
        with self.assertRaisesRegex(ValueError, 'close_target_identity_unavailable'):
            resolve_closed_target_id(summary, {'close': {'tab_id': 'missing'}})


def history_item(action, result, step):
    return SimpleNamespace(model_output=SimpleNamespace(action=[action]), result=[result],
                           metadata=SimpleNamespace(step_number=step))


def history_fixture(action, result, step):
    return SimpleNamespace(history=[history_item(action, result, step)], is_done=lambda: False,
                           is_successful=lambda: False, is_validated=lambda: False)


def observation_fixture(*facts, observation_id='o-0001', sequence=0):
    source = EvidenceRef(ref='fixture:observation', digest='3' * 64)
    return NormalizedObservation(id=observation_id, sequence=sequence, url='https://fixture.invalid/action',
        tabId='tab-live', facts=list(facts), sourceRefs=[source])


if __name__ == '__main__':
    unittest.main()
