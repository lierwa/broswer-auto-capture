"""Slow cooldown storage must not occupy the CDP message pump or escape the response gate."""
import asyncio
import tempfile
from threading import Event
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from browser_use import Browser
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.task_access import Admission
from browser_use_runner.task_browser import TaskBrowser
from browser_use_runner.access_cooldown import guard


class ResponseAdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_task_page_installs_response_gate(self):
        browser = TaskBrowser()
        session = SimpleNamespace(cdp_client=SimpleNamespace())
        with patch.object(Browser, 'get_or_create_cdp_session', AsyncMock(return_value=session)), \
                patch('browser_use_runner.task_browser.adapt_pointer'), \
                patch('browser_use_runner.task_browser.adapt_key_events'), \
                patch('browser_use_runner.task_browser.attach_access', AsyncMock()) as attach:
            await browser.get_or_create_cdp_session()
        self.assertTrue(attach.await_args.kwargs.get('observe_responses', False))

    async def test_network_receipt_keeps_document_status_without_synchronous_storage(self):
        runner = Runner()
        runner.allowed_sites = [{'scheme':'https', 'domain':'owned.invalid', 'port':None, 'includeSubdomains':False}]
        runner.browser = SimpleNamespace(_cdp_client_root=SimpleNamespace(send=SimpleNamespace(Fetch=SimpleNamespace(
            _bat_access=SimpleNamespace(browser_session=None, sessions={'owned-page'})))))
        event = {'type':'Document', 'requestId':'one', 'loaderId':'page',
                 'response':{'url':'https://owned.invalid/', 'status':403, 'headers':{'cf-mitigated':'challenge'}}}
        with patch('browser_use_runner.access_cooldown.remember') as persist:
            runner.record_document_response(event, 'owned-page')
        persist.assert_not_called()
        self.assertEqual(runner.document_status.error_for('https://owned.invalid/'), 'capture_verification_required_403')

    async def test_slow_response_storage_does_not_block_worker_event_and_precedes_continue(self):
        entered, release = Event(), Event()
        sent, worker = [], []
        async def send(method, params, sid): sent.append(method)
        def slow(*args):
            entered.set()
            if not release.wait(2): raise TimeoutError('test_storage_release_missing')
        gate = Admission(send)
        with patch('browser_use_runner.task_access.remember', side_effect=slow):
            try:
                gate.paused({'requestId':'response', 'request':{'url':'https://owned.invalid/'},
                             'responseStatusCode':200, 'resourceType':'XHR'}, 'owned-page')
                self.assertTrue(await asyncio.to_thread(entered.wait, 1))
                asyncio.get_running_loop().call_soon(worker.append, 'resumed')
                await asyncio.sleep(0)
                self.assertEqual(worker, ['resumed'])
                self.assertFalse(sent)
                release.set()
                await asyncio.gather(*gate.tasks)
                self.assertEqual(sent, ['continueRequest'])
            finally:
                release.set()
                await gate.close()

    async def test_response_storage_failure_stays_fail_closed(self):
        send = AsyncMock()
        gate = Admission(send)
        with patch('browser_use_runner.task_access.remember', side_effect=OSError('test_storage_failure')):
            await gate.decide({'requestId':'response', 'request':{'url':'https://owned.invalid/'},
                               'responseStatusCode':429, 'resourceType':'XHR'}, 'owned-page')
        self.assertEqual(gate.failure, 'capture_access_state_unavailable')
        self.assertEqual([call.args[0] for call in send.await_args_list], ['failRequest'])

    async def test_real_cooldown_is_persisted_before_response_delivery(self):
        import os
        with tempfile.TemporaryDirectory(prefix='bat-response-') as directory, \
                patch.dict(os.environ, {'BAT_ACCESS_STATE_DIR':directory}):
            async def send(method, params, sid):
                self.assertEqual(method, 'continueRequest')
                with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'):
                    await asyncio.to_thread(guard, 'https://owned.invalid/next')
            gate = Admission(send)
            await gate.decide({'requestId':'response', 'request':{'url':'https://owned.invalid/'},
                'responseStatusCode':429, 'responseHeaders':[{'name':'Retry-After','value':'60'}],
                'resourceType':'Document'}, 'owned-page')
            self.assertIsNone(gate.failure)
            self.assertEqual(gate.counts['observed-response:Document'], 1)


if __name__ == '__main__': unittest.main()
