"""Interactive targets survive selector-index changes without model-authored selectors."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use.dom.views import NodeType

from workflow_use.hybrid.history_target import capture_history_target, match_history_target
from workflow_use.hybrid.natural_target_compile import natural_target
from workflow_use.hybrid.post_action_target import (
    CapturedTargetIdentity,
    refreshed_target_element,
    retained_action_target_element,
)


class FakeNode:
    def __init__(self, *, element_hash, stable_hash, xpath='/html/body/button', ax_name='Save',
                 attributes=None, target_id='tab-1', node_name='BUTTON'):
        self.node_id, self.backend_node_id = 1, 2
        self.frame_id, self.target_id, self.shadow_root_type = None, target_id, None
        self.node_type, self.node_value, self.node_name = NodeType.ELEMENT_NODE, '', node_name
        self.attributes = attributes or {'aria-label': ax_name}
        self.snapshot_node, self.xpath = None, xpath
        self.ax_node = SimpleNamespace(name=ax_name)
        self._element_hash, self._stable_hash = element_hash, stable_hash

    def __hash__(self):
        return self._element_hash

    @property
    def element_hash(self):
        return hash(self)

    def compute_stable_hash(self):
        return self._stable_hash


class HistoryTargetTests(unittest.TestCase):
    def test_remaps_to_new_index_with_native_stable_hash(self):
        identity = capture_history_target(FakeNode(element_hash=101, stable_hash=202))
        current = FakeNode(element_hash=303, stable_hash=202)
        index, node = match_history_target(identity.model_dump(mode='json'), {42: current}, 'tab-1')
        self.assertEqual(index, 42)
        self.assertIs(node, current)

    def test_never_takes_first_ambiguous_fallback(self):
        identity = capture_history_target(FakeNode(element_hash=101, stable_hash=202))
        mapping = {4: FakeNode(element_hash=301, stable_hash=202),
                   9: FakeNode(element_hash=302, stable_hash=202)}
        with self.assertRaisesRegex(ValueError, 'ambiguous_history_target'):
            match_history_target(identity.model_dump(mode='json'), mapping, 'tab-1')

    def test_weak_element_hash_collision_is_disambiguated_by_stable_hash(self):
        identity = capture_history_target(FakeNode(element_hash=101, stable_hash=202, node_name='EM'))
        expected = FakeNode(element_hash=101, stable_hash=202, xpath='/html/body/a[1]/em', node_name='EM')
        other = FakeNode(element_hash=101, stable_hash=303, xpath='/html/body/a[2]/em', node_name='EM')

        index, node = match_history_target(
            identity.model_dump(mode='json'), {42: expected, 43: other}, 'tab-1')

        self.assertEqual(index, 42)
        self.assertIs(node, expected)

    def test_compiler_preserves_history_identity_instead_of_css_or_xpath(self):
        identity = capture_history_target(FakeNode(element_hash=101, stable_hash=202))
        source_ref = SimpleNamespace(model_dump=lambda **_kwargs: {'ref': 'fixture', 'digest': '1' * 64})
        structure = {'actionRef': 'a-0001', 'scope': {'tabId': 'tab-1', 'targetId': 'tab-1',
                     'frameId': None}, 'targetRef': 'n-0001',
                     'historyTarget': identity.model_dump(mode='json'),
                     'nodes': [{'id': 'n-0001', 'tag': 'button', 'xpath': identity.xPath}],
                     'limitations': [], 'queryCandidate': None}
        fact = SimpleNamespace(kind='dom_structure', value=structure, sourceRefs=[source_ref])
        pre = SimpleNamespace(facts=[fact], tabId='tab-1', url='https://fixture.invalid/')
        action = SimpleNamespace(id='a-0001', name='click')
        target, _refs, issues = natural_target(action, pre)
        self.assertFalse(issues)
        self.assertEqual(target['strategy'], 'history')
        self.assertNotIn('value', target)

    def test_post_action_value_read_reuses_history_identity_without_css(self):
        original = FakeNode(element_hash=101, stable_hash=202, node_name='INPUT',
                            attributes={'id': 'query', 'name': 'query'})
        current = FakeNode(element_hash=303, stable_hash=202, node_name='INPUT',
                           attributes={'id': 'query', 'name': 'query'})
        identity = CapturedTargetIdentity(
            target_id='tab-1', url='https://fixture.invalid/', tag='input',
            attributes={'id': 'query', 'name': 'query'}, backend=2,
            history=capture_history_target(original))
        summary = SimpleNamespace(
            url=identity.url, dom_state=SimpleNamespace(selector_map={42: current}))
        page = SimpleNamespace(get_url=AsyncMock(return_value=identity.url))
        browser = SimpleNamespace(
            agent_focus_target_id='tab-1', get_current_page=AsyncMock(return_value=page))
        with patch('workflow_use.hybrid.post_action_target._element',
                   new=AsyncMock(return_value='resolved')):
            result = __import__('asyncio').run(
                refreshed_target_element(browser, summary, identity))
        self.assertEqual(result, 'resolved')

    def test_post_action_read_keeps_exact_target_when_overlay_removes_it_from_selector_map(self):
        original = FakeNode(element_hash=101, stable_hash=202, node_name='INPUT')
        identity = CapturedTargetIdentity(
            target_id='tab-1', url='https://fixture.invalid/', tag='input', attributes={}, backend=2,
            history=capture_history_target(original))
        summary = SimpleNamespace(url=identity.url, dom_state=SimpleNamespace(selector_map={}))
        page = SimpleNamespace(get_url=AsyncMock(return_value=identity.url))
        browser = SimpleNamespace(agent_focus_target_id='tab-1',
                                  get_current_page=AsyncMock(return_value=page))
        retained = object()

        result = __import__('asyncio').run(
            retained_action_target_element(browser, summary, identity, retained))

        self.assertIs(result, retained)


if __name__ == '__main__':
    unittest.main()
