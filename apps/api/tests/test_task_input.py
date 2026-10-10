"""CDP character context must preserve explicit parameters and stay within its event/session."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
import unittest

from browser_use_runner.task_input import adapt_key_events, adapt_typing_deadline
from browser_use.browser.events import TypeTextEvent, SendKeysEvent
from browser_use.dom.views import EnhancedDOMTreeNode
from bubus import EventBus


def typing_event(text, **kwargs):
    node = dict(node_id=1, backend_node_id=1, node_type=1, node_name='INPUT', node_value='', attributes={},
                is_scrollable=False, is_visible=True, absolute_position=None, target_id='test', frame_id=None,
                session_id=None, content_document=None, shadow_root_type=None, shadow_roots=[], parent_node=None,
                children_nodes=[], ax_node=None, snapshot_node=None)
    return TypeTextEvent(node=EnhancedDOMTreeNode(**node), text=text, **kwargs)


class KeyContextTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self):
        original = AsyncMock(return_value={'ack': True})
        channel = SimpleNamespace(dispatchKeyEvent=original)
        client = SimpleNamespace(send=SimpleNamespace(Input=channel))
        adapt_key_events(client, wait=AsyncMock())
        adapt_key_events(client)
        return channel.dispatchKeyEvent, original

    async def test_char_context_and_explicit_fields(self):
        send, original = self.fixture()
        down = {'type': 'keyDown', 'key': '2', 'code': 'Digit2', 'modifiers': 8}
        char = {'type': 'char', 'key': '@', 'text': '@'}
        await send(down, 'a')
        self.assertEqual(await send(char, 'a'), {'ack': True})
        self.assertEqual(original.await_args.args[0], {**char, 'code': 'Digit2', 'modifiers': 8})
        self.assertEqual(char, {'type': 'char', 'key': '@', 'text': '@'})
        await send(down, 'a')
        explicit = {**char, 'code': '', 'modifiers': 0}
        await send(explicit, 'a')
        self.assertEqual(original.await_args.args[0], explicit)

    async def test_other_session_keyup_and_consumed_context_cannot_leak(self):
        send, original = self.fixture()
        down = {'type': 'keyDown', 'code': 'Digit2', 'modifiers': 8}
        char = {'type': 'char', 'text': '@'}
        await send(down, 'a')
        await send(char, 'b')
        self.assertEqual(original.await_args.args[0], char)
        await send({'type': 'keyUp', 'code': 'Digit2'}, 'a')
        await send(char, 'a')
        self.assertEqual(original.await_args.args[0], char)
        await send(down, 'a'); await send(char, 'a'); await send(char, 'a')
        self.assertEqual(original.await_args.args[0], char)

    async def test_failed_or_cancelled_event_cannot_leave_context(self):
        for error in (RuntimeError('closed'), asyncio.CancelledError()):
            send, original = self.fixture()
            down = {'type': 'keyDown', 'code': 'Digit2', 'modifiers': 8}
            await send(down, 'a')
            original.side_effect = error
            with self.assertRaises(type(error)): await send({'type': 'char', 'text': '@'}, 'a')
            original.side_effect = None
            char = {'type': 'char', 'text': 'x'}
            await send(char, 'a')
            self.assertEqual(original.await_args.args[0], char)

    async def test_cancel_pacing_never_dispatches_key_or_changes_shortcuts(self):
        original, wait = AsyncMock(), AsyncMock(side_effect=asyncio.CancelledError())
        channel = SimpleNamespace(dispatchKeyEvent=original)
        adapt_key_events(SimpleNamespace(send=SimpleNamespace(Input=channel)), wait=wait)
        with self.assertRaises(asyncio.CancelledError):
            await channel.dispatchKeyEvent({'type':'keyDown','key':'a','code':'KeyA'}, 'a')
        original.assert_not_awaited()
        self.assertGreaterEqual(wait.await_args.args[0], .06)
        self.assertLessEqual(wait.await_args.args[0], 1.5)
        for key, modifiers in [('Tab',0),('Enter',0),('a',2),('a',4),('a',1)]:
            await channel.dispatchKeyEvent({'type':'keyDown','key':key,'modifiers':modifiers}, 'a')
        self.assertEqual(wait.await_count, 1)

    async def test_typing_deadline_only_accounts_for_added_wait_under_original_default(self):
        original = Mock(side_effect=lambda event: event)
        bus = SimpleNamespace(dispatch=original)
        adapt_typing_deadline(bus); adapt_typing_deadline(bus)
        event = typing_event('a' * 300)
        with patch.dict('os.environ', {}, clear=True): bus.dispatch(event)
        self.assertEqual(event.event_timeout, 510)
        self.assertIs(original.call_args.args[0], event)
        bus.dispatch(event)
        self.assertEqual(event.event_timeout, 510)
        for timeout in [None, 0, .01, 60]:
            explicit = typing_event('abc', event_timeout=timeout)
            bus.dispatch(explicit)
            self.assertEqual(explicit.event_timeout, timeout)
        configured = typing_event('abc')
        with patch.dict('os.environ', {'TIMEOUT_TypeTextEvent': '60'}): bus.dispatch(configured)
        self.assertEqual(configured.event_timeout, 60)
        other = SendKeysEvent(keys='Tab')
        prior = other.event_timeout; bus.dispatch(other)
        self.assertEqual(other.event_timeout, prior)

    async def test_original_bus_still_cancels_typing_at_explicit_timeout(self):
        bus, cancelled = EventBus(), asyncio.Event()
        async def type_handler(event: TypeTextEvent):
            try: await asyncio.sleep(5)
            finally: cancelled.set()
        bus.on(TypeTextEvent, type_handler)
        adapt_typing_deadline(bus)
        try:
            event = bus.dispatch(typing_event('abc', event_timeout=.02))
            await event
            with self.assertRaises(TimeoutError): await event.event_result(raise_if_any=True, raise_if_none=False)
            self.assertTrue(cancelled.is_set())
        finally: await bus.stop()


if __name__ == '__main__': unittest.main()
