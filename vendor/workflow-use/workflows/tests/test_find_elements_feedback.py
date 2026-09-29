"""The audit adapter must not add compilation evidence to native model feedback."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.agent.views import ActionResult
from browser_use.agent.message_manager.service import MessageManager
from workflow_use.hybrid.action_dispatch import ActionDispatchAudit, bind_tools_act


class FindElementsFeedbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_query_content_reaches_message_once_without_extra_dom_query(self):
        result = ActionResult(extracted_content='Native result.', long_term_memory='Native summary.')
        before = result.model_dump()
        native = AsyncMock(return_value=result)
        tools = SimpleNamespace(act=native)
        browser = SimpleNamespace(get_or_create_cdp_session=AsyncMock(
            side_effect=AssertionError('audit must not generate model-facing DOM context')))
        restore = bind_tools_act(tools, ActionDispatchAudit())
        try:
            action = SimpleNamespace(model_dump=lambda **_: {'find_elements': {'selector': 'main a'}})
            actual = await tools.act(action=action, browser_session=browser)
            self.assertIs(actual, result)
            self.assertEqual(result.model_dump(), {**before, 'include_extracted_content_only_once': True})
            manager = MessageManager.__new__(MessageManager)
            manager.state = SimpleNamespace(agent_history_items=[])
            manager._update_agent_history_description(result=[result], step_info=SimpleNamespace(step_number=0))
            self.assertIn('Native result.', manager.state.read_state_description)
            self.assertIn('Native summary.', manager.state.agent_history_items[0].action_results)
            self.assertNotIn('Native result.', manager.state.agent_history_items[0].action_results)
            browser.get_or_create_cdp_session.assert_not_called()
            native.assert_awaited_once()
        finally:
            restore()
        self.assertIs(tools.act, native)


if __name__ == '__main__':
    unittest.main()
