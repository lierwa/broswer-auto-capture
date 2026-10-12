"""Exact native state values survive later Agent steps; failed reads add no page data."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from browser_use.agent.views import ActionResult, AgentStepInfo
from browser_use.agent.message_manager.service import MessageManager
from browser_use.llm.messages import SystemMessage
from workflow_use.hybrid.action_dispatch import ActionDispatchAudit, bind_tools_act


class QueryMemoryTests(unittest.IsolatedAsyncioTestCase):
    async def dispatch(self, name, result):
        tools = SimpleNamespace(act=AsyncMock(return_value=result))
        action = SimpleNamespace(model_dump=lambda **_: {name: {'selector': '#result'}})
        restore = bind_tools_act(tools, ActionDispatchAudit())
        try:
            value = await tools.act(action)
            tools.act.__wrapped__.assert_awaited_once()
            return value
        finally:
            restore()

    async def test_exact_query_attributes_survive_the_next_action_in_native_history(self):
        details = 'Found 1 element matching "#result":\n[0] <section> {data-state="running"}'
        result = await self.dispatch('find_elements', ActionResult(
            extracted_content=details, long_term_memory='Found 1 element matching "#result".'))
        manager = MessageManager(task='read final result', system_message=SystemMessage(content='test'),
                                 file_system=SimpleNamespace())
        initial = AgentStepInfo(step_number=0, max_steps=5)
        manager._update_agent_history_description(result=[result], step_info=initial)
        manager._update_agent_history_description(result=[ActionResult(long_term_memory='Later action')],
                                                  step_info=initial)
        self.assertIn(details, manager.agent_history_description)
        self.assertEqual(manager.state.read_state_description, '')
        self.assertEqual(result.extracted_content, details)

    async def test_page_search_still_exposes_details_once_and_keeps_native_summary(self):
        result = await self.dispatch('search_page', ActionResult(
            extracted_content='Original native search details', long_term_memory='Native count'))
        self.assertTrue(result.include_extracted_content_only_once)
        self.assertEqual(result.long_term_memory, 'Native count')

    async def test_failed_query_does_not_promote_partial_page_content(self):
        result = await self.dispatch('find_elements', ActionResult(error='query failed',
            extracted_content='partial private page', long_term_memory='Native failure'))
        self.assertEqual(result.long_term_memory, 'Native failure')
        self.assertFalse(result.include_extracted_content_only_once)
