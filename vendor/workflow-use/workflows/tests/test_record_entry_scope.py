"""Protect whole-record inputs and observed descendant operations across repeated tasks."""
import asyncio
import unittest
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace as Node

from workflow_use.hybrid.entry_record_scope import record_roots, record_selector
from workflow_use.hybrid.entry_descendant import capture_entry_descendants, resolve_entry_descendant
from workflow_use.hybrid.element_entry import ENTRY_SCHEMA, entry_related_backends, entry_target_fact, compiled_entry_target
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.target_contract import validate_target
from workflow_use.hybrid.natural_target_compile import natural_target


def snapshot():
    def node(tag, backend, parent=None):
        value = Node(node_name=tag, backend_node_id=backend, target_id='target-ABCD',
            frame_id=None, shadow_root_type=None, parent_node=parent, children_nodes=[],
            attributes={}, is_visible=True)
        if parent is not None:
            parent.children_nodes.append(value)
        return value
    root = node('#document', 1)
    html = node('html', 2, root)
    body = node('body', 3, html)
    cards = [node('article', backend, body) for backend in (11, 21)]
    leaves = [node('div', backend, parent) for backend, parent in zip((12, 22), cards)]
    controls = [node('a', backend, parent) for backend, parent in zip((13, 23), cards)]
    return Node(dom_state=Node(selector_map={7: leaves[0], 8: leaves[1], 9: controls[0], 10: controls[1]},
                              _root=Node(original_node=root))), body, cards, leaves


ENTRY = {'kind': 'element', 'tabId': 'ABCD', 'url': 'https://example.test/list',
         'selector': 'body > article', 'ordinal': 1, 'text': 'First record', 'backendNodeId': 11, 'documentRootId': 2}
SCHEMA = {'type': 'object', 'properties': {'entry': ENTRY_SCHEMA}, 'required': ['entry']}


