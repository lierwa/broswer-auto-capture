"""Protect native dispatch equivalence and reject unbound or mismatched click receipts."""
import json
import unittest
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch

from browser_use.agent.views import ActionResult
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.native_action_receipt import native_action_receipt
from workflow_use.hybrid.natural_compile import natural_postconditions, target_value_condition
from workflow_use.hybrid.postconditions import declared_checks
from workflow_use.hybrid.postconditions import SettlePolicy, PostconditionNotMet
from workflow_use.hybrid.target_preparation import assert_action_target, prepare_mapped_target


def ref(value):
    fingerprint = digest(value)
    return EvidenceRef(ref='sha256:' + fingerprint, digest=fingerprint)


def fact(kind, value):
    return NS(id='fact-' + kind, kind=kind, value=value, sourceRefs=[ref(value)])


def fixture(*, error=None, relation='self', binding=True):
    raw = ActionResult(error=error).model_dump(mode='json')
    result_ref = ref(raw)
    action = NS(id='a-0001', name='click', status='succeeded', actionIndex=0, resultRef=result_ref, args={})
    target = {'strategy': 'entry', 'entryBinding': {'source': 'input', 'path': ['entry']}}
    actual = {'scope': {'targetId': 'owned'}, 'event': {'type': 'click', 'isTrusted': False},
              'graph': {'intentRelation': relation}}
    facts = [fact('document_identity', {'targetId': 'owned', 'documentDigest': digest('document')}),
             fact('url_digest', digest('https://example.test/list')),
             fact('native_action_dispatch', {'actionRef': action.id, 'schemaVersion': 'bat.native-action-dispatch/v3',
                  'actionName': 'click', 'entered': True, 'resultReceived': True, 'nativeActionIndex': 0,
                  'resultRef': result_ref.model_dump(), 'intentTarget': {'targetId': 'owned'},
                  'eventCapture': {'status': 'captured', 'eventExpectation': 'required',
                                   'eventCount': 1, 'limitations': []}}),
             fact('native_action_result', {'actionRef': action.id, 'schemaVersion': 'bat.native-action-result/v1',
                  'receivedFromToolsAct': True, 'resultRef': result_ref.model_dump(), 'result': raw}),
             fact('native_dom_event', {'actionRef': action.id, 'actual': actual})]
    if binding:
        facts.append(fact('input_entry_target', {'actionRef': action.id, 'targetId': 'owned',
                                                'binding': target['entryBinding']}))
    pre = NS(tabId='owned', url='https://example.test/list', facts=facts)
    post = NS(tabId=pre.tabId, url=pre.url, facts=facts[:2])
    return action, pre, post, target, actual


class NativeClickContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_input_waits_for_value_without_redispatching(self):
        # WHY：异步控件值允许有界重读，但持久错值必须失败；原生输入只派发一次。
        expected = 'requested value'
        action = NS(id='a-input', name='input', args={'text': expected})
        post = NS(facts=[fact('target_value', {'actionRef': action.id, 'targetRef': 'input', 'value': expected})])
        target = {'strategy': 'xpath', 'value': '//input'}
        conditions, _, gaps = target_value_condition(action, post, target,
            [{'argumentPath': 'text', 'binding': {'source': 'constant', 'value': expected}}])
        self.assertEqual(gaps, [])
        self.assertGreater(conditions[0]['settle']['maxAttempts'], 1)
        conditions[0]['settle'] = {'maxMs': 1000, 'maxAttempts': 2, 'intervalMs': 10}
        for final in (expected, 'wrong value'):
            _, _, _, _, actual = fixture(); actual['event']['type'] = 'input'
            element = NS(evaluate=AsyncMock(side_effect=[
                json.dumps({'connected': True, 'value': ''}),
                json.dumps({'connected': True, 'value': final})]))
            adapter = object.__new__(OrdinaryCapability); adapter.browser = object()
            adapter.registry = NS(validate_action=lambda name, args: args)
            adapter._act = AsyncMock(return_value=ActionResult())
            adapter.event_capture = NS(arm=AsyncMock(), complete=AsyncMock(return_value={
                'status': 'captured', 'events': [actual]}))
            adapter.resolve_target = AsyncMock(return_value=NS(index=42, target_id='owned', frame_id=None,
                session_id='session', element=element, scrolled=False, hit_relation='self'))
            call = adapter.execute_checked('input', {'text': expected}, target, conditions)
            if final == expected:
                await call
            else:
                with self.assertRaisesRegex(PostconditionNotMet, 'target_value_fact_mismatch'):
                    await call
            self.assertEqual(adapter._act.await_count, 1)
            self.assertEqual(element.evaluate.await_count, 2)

    async def test_native_dispatch_owns_actionability_while_readiness_keeps_its_contract(self):
        state = {'connected': True, 'visible': False, 'inView': False, 'pointerBlocked': True,
                 'hitRelation': 'outside', 'documentId': 'document', 'center': {'x': 0, 'y': 0},
                 'viewport': {'width': 800, 'height': 600}, 'coordinateScope': 'top'}
        element = NS(evaluate=AsyncMock())
        node = {'backendNodeId': 1, 'target_id': 'owned', 'frame_id': None, 'shadow_root_type': None}
        resolver = NS(_assert_page_identity=AsyncMock())
        adapter = object.__new__(OrdinaryCapability)
        adapter.target_settle = SettlePolicy(maxMs=100, maxAttempts=1, intervalMs=10)
        with self.assertRaisesRegex(ValueError, 'target_not_visible'):
            assert_action_target(state, 'click')

        async def prepare(target, action_name, **options):
            return await prepare_mapped_target(resolver, target, action_name, object(), {42: node},
                                               'owned', 42, False, **options)

        adapter.targets = NS(prepare_action_target=prepare)
        with patch('workflow_use.hybrid.targets.element_from_backend', new=AsyncMock(return_value=element)), \
             patch('workflow_use.hybrid.target_preparation.inspect_action_target', new=AsyncMock(return_value=state)):
            prepared = await adapter.resolve_target({'strategy': 'xpath', 'value': '//button'}, action_name='click')
            self.assertEqual(prepared.index, 42)
            self.assertEqual(prepared.hit_relation, 'outside')
            element.evaluate.assert_not_awaited()
            state['connected'] = False
            with self.assertRaisesRegex(ValueError, 'target_detached'):
                await adapter.resolve_target({'strategy': 'xpath', 'value': '//button'}, action_name='click')

    def test_bound_native_js_click_is_not_required_to_change_any_page_state(self):
        action, pre, post, target, _ = fixture()
        conditions, proofs, gaps = natural_postconditions(action, pre, post, target, [])
        self.assertEqual((conditions, gaps), ([], []))
        self.assertEqual(declared_checks(conditions, {}, target), [])
        self.assertTrue(proofs)

    def test_missing_dispatch_wrong_target_and_native_error_remain_rejected(self):
        for values in ({'relation': 'outside'}, {'error': 'native_failure'}):
            with self.subTest(values=values):
                action, pre, post, target, _ = fixture(**values)
                self.assertIsNone(native_action_receipt(action, pre))
        action, pre, post, target, _ = fixture()
        pre.facts = [item for item in pre.facts if item.kind != 'native_action_dispatch']
        self.assertIsNone(native_action_receipt(action, pre))

    async def test_checked_replay_without_page_conditions_keeps_native_errors_and_target_check(self):
        for relation, error in (('self', None), ('outside', None), ('self', 'native_failure')):
            with self.subTest(relation=relation, error=error):
                _, _, _, _, actual = fixture(relation=relation)
                native = object()
                adapter = object.__new__(OrdinaryCapability)
                adapter.browser = object()
                adapter.registry = NS(validate_action=lambda name, args: native)
                adapter._act = AsyncMock(return_value=ActionResult(error=error))
                adapter.event_capture = NS(arm=AsyncMock(), complete=AsyncMock(return_value={
                    'status': 'captured', 'events': [actual]}))
                prepared = NS(index=42, target_id='owned', frame_id=None, session_id='session',
                              element=object(), scrolled=False, hit_relation='self')
                adapter.resolve_target = AsyncMock(return_value=prepared)
                call = adapter.execute_checked('click', {}, {'strategy': 'xpath', 'value': '//button'}, [])
                if relation == 'outside' or error:
                    expected = 'ordinary_action_failed' if error else 'ordinary_event_target_mismatch'
                    with self.assertRaisesRegex(RuntimeError, expected):
                        await call
                else:
                    await call
                adapter._act.assert_awaited_once_with(native, None)


if __name__ == '__main__':
    unittest.main()
