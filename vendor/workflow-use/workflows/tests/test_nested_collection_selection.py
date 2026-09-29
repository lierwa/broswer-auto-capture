"""Protect selection proof across nested repeated items without page-wide widening."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.collection_structure import query_targets_share_collection
from workflow_use.hybrid.dom_evidence import CollectionReadRequired, capture_selector_structure, unbound_collection_choice
from workflow_use.hybrid.natural_target_compile import natural_target
from workflow_use.hybrid.natural_reads import VerifiedNaturalRead, find_elements_read_spec
from workflow_use.hybrid.post_action_target import CapturedTargetIdentity, verified_collection_query

from test_execution_dynamic_selection import Element, URL, URL_DIGEST, fact, query


def node(tag, backend, parent=None, classes=''):
    value = SimpleNamespace(node_name=tag, backend_node_id=backend, parent_node=parent,
        target_id='tab-1', frame_id=None, children_nodes=[], attributes={'class': classes},
        xpath=f'/html/body/test[{backend}]')
    if parent is not None:
        parent.children_nodes.append(value)
    return value


def nested_summary():
    root = node('main', 1000)
    targets = []
    for index in (1, 2, 3):
        item = node('section', 100 + index, root)
        body = node('div', 200 + index, item, 'card-body')
        heading = node('div', 300 + index, body, 'flex title')
        node('div', 400 + index, body, 'flex actions')
        targets.append(node('a', index * 10, heading, 'entry primary'))
    summary = SimpleNamespace(url=URL, dom_state=SimpleNamespace(selector_map={3: targets[1]}))
    return summary, targets


def verified_query(selector='section .title a'):
    current = query(selector=selector)
    verified = VerifiedNaturalRead(actionRef=current.actionRef, specification=find_elements_read_spec(current),
        outputPath=[], readPath=[], output=[{'text': str(index), 'ordinal': index} for index in (1, 2, 3)],
        resultDigest='2' * 64, urlDigest=URL_DIGEST, targetId='tab-1',
        containerIdsDigest='3' * 64, stable=True)
    return current, verified


class NestedCollectionSelectionTests(unittest.IsolatedAsyncioTestCase):
    def test_actual_query_membership_is_not_rejected_for_active_or_variant_css(self):
        summary, targets = nested_summary()
        targets[0].attributes['class'] += ' selected'
        targets[2].attributes['class'] += ' visited'
        self.assertTrue(query_targets_share_collection(targets[1], {10, 20, 30}))

    def test_multiple_targets_in_one_item_cannot_masquerade_as_one_target_per_item(self):
        _summary, targets = nested_summary()
        node('a', 99, targets[1].parent_node, 'entry secondary')
        self.assertFalse(query_targets_share_collection(targets[1], {10, 20, 30, 99}))

    async def test_nested_unread_choice_is_withheld_before_native_dispatch(self):
        summary, _targets = nested_summary()
        browser = SimpleNamespace(agent_focus_target_id='tab-1', get_tabs=AsyncMock(return_value=[]))
        collector = EvidenceCollector(browser, object(), put_evidence=lambda *_args: None,
                                      redact_action=lambda value: value)
        collector.observe = AsyncMock(return_value=SimpleNamespace(id='o-pre'))
        collector.natural_effect_facts = AsyncMock(return_value=[])
        collector.dom_fact = lambda value: value
        action = SimpleNamespace(model_dump=lambda **_kwargs: {'click': {'index': 3}})
        with patch('workflow_use.hybrid.capture.binding_facts', return_value=[]), \
             patch('workflow_use.hybrid.capture.capture_target_identity', return_value=object()), \
             patch('workflow_use.hybrid.capture.callback_target_element', AsyncMock()), \
             patch('workflow_use.hybrid.capture.verified_collection_query', AsyncMock(return_value=(object(), None))), \
             patch('workflow_use.hybrid.capture.verified_labeled_query', AsyncMock(return_value=(object(), None))):
            with self.assertRaises(CollectionReadRequired):
                await collector.before_action(summary, SimpleNamespace(action=[action]), 1)
        self.assertIsNotNone(collector.pending)  # Existing callback preserves the withheld attempt.

    async def test_nested_unread_choice_cannot_compile_to_sample_xpath(self):
        summary, _targets = nested_summary()
        structure = capture_selector_structure(summary, 'a-0002', 3, 'tab-1').model_dump(mode='json')
        self.assertTrue(unbound_collection_choice(structure))
        pre = SimpleNamespace(tabId='tab-1', url=URL, facts=[fact('url', 'url_digest', URL_DIGEST),
            fact('dom', 'dom_structure', structure)])
        target, _refs, issues = natural_target(SimpleNamespace(id='a-0002', name='click'), pre)
        self.assertIsNone(target)
        self.assertEqual([issue.reason for issue in issues], ['collection_selection_read_required'])

    async def test_complete_nested_query_keeps_the_original_ordinal(self):
        summary, _targets = nested_summary()
        identity = CapturedTargetIdentity(target_id='tab-1', url=URL, tag='a', attributes={},
                                          backend=20, history=object())
        page = SimpleNamespace(get_url=AsyncMock(return_value=URL),
            get_elements_by_css_selector=AsyncMock(return_value=[Element(value) for value in (10, 20, 30)]))
        browser = SimpleNamespace(agent_focus_target_id='tab-1', get_current_page=AsyncMock(return_value=page))
        current, verified = verified_query()
        with patch('workflow_use.hybrid.post_action_target.read_fields_with_proof',
                   AsyncMock(return_value=(verified.output, verified.containerIdsDigest))):
            _identity, target = await verified_collection_query(browser, summary, identity, [(current, verified)], 3)
        self.assertEqual(target['ordinal'], 2)
        self.assertEqual(target['readActionRef'], 'a-0001')
        self.assertEqual(target['items']['value'], 'section .title a')

    async def test_page_query_with_local_peers_and_unrelated_control_is_rejected(self):
        summary, _targets = nested_summary()
        identity = CapturedTargetIdentity(target_id='tab-1', url=URL, tag='a', attributes={},
                                          backend=20, history=object())
        page = SimpleNamespace(get_url=AsyncMock(return_value=URL),
            get_elements_by_css_selector=AsyncMock(return_value=[Element(value) for value in (10, 20, 999)]))
        browser = SimpleNamespace(agent_focus_target_id='tab-1', get_current_page=AsyncMock(return_value=page))
        current, verified = verified_query(selector='a')
        with patch('workflow_use.hybrid.post_action_target.read_fields_with_proof', AsyncMock()) as read:
            with self.assertRaises(CollectionReadRequired):
                await verified_collection_query(browser, summary, identity, [(current, verified)], 3)
        read.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