class RecordEntryScopeTests(unittest.TestCase):
    def test_backend_survives_document_refresh_but_changed_document_is_rejected(self):
        class NativeDom:
            def __init__(self): self.generation = 0; self.selected_generation = None
            async def getDocument(self, **kwargs):
                self.generation += 1
                return {'root': {'nodeId': self.generation}}
            async def pushNodesByBackendIdsToFrontend(self, **kwargs): return {'nodeIds': [11]}
            async def querySelectorAll(self, **kwargs):
                self.selected_generation = self.generation
                return {'nodeIds': [13]}
            async def describeNode(self, **kwargs):
                if self.selected_generation != self.generation:
                    raise RuntimeError('frontend_node_identity_expired')
                return {'node': {'backendNodeId': 13}}
        class Page:
            def __init__(self, dom): self.dom = dom; self.root_backend = 2
            async def get_target_info(self): return {'targetId': 'target-ABCD'}
            async def get_url(self): return ENTRY['url']
            async def get_elements_by_css_selector(self, selector):
                await self.dom.getDocument()
                return [Node(get_basic_info=AsyncMock(return_value={'backendNodeId': self.root_backend}))]
            async def get_element(self, backend): return Node(backend=backend)
        async def verify():
            dom = NativeDom(); page = Page(dom)
            cdp = Node(session_id='owned', cdp_client=Node(send=Node(DOM=dom)))
            browser = Node(get_current_page=AsyncMock(return_value=page),
                           get_or_create_cdp_session=AsyncMock(return_value=cdp))
            from workflow_use.hybrid.element_entry import ElementEntry
            entry = ElementEntry.model_validate(ENTRY)
            self.assertEqual((await resolve_entry_descendant(browser, entry, ':scope > a')).backend, 13)
            page.root_backend = 99
            with self.assertRaisesRegex(ValueError, 'entry_source_page_changed'):
                await resolve_entry_descendant(browser, entry, ':scope > a')
        asyncio.run(verify())

    def test_full_collection_maps_to_disjoint_record_roots_in_order(self):
        _, body, cards, leaves = snapshot()
        roots, steps = record_roots(leaves)
        self.assertEqual(roots, cards)
        self.assertEqual(steps, [1, 1])
        self.assertEqual(record_selector(body, roots), 'body > article')
        # 单个已观察成员不能据此扩大到全页；直接按钮的集合也保持原边界。
        self.assertEqual(record_roots([leaves[0]])[0], [leaves[0]])
        self.assertEqual(record_roots(cards)[0], cards)

    def test_click_binding_is_inside_current_record_and_cannot_select_another_record(self):
        seen, _, _, _ = snapshot()
        seen.dom_state.selector_map[9].parent_node.is_visible = False
        selected = capture_entry_descendants(seen, 9, 'target-ABCD', {'entry': ENTRY}, SCHEMA)
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0].selector, ':scope > a')
        self.assertEqual(capture_entry_descendants(seen, 10, 'target-ABCD', {'entry': ENTRY}, SCHEMA), ())

        class Element:
            def __init__(self, backend): self.backend = backend
            async def get_basic_info(self): return {'backendNodeId': self.backend}
        class Page:
            async def get_target_info(self): return {'targetId': 'target-ABCD'}
            async def get_url(self): return ENTRY['url']
            async def get_elements_by_css_selector(self, selector):
                return [Element(2)] if selector == ':root' else [Element(11), Element(21)]
        class Browser:
            async def get_current_page(self): return Page()

        with patch('workflow_use.hybrid.entry_descendant.resolve_entry_descendant',
                   new=AsyncMock(return_value=Element(13))):
            fact = asyncio.run(entry_target_fact(Browser(), Node(backend=13), {'entry': ENTRY}, SCHEMA, 'a-1',
                entry_related_backends(seen, 9, 'target-ABCD'), selected))
        self.assertEqual(fact['withinEntry'], ':scope > a')
        pre = Node(facts=[Node(kind='input_entry_target', value=fact,
            sourceRefs=[Node(digest=digest({'kind': 'input_entry_target', 'value': fact}))])],
            tabId='target-ABCD', url=ENTRY['url'])
        target, _ = compiled_entry_target(Node(id='a-1'), pre, SCHEMA)
        self.assertEqual(target['withinEntry'], ':scope > a')
        self.assertEqual(target['entryBinding'], {'source': 'input', 'path': ['entry']})
        with self.assertRaisesRegex(ValueError, 'invalid_entry_descendant'):
            validate_target({'strategy': 'entry', 'entry': ENTRY, 'withinEntry': ':scope > a,body'})

    def test_native_binding_query_and_backend_failure_cannot_restore_fixed_target(self):
        seen, _, _, _ = snapshot()
        selected = capture_entry_descendants(seen, 9, 'target-ABCD', {'entry': ENTRY}, SCHEMA)
        related = entry_related_backends(seen, 9, 'target-ABCD')
        root = Node(get_basic_info=AsyncMock(return_value={'backendNodeId': 2}))
        records = [Node(get_basic_info=AsyncMock(return_value={'backendNodeId': backend})) for backend in (11, 21)]
        page = Node(get_target_info=AsyncMock(return_value={'targetId': 'target-ABCD'}),
                    get_url=AsyncMock(return_value=ENTRY['url']),
                    get_elements_by_css_selector=AsyncMock(side_effect=lambda selector: [root] if selector == ':root' else records))
        browser = Node(get_current_page=AsyncMock(return_value=page))
        broken = Node(get_basic_info=AsyncMock(side_effect=RuntimeError('native_identity_read_failed')))
        for resolver in (AsyncMock(side_effect=TimeoutError('native_query_timeout')), AsyncMock(return_value=broken)):
            with self.subTest(resolver=resolver), patch('workflow_use.hybrid.entry_descendant.resolve_entry_descendant', new=resolver):
                fact = asyncio.run(entry_target_fact(browser, Node(backend=13), {'entry': ENTRY}, SCHEMA,
                                                     'a-1', related, selected))
                self.assertEqual(fact['factKind'], 'input_entry_mismatch')
                target, _, gaps = natural_target(Node(name='click', id='a-1'),
                    Node(facts=[Node(kind=fact['factKind'])]), 'Open an entry', SCHEMA)
                self.assertIsNone(target)
                self.assertEqual([gap.reason for gap in gaps], ['input_entry_target_unproven'])


if __name__ == '__main__':
    unittest.main()
