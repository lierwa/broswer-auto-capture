import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.agent.views import ActionResult
from browser_use.tools.service import Tools
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.targets import TARGET_ORDINAL_ARGUMENT


def node(backend, parent=None, *, index=None, title=None, xpath=None, target='tab-live', frame=None):
    ax = SimpleNamespace(role='link', name=title) if title else None
    return index, SimpleNamespace(backend_node_id=backend, parent_node=parent, target_id=target,
                                  frame_id=frame, xpath=xpath, ax_node=ax, is_visible=True)


def element(backend):
    return SimpleNamespace(get_basic_info=AsyncMock(return_value={'backendNodeId': backend}))


class FixturePage:
    def __init__(self):
        self.url = 'https://fixture.invalid/issues?page=2'
        self.queries = {}
        self.elements = {}

    async def get_url(self):
        return self.url

    async def get_target_info(self):
        return {'targetId': 'tab-live'}

    async def get_elements_by_css_selector(self, selector):
        return self.queries.get(selector, [])

    async def get_element(self, backend):
        return self.elements[backend]


class DomTargetTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.page = FixturePage()
        self.browser = SimpleNamespace(get_current_page=AsyncMock(return_value=self.page),
                                       get_browser_state_summary=AsyncMock(), get_selector_map=AsyncMock())
        self.tools = Tools()
        self.tools.act = AsyncMock(return_value=ActionResult(extracted_content='clicked'))
        self.adapter = OrdinaryCapability(self.browser, self.tools)
        self.target = {'strategy': 'structure', 'scope': {'url': self.page.url},
                       'container': {'kind': 'css', 'value': '.results'},
                       'items': {'kind': 'css', 'value': '.wrapper > .item'}, 'ordinal': 2,
                       'withinItem': {'kind': 'css', 'value': 'a.title'}}
        self._install_structure()

    def _install_structure(self):
        _, container = node(100)
        _, wrapper = node(101, container)
        _, item_a = node(110, wrapper)
        _, title_a = node(112, item_a, title='Alpha', xpath='/html/body/main/div/article[1]/a')
        _, item_b = node(120, wrapper)
        _, title_b = node(122, item_b, title='Beta', xpath='/html/body/main/div/article[2]/a')
        self.nodes = {'container': container, 'item_a': item_a, 'title_a': title_a,
                      'item_b': item_b, 'title_b': title_b}
        self.browser.get_selector_map.return_value = {7: title_a, 19: title_b}
        self.page.queries = {'.results': [element(100)],
                             ':is(.results) :is(.wrapper > .item)': [element(110), element(120)],
                             ':is(:is(.results) :is(.wrapper > .item)) :is(a.title)': [element(112), element(122)]}

    async def test_wrapper_collection_re_resolves_current_order_and_runtime_ordinal(self):
        bound = {**self.target, 'ordinalBinding': {'source': 'input', 'path': ['issueOrdinal']}}
        await self.adapter.execute('click', {TARGET_ORDINAL_ARGUMENT: 2}, bound)
        self.assertEqual(self.tools.act.await_args.args[0].model_dump(exclude_unset=True), {'click': {'index': 19}})
        self.tools.act.reset_mock()
        _, container = node(200)
        _, wrapper = node(201, container)
        _, renamed_b = node(220, wrapper)
        _, renamed_b_title = node(222, renamed_b, title='Renamed Beta')
        _, renamed_a = node(210, wrapper)
        _, renamed_a_title = node(212, renamed_a, title='Renamed Alpha')
        self.browser.get_selector_map.return_value = {31: renamed_b_title, 37: renamed_a_title}
        self.page.queries['.results'] = [element(200)]
        self.page.queries[':is(.results) :is(.wrapper > .item)'] = [element(220), element(210)]
        self.page.queries[':is(:is(.results) :is(.wrapper > .item)) :is(a.title)'] = [element(222), element(212)]
        await self.adapter.execute('click', {TARGET_ORDINAL_ARGUMENT: 2}, bound)
        self.assertEqual(self.tools.act.await_args.args[0].model_dump(exclude_unset=True), {'click': {'index': 37}})
        self.assertEqual(self.browser.get_browser_state_summary.await_count, 2)

    async def test_item_root_and_explicit_title_are_distinct_targets(self):
        self.browser.get_selector_map.return_value[23] = self.nodes['item_b']
        root = {**self.target, 'withinItem': None}
        await self.adapter.execute('click', {}, root)
        self.assertEqual(self.tools.act.await_args.args[0].model_dump(exclude_unset=True), {'click': {'index': 23}})
        self.tools.act.reset_mock()
        await self.adapter.execute('click', {}, {'strategy': 'title', 'role': 'link', 'name': 'Beta'})
        self.assertEqual(self.tools.act.await_args.args[0].model_dump(exclude_unset=True), {'click': {'index': 19}})

    async def test_duplicate_container_and_wrong_scope_fail_before_action(self):
        self.page.queries['.results'] = [element(100), element(200)]
        with self.assertRaisesRegex(ValueError, 'ambiguous_structure_container'):
            await self.adapter.execute('click', {}, self.target)
        self.page.queries['.results'] = [element(100)]
        wrong = {**self.target, 'scope': {'url': 'https://fixture.invalid/other'}}
        with self.assertRaisesRegex(ValueError, 'target_scope_mismatch'):
            await self.adapter.execute('click', {}, wrong)
        with self.assertRaisesRegex(ValueError, 'target_position_unavailable'):
            await self.adapter.execute('click', {}, {**self.target, 'ordinal': 3})
        self.tools.act.assert_not_awaited()

    async def test_structure_failure_does_not_fall_back_to_sample_title(self):
        self.page.queries[':is(:is(.results) :is(.wrapper > .item)) :is(a.title)'] = []
        with self.assertRaisesRegex(ValueError, 'ambiguous_or_missing_item_target'):
            await self.adapter.execute('click', {}, self.target)
        self.tools.act.assert_not_awaited()

    async def test_selector_lists_keep_container_scope(self):
        grouped = {**self.target, 'container': {'kind': 'css', 'value': '#left,#right'},
                   'items': {'kind': 'css', 'value': '.primary,.secondary'}, 'ordinal': 1}
        self.page.queries['#left,#right'] = [element(100)]
        self.page.queries[':is(#left,#right) :is(.primary,.secondary)'] = [element(120)]
        self.page.queries[':is(:is(#left,#right) :is(.primary,.secondary)) :is(a.title)'] = [element(122)]
        await self.adapter.execute('click', {}, grouped)
        self.assertEqual(self.tools.act.await_args.args[0].model_dump(exclude_unset=True), {'click': {'index': 19}})

    async def test_exact_xpath_uses_only_fresh_current_document_node(self):
        target = {'strategy': 'xpath', 'scope': {'url': self.page.url},
                  'value': '/html/body/main/div/article[2]/a'}
        await self.adapter.execute('click', {}, target)
        self.assertEqual(self.tools.act.await_args.args[0].model_dump(exclude_unset=True), {'click': {'index': 19}})
        self.tools.act.reset_mock()
        _, iframe = node(222, xpath=target['value'], frame='iframe-live')
        self.browser.get_selector_map.return_value = {31: iframe}
        with self.assertRaisesRegex(ValueError, 'ambiguous_or_missing'):
            await self.adapter.execute('click', {}, target)
        self.tools.act.assert_not_awaited()
        _, duplicate = node(222, xpath=target['value'])
        self.browser.get_selector_map.return_value = {19: self.nodes['title_b'], 31: duplicate}
        with self.assertRaisesRegex(ValueError, 'ambiguous_or_missing'):
            await self.adapter.execute('click', {}, target)
        self.tools.act.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
