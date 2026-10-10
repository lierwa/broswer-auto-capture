"""Native range positioning must not click an occluder or leave a button down on cancellation."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import unittest

from browser_use_runner.task_special_input import fill_color, range_position


class RangeTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self, hit=True):
        mouse = SimpleNamespace(move=AsyncMock(), click=AsyncMock())
        commands = SimpleNamespace(Input=SimpleNamespace(dispatchMouseEvent=AsyncMock()),
            Page=SimpleNamespace(getLayoutMetrics=AsyncMock(return_value={'cssLayoutViewport': {'pageX': 17, 'pageY': 33}})),
            DOM=SimpleNamespace(scrollIntoViewIfNeeded=AsyncMock(),
                getNodeForLocation=AsyncMock(return_value={'backendNodeId': 1 if hit else 9}), getBoxModel=AsyncMock(side_effect=[
                {'model': {'border': [10, 0, 26, 0, 26, 16, 10, 16]}},
                {'model': {'content': [0, 0, 400, 0, 400, 16, 0, 16]}}])),
            Runtime=SimpleNamespace(callFunctionOn=AsyncMock(return_value={'result': {'value': hit}})))
        class Page:
            _session_id = 'owned-range'
            _client = SimpleNamespace(send=commands)
            @property
            async def mouse(self): return mouse
        node = {'backendNodeId': 1, 'shadowRoots': [{'children': [
            {'backendNodeId': 2, 'attributes': ['id', 'track']},
            {'backendNodeId': 3, 'attributes': ['id', 'thumb']}]}]}
        return Page(), node, mouse, commands

    async def test_occluded_control_never_moves_or_clicks(self):
        page, node, mouse, commands = self.fixture(False)
        self.assertIsNone(await range_position(page, node, .33, 'object', False, False))
        mouse.move.assert_not_awaited()
        mouse.click.assert_not_awaited()
        commands.Input.dispatchMouseEvent.assert_not_awaited()

    async def test_cancel_releases_only_owned_button_and_preserves_cancellation(self):
        page, node, mouse, commands = self.fixture()
        mouse.click.side_effect = asyncio.CancelledError
        with self.assertRaises(asyncio.CancelledError):
            await range_position(page, node, .33, 'object', False, False)
        mouse.click.assert_awaited_once()
        released = commands.Input.dispatchMouseEvent.await_args.kwargs
        self.assertEqual(released['session_id'], 'owned-range')
        self.assertEqual(released['params']['type'], 'mouseReleased')
        self.assertEqual(released['params']['clickCount'], 0)
        self.assertEqual((released['params']['x'], released['params']['y']), mouse.click.await_args.args)
        hit = commands.DOM.getNodeForLocation.await_args.kwargs['params']
        self.assertEqual((hit['x'], hit['y']), (released['params']['x'] + 17, released['params']['y'] + 33))


class ColorTests(unittest.IsolatedAsyncioTestCase):
    async def test_partial_native_input_error_never_silently_falls_back(self):
        await self.failed_input(RuntimeError('transport unavailable'), RuntimeError)

    async def test_cancel_preserves_cancellation_and_closes_owned_popup(self):
        await self.failed_input(asyncio.CancelledError(), asyncio.CancelledError)

    async def failed_input(self, error, expected):
        commands = SimpleNamespace(Accessibility=SimpleNamespace(enable=AsyncMock(), getPartialAXTree=AsyncMock()),
            DOM=SimpleNamespace(focus=AsyncMock()), Input=SimpleNamespace(dispatchKeyEvent=AsyncMock(side_effect=error)))
        page = SimpleNamespace(_session_id='owned-color', _client=SimpleNamespace(send=commands), press=AsyncMock(),
            get_element=AsyncMock(return_value=SimpleNamespace(click=AsyncMock())))
        with patch('browser_use_runner.task_special_input.color_fields', AsyncMock(return_value={'hexValueContainer': 2})):
            with self.assertRaises(expected):
                await fill_color(page, {'backendNodeId': 1}, '#12345680', 'Win32', True)
        commands.Input.dispatchKeyEvent.assert_awaited_once()
        self.assertEqual(page.press.await_args_list[-1].args, ('Escape',))


if __name__ == '__main__': unittest.main()
