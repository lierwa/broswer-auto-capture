"""保护入口跨层证据格式与复跑身份，避免退回样本序号或漏掉原生工具。"""
import asyncio
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.author import author_tools
from workflow_use.hybrid.element_entry import (
    ENTRY_SCHEMA, compiled_entry_target, entry_key_record, entry_related_backends, entry_target_fact,
    live_entry, resolve_entry_element)
from workflow_use.hybrid.method_read_tool import EntryReadToolParams, MethodReadToolParams
from workflow_use.hybrid.natural_target_compile import natural_target
from workflow_use.hybrid.evidence import digest


ENTRY = {'kind': 'element', 'tabId': 'ABCD', 'url': 'https://example.test/list',
         'selector': 'button', 'ordinal': 1, 'text': 'Chosen record', 'backendNodeId': 7, 'documentRootId': 2}


class ElementEntryContractTest(unittest.TestCase):
    def test_entry_read_accepts_native_indices_without_selector_or_output_fields(self):
        public = EntryReadToolParams(indices=[3, 7, 11], take=3)
        params = MethodReadToolParams.model_validate(public.model_dump(mode='json'))
        self.assertEqual(params.model_dump(mode='json'), {'indices': [3, 7, 11], 'take': 3})
        self.assertTrue(params.captureContent)
        with self.assertRaises(ValueError):
            EntryReadToolParams(indices=[3], container='button')

    def test_mismatched_entry_cannot_fall_back_to_a_fixed_collection_target(self):
        action = SimpleNamespace(name='click', id='a-1')
        pre = SimpleNamespace(facts=[SimpleNamespace(kind='input_entry_mismatch')])
        target, _, gaps = natural_target(action, pre, 'Fixed A and B', ENTRY_SCHEMA)
        self.assertIsNone(target)
        self.assertEqual([gap.reason for gap in gaps], ['input_entry_target_unproven'])

    def test_native_authoring_exposes_the_same_switch_required_by_each_chain(self):
        self.assertIn('switch', author_tools(None).registry.registry.actions)

    def test_child_entry_click_cannot_compile_as_fixed_other_item_on_same_url(self):
        def node(backend, parent=None):
            value = SimpleNamespace(backend_node_id=backend, target_id='target-ABCD', frame_id=None,
                shadow_root_type=None, parent_node=parent, children_nodes=[])
            if parent is not None:
                parent.children_nodes.append(value)
            return value

        root = node(1)
        first, second, auxiliary = node(7, root), node(8, root), node(9, root)
        child = node(10, first)
        summary = SimpleNamespace(dom_state=SimpleNamespace(selector_map={3: child, 4: auxiliary}))

        class Element:
            def __init__(self, backend, text): self.backend, self.text = backend, text
            async def get_basic_info(self): return {'backendNodeId': self.backend}
            async def evaluate(self, _): return self.text

        class Page:
            async def get_target_info(self): return {'targetId': 'target-ABCD'}
            async def get_url(self): return ENTRY['url']
            async def get_elements_by_css_selector(self, selector):
                if selector == ':root': return [Element(2, '')]
                return [Element(7, 'Other record'), Element(8, ENTRY['text'])]

        class Browser:
            async def get_current_page(self): return Page()

        schema = {'type': 'object', 'properties': {'entry': ENTRY_SCHEMA}, 'required': ['entry']}
        selected_entry = {**ENTRY, 'backendNodeId': 8}
        related = entry_related_backends(summary, 3, 'target-ABCD')
        self.assertIn(first.backend_node_id, related)
        self.assertNotIn(second.backend_node_id, related)
        # 快照必须在 await 前冻结；后续 DOM 重建不能改变归属证据。
        child.parent_node = second
        fact = asyncio.run(entry_target_fact(Browser(), SimpleNamespace(backend=10),
            {'entry': selected_entry}, schema, 'a-1', related))
        self.assertEqual(fact.pop('factKind'), 'input_entry_mismatch')
        pre = SimpleNamespace(facts=[SimpleNamespace(kind='input_entry_mismatch', value=fact)],
                              url=ENTRY['url'], tabId='target-ABCD')
        target, _, gaps = natural_target(SimpleNamespace(name='click', id='a-1'), pre,
                                         'Fixed A and B', schema, pre)
        self.assertIsNone(target)
        self.assertEqual(gaps[0].reason, 'input_entry_target_unproven')
        auxiliary_fact = asyncio.run(entry_target_fact(Browser(), SimpleNamespace(backend=9),
            {'entry': selected_entry}, schema, 'a-2', entry_related_backends(summary, 4, 'target-ABCD')))
        self.assertEqual(auxiliary_fact['factKind'], 'input_entry_context')

    def test_input_entry_uses_the_existing_kind_and_value_evidence_digest(self):
        value = {'actionRef': 'a-1', 'binding': {'source': 'input', 'path': ['entry']},
                 'entry': ENTRY, 'backendNodeId': 7, 'targetId': 'target-ABCD'}
        fact = SimpleNamespace(kind='input_entry_target', value=value,
            sourceRefs=[SimpleNamespace(digest=digest({'kind': 'input_entry_target', 'value': value}))])
        pre = SimpleNamespace(facts=[fact], tabId='target-ABCD', url=ENTRY['url'])
        schema = {'type': 'object', 'properties': {'entry': ENTRY_SCHEMA}, 'required': ['entry']}
        target, _ = compiled_entry_target(SimpleNamespace(id='a-1'), pre, schema)
        self.assertEqual(target, {'strategy': 'entry', 'entryBinding': value['binding']})
        fact.sourceRefs[0].digest = digest(value)
        with self.assertRaisesRegex(ValueError, 'input_entry_target_invalid'):
            compiled_entry_target(SimpleNamespace(id='a-1'), pre, schema)

    def test_runtime_matches_native_identity_after_reordering_with_empty_or_duplicate_labels(self):
        class Element:
            def __init__(self, text, backend): self.text, self.backend = text, backend
            async def evaluate(self, _): return self.text
            async def get_basic_info(self): return {'backendNodeId': self.backend}

        class Page:
            elements = [Element('', 8), Element('', 7)]
            root = 2
            async def get_target_info(self): return {'targetId': 'target-ABCD'}
            async def get_url(self): return ENTRY['url']
            async def get_elements_by_css_selector(self, selector):
                return [Element('', self.root)] if selector == ':root' else self.elements

        class Browser:
            page = Page()
            async def get_current_page(self): return self.page

        browser = Browser()
        actual = asyncio.run(live_entry(browser, browser.page.elements[1], 'button', 2))
        self.assertEqual(actual['text'], '')
        self.assertEqual(actual['backendNodeId'], 7)
        self.assertIs(asyncio.run(resolve_entry_element(browser, actual)), browser.page.elements[1])
        browser.page.elements[0].text = browser.page.elements[1].text = ENTRY['text']
        self.assertIs(asyncio.run(resolve_entry_element(browser, actual)), browser.page.elements[1])
        browser.page.root = 99
        with self.assertRaisesRegex(ValueError, 'entry_source_page_changed'):
            asyncio.run(resolve_entry_element(browser, actual))
        browser.page.root = 2
        browser.page.elements[1].backend = 99
        with self.assertRaisesRegex(ValueError, 'entry_identity_missing_or_ambiguous'):
            asyncio.run(resolve_entry_element(browser, actual))
        browser.page.elements[1].backend = 7
        browser.page.elements.append(Element('', 7))
        with self.assertRaisesRegex(ValueError, 'entry_identity_missing_or_ambiguous'):
            asyncio.run(resolve_entry_element(browser, actual))

    def test_source_key_excludes_temporary_backend_and_document_identity(self):
        first = {'entry': ENTRY, 'key': 'old', 'label': 'same-source'}
        second = {**first, 'entry': {**ENTRY, 'backendNodeId': 70, 'documentRootId': 20}}
        self.assertEqual(entry_key_record(first, 'key', 'entry'), entry_key_record(second, 'key', 'entry'))


if __name__ == '__main__':
    unittest.main()
