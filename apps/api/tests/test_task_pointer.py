"""Protect cancellation and unchanged clicks/dragging around the pointer adapter."""
import asyncio
from types import SimpleNamespace
import unittest
from browser_use_runner.runtime_diagnostics import attach_pointer_counts, pointer_counts

from browser_use_runner.task_pointer import adapt_pointer, trajectory


class PointerTests(unittest.IsolatedAsyncioTestCase):
    def client(self):
        calls = []
        async def original(params, session_id=None):
            calls.append((params, session_id))
            return {'original': True}
        channel = SimpleNamespace(dispatchMouseEvent=original)
        return SimpleNamespace(send=SimpleNamespace(Input=channel)), calls

    async def test_cancel_during_path_never_sends_endpoint_or_click(self):
        client, calls = self.client()
        entered = asyncio.Event()
        async def pending(start, end):
            entered.set()
            await asyncio.Event().wait()
        adapt_pointer(client, pending)
        send = client.send.Input.dispatchMouseEvent
        await send({'type': 'mouseMoved', 'x': 1, 'y': 1}, 'owned')
        task = asyncio.create_task(send({'type': 'mouseMoved', 'x': 100, 'y': 90}, 'owned'))
        await entered.wait(); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertEqual(len(calls), 1)

    async def test_drag_pen_other_session_and_button_arguments_stay_original(self):
        client, calls = self.client()
        generated = []
        async def forbidden(*args):
            generated.append(args)
            return []
        adapt_pointer(client, forbidden)
        requests = [({'type': 'mouseMoved', 'x': 1, 'y': 1}, 'a'),
                    ({'type': 'mousePressed', 'x': 1, 'y': 1, 'button': 'right', 'clickCount': 2, 'modifiers': 8}, 'a'),
                    ({'type': 'mouseMoved', 'x': 80, 'y': 90}, 'a'),
                    ({'type': 'mouseReleased', 'x': 80, 'y': 90, 'button': 'right'}, 'a'),
                    ({'type': 'mouseMoved', 'x': 150, 'y': 90, 'pointerType': 'pen'}, 'a'),
                    ({'type': 'mouseMoved', 'x': 250, 'y': 90}, 'b')]
        for params, session in requests:
            self.assertEqual(await client.send.Input.dispatchMouseEvent(params, session), {'original': True})
        self.assertEqual(calls, requests)
        self.assertEqual(generated, [])

    async def test_real_library_path_and_degenerate_endpoint(self):
        start, end = {'x': 30, 'y': 40}, {'x': 900, 'y': 600}
        points = await trajectory(start, end)
        self.assertGreater(len(points), 5)
        self.assertEqual({k: points[-1][k] for k in ('x', 'y')}, end)
        self.assertGreater(points[-1]['at'], 30)
        self.assertEqual(await trajectory(start, start), [])

    async def test_unavailable_path_keeps_original_action_and_reports_failure(self):
        client, calls = self.client()
        async def unavailable(*args): raise ValueError('unavailable')
        adapt_pointer(client, unavailable)
        await client.send.Input.dispatchMouseEvent({'type': 'mouseMoved', 'x': 1, 'y': 1}, 'a')
        with self.assertLogs('browser_use_runner.task_pointer', level='WARNING') as log:
            result = await client.send.Input.dispatchMouseEvent({'type': 'mouseMoved', 'x': 90, 'y': 90}, 'a')
        self.assertEqual(result, {'original': True})
        self.assertEqual(len(calls), 2)
        self.assertIn('input_trajectory_unavailable', log.output[0])

    async def test_cancelled_and_failed_native_sends_remain_distinct_from_no_attempt(self):
        client, calls = self.client()
        entered = asyncio.Event()
        async def original(params, session_id=None):
            calls.append(params['type'])
            if params['type'] == 'mousePressed':
                entered.set()
                await asyncio.Event().wait()
            if params['type'] == 'mouseReleased': raise RuntimeError('private protocol message')
            return {}
        client.send.Input.dispatchMouseEvent = original
        adapt_pointer(client)
        browser = SimpleNamespace(_cdp_client_root=client)
        await client.send.Input.dispatchMouseEvent({'type': 'mouseMoved', 'x': 1, 'y': 1}, 'owned')
        before = pointer_counts(browser)
        task = asyncio.create_task(client.send.Input.dispatchMouseEvent(
            {'type': 'mousePressed', 'x': 1, 'y': 1}, 'owned'))
        await entered.wait(); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        with self.assertRaisesRegex(RuntimeError, 'private protocol message'):
            await client.send.Input.dispatchMouseEvent({'type': 'mouseReleased', 'x': 1, 'y': 1}, 'owned')
        error = RuntimeError('missing events')
        error.event_capture = {'status': 'missing', 'events': 0, 'limitations': 0}
        attach_pointer_counts(error, before, pointer_counts(browser))
        self.assertEqual(error.event_capture['inputAcknowledgements'], dict.fromkeys(before.keys() - {'outcomes'}, 0))
        self.assertEqual(error.event_capture['inputDispatch'], {
            'mouseMoved': {'attempted': 0, 'cancelled': 0, 'failed': 0},
            'mousePressed': {'attempted': 1, 'cancelled': 1, 'failed': 0},
            'mouseReleased': {'attempted': 1, 'cancelled': 0, 'failed': 1}})
        self.assertEqual(calls, ['mouseMoved', 'mousePressed', 'mouseReleased'])
        self.assertNotIn('private', str(error.event_capture))


if __name__ == '__main__': unittest.main()
