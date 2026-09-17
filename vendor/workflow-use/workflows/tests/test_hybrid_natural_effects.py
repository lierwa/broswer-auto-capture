"""Natural effects use fixed live facts and each execution's own baseline."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.agent.views import ActionResult
from browser_use.tools.service import Tools

from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_effects import OVERLAY_SELECTOR
from workflow_use.hybrid.postconditions import capture_check_baselines, check_fact, declared_checks


class NaturalEffectTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.element = SimpleNamespace(
            evaluate=AsyncMock(),
            get_basic_info=AsyncMock(return_value={'backendNodeId': 10}),
        )
        self.page = SimpleNamespace(
            evaluate=AsyncMock(),
            get_target_info=AsyncMock(return_value={'targetId': 'target-1'}),
            get_element=AsyncMock(return_value=self.element),
            get_elements_by_css_selector=AsyncMock(return_value=[self.element]),
        )
        self.browser = SimpleNamespace(
            get_current_page=AsyncMock(return_value=self.page),
            get_browser_state_summary=AsyncMock(),
            get_selector_map=AsyncMock(return_value={
                7: {'backend_node_id': 10, 'target_id': 'target-1', 'frame_id': None}}),
        )

    async def test_scroll_settle_repeats_only_fact_read_and_executes_one_tool_action(self):
        self.page.evaluate.side_effect = [
            '{"x":0,"y":0}', '{"x":0,"y":0}', '{"x":0,"y":240}',
        ]
        tools = Tools()
        tools.act = AsyncMock(return_value=ActionResult())
        condition = {'kind': 'scroll_position', 'changed': True,
                     'settle': {'maxMs': 200, 'maxAttempts': 3, 'intervalMs': 10}}

        await OrdinaryCapability(self.browser, tools).execute_checked(
            'click', {}, {'strategy': 'css', 'value': '#load-more'}, [condition])

        tools.act.assert_awaited_once()
        self.assertEqual(self.page.evaluate.await_count, 3)

    async def test_target_state_changed_uses_resolved_current_run_baseline(self):
        self.element.evaluate.side_effect = [
            '{"aria-expanded":false,"disabled":false}',
            '{"aria-expanded":true,"disabled":false}',
        ]
        checks = declared_checks([{'kind': 'target_state', 'changed': True}], {},
                                 {'strategy': 'css', 'value': '#filter'})

        await capture_check_baselines(self.browser, checks)
        self.assertEqual(await check_fact(checks[0].parameters, self.browser),
                         (True, 'declared_fact_checked'))
        self.assertNotIn('text', checks[0].parameters['expected'])
        self.assertNotIn('value', checks[0].parameters['expected'])

    async def test_invisible_overlay_does_not_prove_open_until_native_dom_marks_visible(self):
        overlay = SimpleNamespace(get_basic_info=AsyncMock(side_effect=[
            {'backendNodeId': 20}, {'backendNodeId': 20}, {'backendNodeId': 20},
        ]))
        hidden = SimpleNamespace(backend_node_id=20, target_id='target-1', is_visible=False,
                                 node_name='DIV', attributes={'role': 'menu'}, children_nodes=[])
        visible = SimpleNamespace(backend_node_id=20, target_id='target-1', is_visible=True,
                                  node_name='DIV', attributes={'role': 'menu'}, children_nodes=[])
        self.page.get_elements_by_css_selector.return_value = [overlay]
        self.page.dom_service = SimpleNamespace(get_dom_tree=AsyncMock(side_effect=[
            (hidden, {}), (hidden, {}), (visible, {}),
        ]))
        checks = declared_checks([{'kind': 'visible_overlays', 'changed': True}], {}, None)

        await capture_check_baselines(self.browser, checks)
        self.assertEqual(checks[0].parameters['expected'], digest([]))
        self.assertEqual(await check_fact(checks[0].parameters, self.browser),
                         (False, 'declared_fact_checked'))
        self.assertEqual(await check_fact(checks[0].parameters, self.browser),
                         (True, 'declared_fact_checked'))
        self.page.get_elements_by_css_selector.assert_awaited_with(OVERLAY_SELECTOR)

    async def test_overlay_without_exact_native_visibility_identity_is_a_gap(self):
        overlay = SimpleNamespace(get_basic_info=AsyncMock(return_value={'backendNodeId': 20}))
        unrelated = SimpleNamespace(backend_node_id=21, target_id='target-1', is_visible=True,
                                    node_name='DIV', attributes={'role': 'menu'}, children_nodes=[])
        self.page.get_elements_by_css_selector.return_value = [overlay]
        self.page.dom_service = SimpleNamespace(get_dom_tree=AsyncMock(return_value=(unrelated, {})))
        checks = declared_checks([{'kind': 'visible_overlays', 'changed': True}], {}, None)

        with self.assertRaisesRegex(ValueError, 'visible_overlays_identity_unavailable'):
            await capture_check_baselines(self.browser, checks)


if __name__ == '__main__':
    unittest.main()
