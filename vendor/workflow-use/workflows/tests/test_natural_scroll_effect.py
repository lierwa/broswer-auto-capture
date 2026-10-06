"""Page scrolls need a physical effect; business output remains independently proven."""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from browser_use.agent.views import ActionResult
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.natural_target_compile import natural_target
from workflow_use.hybrid.natural_binding_compile import natural_bindings

from workflow_use.hybrid.natural_compile import natural_postconditions
from workflow_use.hybrid.postconditions import declared_checks


def observed(position, suffix):
    fact = SimpleNamespace(kind='scroll_position', value=position, id='fact-' + suffix,
                           sourceRefs=[])
    return SimpleNamespace(facts=[fact])


class NaturalScrollEffectTest(unittest.TestCase):
    def test_optional_index_uses_recorded_identity_not_ephemeral_binding(self):
        # WHY：可选 index 与 viewport 是同一原生动作的两种合法输入，不能丢目标或固化旧索引。
        action = SimpleNamespace(id='a-scroll', name='scroll', args={'index': 77})
        value = {'actionRef': action.id, 'scope': {'tabId': 'owned', 'targetId': 'owned'},
                 'targetRef': 'element', 'nodes': [{'id': 'element', 'tag': 'div', 'xpath': 'html/body/div'}],
                 'historyTarget': {'nodeName': 'div', 'xPath': 'html/body/div', 'elementHash': '42', 'attributes': []}}
        pre = SimpleNamespace(tabId='owned', url='https://example.test', facts=[
            SimpleNamespace(id='dom', kind='dom_structure', value=value, sourceRefs=[])])
        target, _, gaps = natural_target(action, pre)
        self.assertEqual(gaps, [])
        self.assertEqual(target['strategy'], 'history')
        self.assertEqual(natural_bindings(SimpleNamespace(), action, pre, True), ([], []))
        for args in ({}, {'index': None}):
            action.args = args
            self.assertEqual(natural_target(action, pre), (None, [], []))
        action.args = {'index': 77}; pre.facts = []
        self.assertEqual(natural_target(action, pre)[2][0].reason, 'same_snapshot_dom_target_required')

    def test_moved_page_compiles_to_bounded_physical_check(self):
        action = SimpleNamespace(id='a-scroll', name='scroll', args={'down': True, 'pages': 2})
        conditions, _refs, gaps = natural_postconditions(
            action, observed('{"x":0,"y":0}', 'before'),
            observed('{"x":0,"y":900}', 'after'), None, [])

        self.assertEqual(gaps, [])
        self.assertEqual(len(conditions), 1)
        self.assertEqual({key: conditions[0][key] for key in ('kind', 'changed', 'clauseRef')},
                         {'kind': 'scroll_position', 'changed': True, 'clauseRef': 'fact-after'})
        self.assertLessEqual(conditions[0]['settle']['maxMs'], 30000)
        self.assertEqual(declared_checks(conditions, action.args, None)[0].parameters['changed'], True)

    def test_no_page_movement_stays_unproven(self):
        action = SimpleNamespace(id='a-scroll', name='scroll', args={'down': True, 'pages': 2})
        _conditions, _refs, gaps = natural_postconditions(
            action, observed('{"x":0,"y":0}', 'before'),
            observed('{"x":0,"y":0}', 'after'), None, [])

        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0].reason, 'natural_concrete_effect_missing')

    def test_consumer_read_does_not_replace_physical_scroll_evidence(self):
        action = SimpleNamespace(id='a-scroll', name='scroll', args={'down': True, 'pages': 2})
        consumer = {'condition': {'kind': 'read_fields', 'consumerRef': 's-a-query'},
                    'proofRefs': []}
        conditions, _refs, gaps = natural_postconditions(
            action, observed('{"x":0,"y":0}', 'before'),
            observed('{"x":0,"y":900}', 'after'), None, [], consumer)

        # WHY：读取可能被活性裁剪；滚动节点必须拥有自己的物理后态，活跃读取随后统一绑定。
        self.assertEqual(gaps, [])
        self.assertEqual([condition['kind'] for condition in conditions], ['scroll_position'])

    def test_consumer_read_cannot_prove_a_scroll_without_movement(self):
        action = SimpleNamespace(id='a-scroll', name='scroll', args={'down': True, 'pages': 2})
        consumer = {'condition': {'kind': 'read_fields', 'consumerRef': 's-a-query'},
                    'proofRefs': []}
        conditions, _refs, gaps = natural_postconditions(
            action, observed('{"x":0,"y":0}', 'before'),
            observed('{"x":0,"y":0}', 'after'), None, [], consumer)

        self.assertEqual(conditions, [])
        self.assertEqual([gap.code for gap in gaps], ['missing_effect_proof'])


class NativeOptionalScrollTests(unittest.IsolatedAsyncioTestCase):
    async def test_replay_resolves_optional_target_then_calls_native_action(self):
        for target in (None, {'strategy': 'xpath', 'value': '//div'}):
            with self.subTest(target=target):
                adapter = object.__new__(OrdinaryCapability)
                adapter.browser = object()
                calls = []
                adapter.registry = SimpleNamespace(validate_action=lambda name, args: calls.append((name, args)) or args)
                adapter.resolve_target = AsyncMock(return_value=SimpleNamespace(index=42))
                adapter._act = AsyncMock(return_value=ActionResult())
                async def dispatch(name, action):
                    return await action(), {}
                adapter._dispatch_captured = dispatch
                with patch('workflow_use.hybrid.capability.inspect_page_scroll', new=AsyncMock(return_value={})), \
                     patch('workflow_use.hybrid.capability.scroll_dispatch_metadata', return_value={}):
                    await adapter.execute('scroll', {'down': True, 'pages': 2}, target)
                expected = {'down': True, 'pages': 2, **({'index': 42} if target else {})}
                self.assertEqual(calls, [('scroll', expected)])
                adapter._act.assert_awaited_once_with(expected, None)
                self.assertEqual(adapter.resolve_target.await_count, int(target is not None))
                with self.assertRaisesRegex(ValueError, 'ephemeral_target_argument'):
                    await adapter.execute('scroll', {'index': 77}, target)


if __name__ == '__main__':
    unittest.main()
