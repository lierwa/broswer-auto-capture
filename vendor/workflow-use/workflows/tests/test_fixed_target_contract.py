"""Confirmed literal targets cannot be blocked by repeated layouts or drift to another control."""
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.dom_evidence import capture_selector_structure, unbound_collection_choice
from workflow_use.hybrid.fixed_target import capture_fixed_target
from workflow_use.hybrid.history_target import capture_history_target, match_history_target
from workflow_use.hybrid.natural_target_compile import natural_target
from test_history_target import FakeNode
from test_nested_collection_selection import nested_summary


class FixedTargetTests(unittest.TestCase):
    def text_fixture(self, label='Newest'):
        summary, nodes = nested_summary()
        target = nodes[1]
        target.ax_node = None
        target.get_all_children_text = lambda: label
        native = FakeNode(element_hash=101, stable_hash=202, xpath=target.xpath,
                          ax_name='', node_name='A')
        native.get_all_children_text = target.get_all_children_text
        structure = capture_selector_structure(summary, 'a-0002', 3, 'tab-1')
        return summary, structure.model_copy(update={'historyTarget': capture_history_target(native)})

    def test_native_text_authorizes_a_unique_confirmed_control_without_ax_name(self):
        summary, original = self.text_fixture()
        bound = capture_fixed_target(original, summary, 3, 'Sort by Newest')
        self.assertFalse(unbound_collection_choice(bound, 'Sort by Newest'))
        self.assertTrue(bound.historyTarget.requireText)
        wrong = FakeNode(element_hash=101, stable_hash=202, xpath=original.historyTarget.xPath,
                         ax_name='', node_name='A')
        wrong.get_all_children_text = lambda: 'Price'
        expected = FakeNode(element_hash=303, stable_hash=404, xpath='/html/body/a[99]',
                            ax_name='', node_name='A')
        expected.get_all_children_text = lambda: 'Newest'
        identity = bound.historyTarget.model_dump(mode='json')
        self.assertEqual(match_history_target(identity, {4: wrong, 42: expected}, 'tab-1')[0], 42)
        with self.assertRaisesRegex(ValueError, 'missing_history_target'):
            match_history_target(identity, {4: wrong}, 'tab-1')
        self.assertEqual(match_history_target(identity, {42: expected, 43: expected}, 'tab-1')[0], 42)

    def test_native_text_does_not_authorize_unconfirmed_or_duplicate_items(self):
        summary, original = self.text_fixture('Record Alpha')
        self.assertIsNone(capture_fixed_target(original, summary, 3, 'Sort by Newest').fixedTargetAuthority)
        duplicate = FakeNode(element_hash=303, stable_hash=404, ax_name='', node_name='A')
        duplicate.get_all_children_text = lambda: 'Record Alpha'
        summary.dom_state.selector_map[4] = duplicate
        bound = capture_fixed_target(original, summary, 3, 'Open Record Alpha')
        self.assertIsNone(bound.fixedTargetAuthority)
        self.assertTrue(unbound_collection_choice(bound, 'Open Record Alpha'))

    def fixture(self, name='销量'):
        summary, nodes = nested_summary()
        target = nodes[1]
        target.ax_node = SimpleNamespace(name=name)
        identity = capture_history_target(FakeNode(element_hash=101, stable_hash=202,
            xpath=target.xpath, ax_name=name, node_name='A'))
        structure = capture_selector_structure(summary, 'a-0002', 3, 'tab-1')
        return summary, structure.model_copy(update={'historyTarget': identity})

    def test_confirmed_unique_name_compiles_despite_repeated_layout(self):
        summary, original = self.fixture()
        self.assertTrue(unbound_collection_choice(original))
        bound = capture_fixed_target(original, summary, 3, '按销量排序')
        self.assertFalse(unbound_collection_choice(bound, '按销量排序'))
        fact = SimpleNamespace(kind='dom_structure', value=bound.model_dump(mode='json'), sourceRefs=[])
        url_fact = SimpleNamespace(kind='url_digest', value=bound.scope.urlDigest)
        pre = SimpleNamespace(facts=[fact, url_fact], tabId='tab-1', url=summary.url)
        target, _, issues = natural_target(SimpleNamespace(id='a-0002', name='click'), pre, '按销量排序')
        self.assertFalse(issues)
        self.assertEqual(target['strategy'], 'history')
        self.assertTrue(target['identity']['requireAxName'])

    def test_unconfirmed_and_duplicate_names_still_require_collection_read(self):
        summary, original = self.fixture('商品甲')
        bound = capture_fixed_target(original, summary, 3, '按销量排序')
        self.assertIsNone(bound.fixedTargetAuthority)
        self.assertTrue(unbound_collection_choice(bound, '按销量排序'))
        summary.dom_state.selector_map[4] = FakeNode(element_hash=102, stable_hash=203,
            ax_name='商品甲', node_name='A')
        duplicate = capture_fixed_target(original, summary, 3, '打开商品甲')
        self.assertIsNone(duplicate.fixedTargetAuthority)

    def test_formal_run_requires_unique_name_even_when_old_hash_and_xpath_match(self):
        summary, original = self.fixture()
        identity = capture_fixed_target(original, summary, 3, '按销量排序').historyTarget.model_dump(mode='json')
        wrong = FakeNode(element_hash=101, stable_hash=202, xpath=original.historyTarget.xPath,
            ax_name='价格', node_name='A')
        expected = FakeNode(element_hash=303, stable_hash=404, xpath='/html/body/a[99]',
            ax_name='销量', node_name='A')
        self.assertEqual(match_history_target(identity, {4: wrong, 42: expected}, 'tab-1')[0], 42)
        with self.assertRaisesRegex(ValueError, 'missing_history_target'):
            match_history_target(identity, {4: wrong}, 'tab-1')
        self.assertEqual(match_history_target(identity, {42: expected, 43: expected}, 'tab-1')[0], 42)

    def test_nested_same_name_uses_original_native_position_but_rejects_named_branches(self):
        summary, original = self.text_fixture()
        child = summary.dom_state.selector_map[3]
        parent = FakeNode(element_hash=500, stable_hash=600, xpath='/html/body/a[1]', ax_name='', node_name='A')
        parent.get_all_children_text = lambda: 'Newest'
        child.parent_node = parent
        summary.dom_state.selector_map[40] = parent
        bound = capture_fixed_target(original, summary, 3, 'Sort by Newest')
        self.assertIsNotNone(bound.fixedTargetAuthority)
        expected = FakeNode(element_hash=101, stable_hash=202, xpath=original.historyTarget.xPath,
                            ax_name='', node_name='A')
        expected.get_all_children_text = lambda: 'Newest'
        expected.parent_node = parent
        identity = bound.historyTarget.model_dump(mode='json')
        self.assertEqual(match_history_target(identity, {42: expected, 40: parent}, 'tab-1')[0], 42)
        unbound = FakeNode(element_hash=700, stable_hash=800, xpath='/html/body/a[9]', ax_name='', node_name='A')
        unbound.get_all_children_text = lambda: 'Newest'
        unbound.parent_node = parent
        with self.assertRaisesRegex(ValueError, 'ambiguous_history_target'):
            match_history_target(identity, {41: unbound, 40: parent}, 'tab-1')
        with self.assertRaisesRegex(ValueError, 'ambiguous_history_target'):
            match_history_target(identity, {42: expected, 41: unbound, 40: parent}, 'tab-1')
        summary.dom_state.selector_map[41] = unbound
        self.assertIsNone(capture_fixed_target(original, summary, 3, 'Sort by Newest').fixedTargetAuthority)

    def test_hidden_duplicate_and_cross_frame_parent_never_authorize_a_different_target(self):
        summary, original = self.text_fixture()
        target = summary.dom_state.selector_map[3]
        hidden = FakeNode(element_hash=500, stable_hash=600, ax_name='', node_name='A')
        hidden.get_all_children_text = lambda: 'Newest'
        hidden.is_visible = False
        summary.dom_state.selector_map[40] = hidden
        bound = capture_fixed_target(original, summary, 3, 'Sort by Newest')
        self.assertIsNotNone(bound.fixedTargetAuthority)
        current = FakeNode(element_hash=101, stable_hash=202, ax_name='', node_name='A')
        current.get_all_children_text = lambda: 'Newest'
        self.assertEqual(match_history_target(bound.historyTarget.model_dump(mode='json'),
                                             {42: current, 40: hidden}, 'tab-1')[0], 42)
        hidden.is_visible, hidden.frame_id = True, 'other-frame'
        target.parent_node = hidden
        summary.dom_state.selector_map[41] = current
        current.parent_node = hidden
        self.assertIsNone(capture_fixed_target(original, summary, 3, 'Sort by Newest').fixedTargetAuthority)
        target.is_visible = False
        summary.dom_state.selector_map.pop(41)
        self.assertIsNone(capture_fixed_target(original, summary, 3, 'Sort by Newest').fixedTargetAuthority)

    def test_legacy_serialization_omits_new_optional_authority(self):
        _, original = self.fixture()
        self.assertNotIn('fixedTargetAuthority', original.model_dump(mode='json'))
        self.assertNotIn('requireAxName', original.historyTarget.model_dump(mode='json'))


if __name__ == '__main__':
    unittest.main()
