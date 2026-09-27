"""Page scrolls need a physical effect; business output remains independently proven."""

import unittest
from types import SimpleNamespace

from workflow_use.hybrid.natural_compile import natural_postconditions
from workflow_use.hybrid.postconditions import declared_checks


def observed(position, suffix):
    fact = SimpleNamespace(kind='scroll_position', value=position, id='fact-' + suffix,
                           sourceRefs=[])
    return SimpleNamespace(facts=[fact])


class NaturalScrollEffectTest(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
