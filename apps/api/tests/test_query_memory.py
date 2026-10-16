"""Native query previews reach one read state without entering long-term history."""
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
        self.audit = ActionDispatchAudit()
        self.audit.propose(1, 0, action.model_dump())
        restore = bind_tools_act(tools, self.audit)
        try:
            value = await tools.act(action)
            tools.act.__wrapped__.assert_awaited_once()
            return value
        finally:
            restore()

    async def test_details_remain_in_source_without_becoming_long_term_history(self):
        details = 'Found 1 element matching "#result":\n[0] <section> {data-state="running"}'
        native = ActionResult(extracted_content=details,
                              long_term_memory='Found 1 element matching "#result".')
        expected = {**native.model_dump(mode='json'), 'include_extracted_content_only_once': True}
        result = await self.dispatch('find_elements', native)
        manager = MessageManager(task='read final result', system_message=SystemMessage(content='test'),
                                 file_system=SimpleNamespace())
        initial = AgentStepInfo(step_number=0, max_steps=5)
        manager._update_agent_history_description(result=[result], step_info=initial)
        self.assertIn(details, manager.state.read_state_description)
        self.assertNotIn(details, manager.agent_history_description)
        manager._update_agent_history_description(result=[ActionResult(long_term_memory='Later action')],
                                                  step_info=initial)
        self.assertNotIn(details, manager.agent_history_description)
        self.assertIn(native.long_term_memory, manager.agent_history_description)
        self.assertEqual(manager.state.read_state_description, '')
        self.assertIs(result, native)
        self.assertEqual(result.model_dump(mode='json'), expected)
        self.assertEqual(self.audit.entries[(1, 0)]['nativeResult'], expected)

    async def test_search_preserves_native_details_summary_and_content_policy(self):
        for once in (False, True):
            with self.subTest(once=once):
                native = ActionResult(extracted_content='Original native search details',
                    long_term_memory='Native count', include_extracted_content_only_once=once)
                expected = native.model_dump(mode='json')
                result = await self.dispatch('search_page', native)
                self.assertEqual(result.model_dump(mode='json'), expected)
                self.assertEqual(self.audit.entries[(1, 0)]['nativeResult'], expected)

    async def test_failed_query_does_not_promote_partial_page_content(self):
        result = await self.dispatch('find_elements', ActionResult(error='query failed',
            extracted_content='partial private page', long_term_memory='Native failure'))
        self.assertEqual(result.long_term_memory, 'Native failure')
        self.assertFalse(result.include_extracted_content_only_once)
