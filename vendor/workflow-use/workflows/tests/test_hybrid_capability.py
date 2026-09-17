"""Ordinary execution delegates one validated action to upstream and cannot fall back to a model."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.agent.views import ActionResult
from browser_use.tools.service import Tools
from workflow_use.hybrid.capability import OrdinaryCapability


class CapabilityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.page = SimpleNamespace(get_elements_by_css_selector=AsyncMock(),
                                    get_target_info=AsyncMock(return_value={'targetId': 'tab-live'}),
                                    get_url=AsyncMock(return_value='https://fixture.invalid/'))
        self.browser = SimpleNamespace(get_current_page=AsyncMock(return_value=self.page),
                       get_browser_state_summary=AsyncMock(), get_selector_map=AsyncMock())
        self.tools = Tools()
        self.tools.act = AsyncMock(return_value=ActionResult(extracted_content='fixture'))
        self.adapter = OrdinaryCapability(self.browser, self.tools)

    async def test_ordinal_resolves_fresh_backend_identity_and_uses_upstream_action(self):
        elements = [SimpleNamespace(get_basic_info=AsyncMock(return_value={'backendNodeId': item})) for item in (10, 20)]
        self.page.get_elements_by_css_selector.return_value = elements
        self.browser.get_selector_map.return_value = {
            7: {'backend_node_id': 10, 'target_id': 'tab-live', 'frame_id': None},
            19: {'backend_node_id': 20, 'target_id': 'tab-live', 'frame_id': None}}
        await self.adapter.execute('click', {}, {'strategy': 'ordinal', 'container': '.entries', 'ordinal': 2})
        action = self.tools.act.await_args.args[0].model_dump(exclude_unset=True)
        self.assertEqual(action, {'click': {'index': 19}})
        self.assertIsNone(self.tools.act.await_args.kwargs['page_extraction_llm'])
        self.browser.get_browser_state_summary.assert_awaited_once()

    async def test_missing_ordinal_fails_without_action(self):
        self.page.get_elements_by_css_selector.return_value = []
        self.browser.get_selector_map.return_value = {}
        with self.assertRaisesRegex(ValueError, 'target_position_unavailable'):
            await self.adapter.execute('click', {}, {'strategy': 'ordinal', 'container': '.entries', 'ordinal': 2})
        self.tools.act.assert_not_awaited()

    async def test_role_name_uses_upstream_ax_and_rejects_ambiguous_matches(self):
        node = SimpleNamespace(ax_node=SimpleNamespace(role='button', name='Save'), is_visible=True,
                               target_id='tab-live', frame_id=None, shadow_root_type=None)
        self.browser.get_selector_map.return_value = {7: node}
        await self.adapter.execute('click', {}, {'strategy': 'title', 'role': 'button', 'name': 'Save'})
        self.assertEqual(self.tools.act.await_args.args[0].model_dump(exclude_unset=True), {'click': {'index': 7}})
        self.tools.act.reset_mock()
        self.browser.get_selector_map.return_value = {7: node, 9: node}
        with self.assertRaisesRegex(ValueError, 'ambiguous_or_missing'):
            await self.adapter.execute('click', {}, {'strategy': 'title', 'role': 'button', 'name': 'Save'})
        self.tools.act.assert_not_awaited()

    async def test_model_script_file_actions_and_raw_indices_rejected(self):
        for name in ('extract', 'evaluate', 'write_file', 'future_action'):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'unsupported_ordinary_capability'):
                await self.adapter.execute(name, {})
        with self.assertRaisesRegex(ValueError, 'ephemeral_target_argument'):
            await self.adapter.execute('click', {'index': 1})
        self.tools.act.assert_not_awaited()

    async def test_declared_url_is_exact_and_failed_effect_never_retries(self):
        self.page.get_url = AsyncMock(return_value='https://fixture.invalid/expected-extra')
        args = {'url': 'https://fixture.invalid/expected', 'new_tab': False}
        with self.assertRaisesRegex(RuntimeError, 'ordinary_postcondition_failed'):
            await self.adapter.execute_checked('navigate', args, None, [{'kind': 'url', 'bindingArgument': 'url'}])
        self.tools.act.assert_awaited_once()
        self.page.get_url.return_value = args['url']
        output = await self.adapter.execute_checked(
            'navigate', args, None, [{'kind': 'url', 'bindingArgument': 'url'}])
        self.assertEqual(output['extracted_content'], 'fixture')
        self.assertIsNone(output['error'])

    async def test_unknown_postcondition_rejected_before_action(self):
        with self.assertRaises(ValueError):
            await self.adapter.execute_checked('navigate', {'url': 'https://fixture.invalid/'}, None,
                                               [{'kind': 'assume_success', 'equals': 'yes'}])
        self.tools.act.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
