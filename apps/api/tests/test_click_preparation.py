"""One click after preparation; preserve cancellation and task-local pointer timing."""
import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from browser_use_runner.task_input import TaskElement
from browser_use_runner.task_pointer import adapt_pointer, native_pointer_timing


class ClickPreparationTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_before_click_does_not_dispatch_click(self):
        element = TaskElement.__new__(TaskElement)
        element._task_page = SimpleNamespace(get_url=AsyncMock(return_value='https://owned.invalid/'))
        entered = asyncio.Event()
        async def pending(_element):
            entered.set()
            await asyncio.Event().wait()
        with patch('browser_use_runner.task_input.hover_before_click', pending), \
                patch('browser_use.actor.element.Element.click', new_callable=AsyncMock) as click:
            task = asyncio.create_task(element.click())
            await entered.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError): await task
            click.assert_not_awaited()

    async def test_original_button_count_and_modifiers_are_retained(self):
        element = TaskElement.__new__(TaskElement)
        element._task_page = SimpleNamespace(get_url=AsyncMock(return_value='https://owned.invalid/'))
        with patch('browser_use_runner.task_input.hover_before_click', new_callable=AsyncMock) as hover, \
                patch('browser_use.actor.element.Element.click', new_callable=AsyncMock) as click:
            await element.click(button='right', click_count=2, modifiers=['Shift'])
            hover.assert_awaited_once_with(element)
            click.assert_awaited_once_with(button='right', click_count=2, modifiers=['Shift'])

    async def test_native_timing_is_local_and_restored_after_error(self):
        native, generate = AsyncMock(return_value={}), AsyncMock(return_value=[])
        client = SimpleNamespace(send=SimpleNamespace(Input=SimpleNamespace(dispatchMouseEvent=native)))
        adapt_pointer(client, generate)
        send = client.send.Input.dispatchMouseEvent
        def point(x): return {'type':'mouseMoved','x':x,'y':1}
        await send(point(1), 'click')
        await send(point(1), 'independent')
        entered, release = asyncio.Event(), asyncio.Event()
        async def clicking():
            try:
                with native_pointer_timing():
                    await send(point(100), 'click')
                    entered.set()
                    await release.wait()
                    raise ValueError('original failure')
            except ValueError:
                await send(point(200), 'click')
        task = asyncio.create_task(clicking())
        await entered.wait()
        self.assertEqual(generate.await_count, 0)
        await send(point(100), 'independent')
        self.assertEqual(generate.await_count, 1)
        release.set()
        await task
        self.assertEqual(generate.await_count, 2)
        self.assertEqual(native.await_count, 5)


if __name__ == '__main__': unittest.main()
