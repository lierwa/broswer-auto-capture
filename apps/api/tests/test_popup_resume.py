"""The Browser-Use owner's popup recovery must preserve attach and cleanup."""

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use_runner.hybrid_main import Runner
from browser_use_runner.popup_resume import PopupResumeAdapter


def browser_double(resume, original, *, kill=None):
    manager = SimpleNamespace(_handle_target_attached=original)
    runtime = SimpleNamespace(runIfWaitingForDebugger=AsyncMock(side_effect=resume))
    browser = SimpleNamespace(session_manager=manager,
                              _cdp_client_root=SimpleNamespace(send=SimpleNamespace(Runtime=runtime)),
                              start=AsyncMock(), kill=AsyncMock(side_effect=kill))
    return browser, manager, runtime


class PopupResumeTests(unittest.IsolatedAsyncioTestCase):
    async def test_page_resumes_before_original_for_both_debugger_flags(self):
        order = []

        async def resume(*, session_id):
            order.append(('resume', session_id))

        async def original(event):
            order.append(('original', event['sessionId']))

        browser, manager, runtime = browser_double(resume, original)
        adapter = PopupResumeAdapter(browser)
        for waiting in (False, True):
            await manager._handle_target_attached({'targetInfo': {'type': 'page'},
                                                   'sessionId': f'page-{waiting}',
                                                   'waitingForDebugger': waiting})
        self.assertEqual(order, [('resume', 'page-False'), ('original', 'page-False'),
                                 ('resume', 'page-True'), ('original', 'page-True')])
        self.assertEqual(runtime.runIfWaitingForDebugger.await_count, 2)
        self.assertEqual(adapter.snapshot(), {'attempts': 2, 'resumed': 2, 'errors': {}})
        adapter.close()
        self.assertIs(manager._handle_target_attached, original)

    async def test_timeout_and_closed_page_still_call_original(self):
        received = []

        async def original(event):
            received.append(event['sessionId'])

        async def hanging(*, session_id):
            await asyncio.sleep(1)

        browser, manager, runtime = browser_double(hanging, original)
        adapter = PopupResumeAdapter(browser, timeout_seconds=0.001)
        event = {'targetInfo': {'type': 'page'}, 'sessionId': 'slow'}
        await manager._handle_target_attached(event)
        runtime.runIfWaitingForDebugger.side_effect = RuntimeError('session closed')
        await manager._handle_target_attached({**event, 'sessionId': 'closed'})
        await manager._handle_target_attached({**event, 'targetInfo': {'type': 'worker'}, 'sessionId': 'worker'})
        self.assertEqual(received, ['slow', 'closed', 'worker'])
        self.assertEqual(adapter.snapshot(), {'attempts': 2, 'resumed': 0,
                                               'errors': {'TimeoutError': 1, 'RuntimeError': 1}})

    async def test_runner_restores_callback_even_when_browser_cleanup_is_unconfirmed(self):
        async def original(_event):
            pass

        browser, manager, _runtime = browser_double(None, original, kill=RuntimeError('close failed'))
        runner = Runner()
        with tempfile.TemporaryDirectory() as directory, \
                patch('browser_use_runner.hybrid_main.assert_runtime'), \
                patch('browser_use_runner.hybrid_main.owned_browser', return_value=browser):
            await runner.start_profile({'profilePath': str(Path(directory).resolve()), 'headless': True})
            self.assertIsNot(manager._handle_target_attached, original)
            result = await runner.close()
        self.assertFalse(result['closed'])
        self.assertIs(manager._handle_target_attached, original)
        self.assertIsNone(runner.browser)


if __name__ == '__main__':
    unittest.main()
