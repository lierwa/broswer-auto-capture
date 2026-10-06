"""保护模型观察与原生入口身份的交接，拒绝缓存替换和跨文档误选。"""
import asyncio
import json
import unittest
from types import SimpleNamespace as Node
from unittest.mock import AsyncMock

from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.entry_selection import assert_entry_sample, capture_entry_indices, proven_entry_container, select_entry_container
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.element_entry import ElementEntry
from workflow_use.hybrid.method_read_tool import MethodReadRecords, _safe_read_error


URL, TARGET = 'https://example.test/list', 'target-ABCD'


def snapshot():
    def node(name, backend, parent=None):
        value = Node(node_name=name, backend_node_id=backend, target_id=TARGET, parent_node=parent,
                     children_nodes=[], attributes={}, is_visible=True)
        if parent is not None:
            parent.children_nodes.append(value)
        return value
    root = node('#document', 1)
    html = node('html', 2, root)
    body = node('body', 3, html)
    buttons = [node('button', backend, body) for backend in (101, 102)]
    return Node(url=URL, dom_state=Node(selector_map=dict(zip((7, 8), buttons)),
                                      _root=Node(original_node=root)))


class Element:
    def __init__(self, backend): self.backend = backend
    async def get_basic_info(self): return {'backendNodeId': self.backend}


class Page:
    url, target, backends = URL, TARGET, (101, 102)
    async def get_target_info(self): return {'targetId': self.target}
    async def get_url(self): return self.url
    async def get_elements_by_css_selector(self, selector):
        if selector != 'body > button':
            raise AssertionError('unexpected_selector')
        return [Element(backend) for backend in self.backends]


class Browser:
    agent_focus_target_id = TARGET
    def __init__(self): self.summary, self.page = snapshot(), Page()
    async def get_dom_element_by_index(self, _):
        raise AssertionError('must_not_reinterpret_old_indices_in_current_cache')
    async def get_browser_state_summary(self, **_): return self.summary
    async def get_current_page(self): return self.page


class EntrySelectionTest(unittest.TestCase):
    def test_entry_preview_is_frozen_and_link_secrets_are_not_exposed(self):
        seen = snapshot()
        first, second = (seen.dom_state.selector_map[index] for index in (7, 8))
        first.attributes = {'href': 'https://user:password@support.example.test/private?token=secret#hidden',
                            'title': 'Support'}
        second.attributes = {'href': 'javascript:secret()', 'aria-label': 'Open item'}
        frozen = capture_entry_indices(seen, [7, 8], TARGET)
        first.attributes['href'] = 'https://changed.example.test/'
        first.attributes['title'] = 'Changed'
        self.assertEqual(frozen.previews[0].name, 'Support')
        self.assertEqual(frozen.previews[0].destination_origin, 'https://support.example.test')
        self.assertEqual(frozen.previews[1].name, 'Open item')
        self.assertIsNone(frozen.previews[1].destination_origin)
        for href in ('https://example.test\\private?token=secret#hidden',
                     'https://example.test\\@other.example.test/private'):
            first.attributes['href'] = href
            self.assertIsNone(capture_entry_indices(seen, [7, 8], TARGET).previews[0].destination_origin)

    def test_source_feedback_only_shows_proven_representative_entry_previews(self):
        seen = snapshot()
        seen.dom_state.selector_map[7].attributes = {'href': 'https://support.example.test/?token=secret'}
        seen.dom_state.selector_map[8].attributes = {'title': 'Open item'}
        frozen = capture_entry_indices(seen, [7, 8], TARGET)
        record = Node(mapping=Node(specification=Node(entryField='entry', fields={}), readPath=[]),
                      sample=Node(output=[{'entry': {'backendNodeId': 102}}],
                                  coverage=Node(total=2, sampled=1)), readRef='r1')
        feedback = json.loads(MethodReadRecords().feedback(None, record, observation=frozen))
        self.assertEqual(feedback['entryPreviews'], [{'index': 8, 'tag': 'button', 'name': 'Open item',
                                                    'destinationOrigin': None}])
        self.assertNotIn('secret', json.dumps(feedback))
        self.assertEqual(json.loads(MethodReadRecords().feedback(None, record))['entryPreviews'], [])
        record.selection = Node(selectedBackendNodeIds=[101, 102], backendNodeIds=[201, 202])
        record.sample.output = [{'entry': {'backendNodeId': 202}}]
        normalized = json.loads(MethodReadRecords().feedback(None, record, observation=frozen))
        self.assertEqual(normalized['entryPreviews'][0]['index'], 8)

    def test_frozen_observation_survives_index_cache_and_node_object_rebuild(self):
        seen = snapshot()
        frozen = capture_entry_indices(seen, [7, 8], TARGET)
        seen.dom_state.selector_map[7].backend_node_id = 999
        seen.dom_state.selector_map.clear()
        browser = Browser()
        browser.summary.dom_state.selector_map = {17: object(), 18: object()}
        selection = asyncio.run(select_entry_container(browser, [7, 8], observation=frozen))
        self.assertEqual(selection.backendNodeIds, [101, 102])
        self.assertEqual(selection.indices, [7, 8])
        self.assertEqual(selection.container, 'body > button')
        self.assertEqual(selection.documentRootId, 2)

    def test_full_collection_membership_includes_hidden_nonselected_dom_nodes(self):
        browser = Browser()
        frozen = capture_entry_indices(browser.summary, [7, 8], TARGET)
        first = browser.summary.dom_state.selector_map[7]
        hidden = Node(**{**vars(first), 'backend_node_id': 103, 'children_nodes': [], 'is_visible': False})
        first.parent_node.children_nodes.append(hidden)
        browser.page.backends = (101, 102, 103)
        selection = asyncio.run(select_entry_container(browser, [7, 8], observation=frozen))
        self.assertEqual(selection.backendNodeIds, [101, 102])
        self.assertEqual(selection.containerIdsDigest, digest([101, 102, 103]))

    def test_owner_consumes_only_this_action_once_and_cannot_transfer_to_another_owner(self):
        owner, other = MethodReadRecords(), MethodReadRecords()
        owner.bind_entry_observation(snapshot(), [7, 8], TARGET)
        with self.assertRaisesRegex(ValueError, 'native_entry_observation_unavailable'):
            other.consume_entry_observation([7, 8])
        owner.consume_entry_observation([7, 8])
        with self.assertRaisesRegex(ValueError, 'native_entry_observation_unavailable'):
            owner.consume_entry_observation([7, 8])
        owner.bind_entry_observation(snapshot(), [7, 8], TARGET)
        with self.assertRaisesRegex(ValueError, 'native_entry_observation_unavailable'):
            owner.consume_entry_observation([8, 7])

    def test_same_url_reload_and_url_changes_are_rejected_even_with_matching_backends(self):
        frozen = capture_entry_indices(snapshot(), [7, 8], TARGET)
        for change in ('url', 'document'):
            browser = Browser()
            if change == 'url': browser.summary.url = 'https://example.test/other'
            else: browser.summary.dom_state._root.original_node.backend_node_id = 77
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'native_entry_document_changed'):
                asyncio.run(select_entry_container(browser, [7, 8], observation=frozen))

    def test_live_prefix_target_and_url_must_still_match(self):
        frozen = capture_entry_indices(snapshot(), [7, 8], TARGET)
        for change in ('prefix', 'target', 'url'):
            browser = Browser()
            if change == 'prefix': browser.page.backends = (999, 101, 102)
            elif change == 'target': browser.page.target = 'other-target'
            else: browser.page.url = 'https://example.test/other'
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'native_entry_selector_unavailable'):
                asyncio.run(select_entry_container(browser, [7, 8], observation=frozen))

    def test_callback_binds_native_indices_before_the_first_observation_await(self):
        async def run():
            owner, browser, seen = MethodReadRecords(), Browser(), snapshot()
            collector = EvidenceCollector(browser, None, put_evidence=lambda *_: None,
                redact_action=lambda action: action, field_read_records=owner)
            async def refresh(summary, *_):
                summary.dom_state.selector_map.clear()
                return summary
            collector.observation_scope = Node(verify_before_action=refresh)
            collector.natural_effect_facts = AsyncMock(return_value=[])
            collector.observe = AsyncMock(return_value=Node(id='o-1'))
            action = Node(model_dump=lambda **_: {'bat_read_fields': {'indices': [7, 8]}})
            await collector.before_action(seen, Node(action=[action]), 1)
            self.assertEqual(owner.consume_entry_observation([7, 8]).identities,
                             ((TARGET, 101), (TARGET, 102)))
        asyncio.run(run())

    def test_unknown_tool_errors_preserve_only_a_fixed_phase_without_exception_text(self):
        for phase, code in [('entry_selection', 'native_entry_selection_failed'),
                            ('mapping', 'method_read_mapping_failed'), ('sample', 'method_read_sample_failed')]:
            result = _safe_read_error(RuntimeError('private-page-content'), {}, phase=phase)
            self.assertEqual(result.split(': ', 1)[0], code)
            self.assertEqual(json.loads(result.split(': ', 1)[1])['type'], 'RuntimeError')
            self.assertNotIn('private-page-content', result)
        self.assertEqual(_safe_read_error(ValueError('native_entry_document_changed'), {}, phase='sample'),
                         'native_entry_document_changed')

    def test_successful_selection_cannot_register_a_new_document_or_rebuilt_collection(self):
        frozen = capture_entry_indices(snapshot(), [7, 8], TARGET)
        selection = asyncio.run(select_entry_container(Browser(), [7, 8], observation=frozen))
        sample = Node(pageIdentity={'targetId': TARGET, 'url': URL}, documentRootId=2,
                      containerIdsDigest=digest([101, 102]))
        assert_entry_sample(selection, sample)
        sample.documentRootId = 99
        with self.assertRaisesRegex(ValueError, 'native_entry_document_changed'):
            assert_entry_sample(selection, sample)
        sample.documentRootId, sample.containerIdsDigest = 2, digest([201, 202])
        with self.assertRaisesRegex(ValueError, 'natural_read_container_identity_changed'):
            assert_entry_sample(selection, sample)
        sample.containerIdsDigest = digest([101, 102])
        value = {**selection.model_dump(mode='json'), 'actionRef': 'a-1'}
        fact = Node(kind='native_entry_selection', value=value,
                    sourceRefs=[Node(digest=digest({'kind': 'native_entry_selection', 'value': value}))])
        action = Node(id='a-1', args={'indices': [7, 8]}, postObservationRef='o-1')
        trace = Node(observations=[Node(id='o-1', facts=[fact])])
        verified = Node(specification=Node(container=selection.container), targetId=TARGET,
                        urlDigest=digest(URL), documentRootId=2, containerIdsDigest=digest([101, 102]))
        self.assertEqual(proven_entry_container(action, trace, verified), selection.container)
        verified.documentRootId = 99
        with self.assertRaisesRegex(ValueError, 'native_entry_selector_unavailable'):
            proven_entry_container(action, trace, verified)

    def test_entry_validation_diagnostic_keeps_field_and_type_without_input_or_message(self):
        try:
            ElementEntry(kind='element', tabId='ABCD', url=URL, selector='button', ordinal=1,
                         text='x' * 8001, backendNodeId=101, documentRootId=2)
        except Exception as error:
            message = _safe_read_error(error, {}, phase='sample')
        detail = json.loads(message.split(': ', 1)[1])
        self.assertEqual(detail['type'], 'ValidationError')
        self.assertEqual(detail['validation'], [{'field': 'text', 'type': 'string_too_long'}])
        self.assertNotIn(URL, message)
        self.assertNotIn('input', message)


if __name__ == '__main__':
    unittest.main()
