"""Protect explicit server cooldown, persisted isolation, and pre-request boundaries."""
import asyncio
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import tempfile
from threading import Thread
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'vendor/workflow-use/workflows'))
from diskcache import Cache
from playwright.async_api import async_playwright
from browser_use_runner.access_cooldown import guard, key, remember
from browser_use_runner.account_browser_http import browser_request
from browser_use_runner.account_borrow import CheckPage
from browser_use_runner.account_session import open_page
from browser_use_runner.account_auth import storage_origin
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.access_policy import Policies, acquire
from browser_use_runner.task_access import Admission


class Cooldown(unittest.IsolatedAsyncioTestCase):
    def test_explicit_challenge_retains_status_and_document_scope(self):
        runner = Runner()
        url = 'https://owned.invalid/challenge'
        def record(status, headers=None, kind='Document', target=url):
            runner.document_status.record({'type': kind, 'response': {'url': target, 'status': status, 'headers': headers or {}}})
        record(403, {'cf-mitigated': 'challenge'})
        with self.assertRaisesRegex(RuntimeError, '^capture_verification_required_403$'):
            runner.assert_document_access(url)
        record(200)
        runner.assert_document_access(url)
        record(403, {'cf-mitigated': 'challenge'}, 'Fetch')
        runner.assert_document_access(url)
        record(403, {'cf-mitigated': 'other'})
        with self.assertRaisesRegex(RuntimeError, '^capture_access_denied$'): runner.assert_document_access(url)
        record(200, {'CF-Mitigated': 'challenge'})
        with self.assertRaisesRegex(RuntimeError, '^capture_verification_required_200$'): runner.assert_document_access(url)
        runner.document_status.pop(url, None)
        runner.assert_document_access(url)

    def setUp(self):
        parent = ROOT / 'work/antibot-service/reports'
        self.temp = tempfile.TemporaryDirectory(prefix='cooldown-unit-', dir=parent)
        self.storage = str(Path(self.temp.name) / 'state')
        self.environment = patch.dict(os.environ, {'BAT_ACCESS_STATE_DIR': self.storage})
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        assert Path(self.temp.name).parent == ROOT / 'work/antibot-service/reports'
        self.temp.cleanup()

    def test_date_seconds_longer_preserved_and_origin_isolation(self):
        first = 'https://owned.invalid/private?synthetic=one'
        remember(first, 503, {'Retry-After': formatdate(time.time() + 40, usegmt=True)})
        with self.assertRaisesRegex(RuntimeError, 'capture_server_error_503'): guard(first)
        remember(first, 429, {'Retry-After': '1'})
        with self.assertRaisesRegex(RuntimeError, 'capture_server_error_503'): guard(first)
        guard('http://owned.invalid/private'); guard('https://owned.invalid:444/'); guard('https://other.invalid/')
        remember('https://long.invalid/', 429, {'retry-after': '604800'})
        with Cache(self.storage) as cache:
            self.assertGreater(json.loads(cache.get(key('https://long.invalid/')))['until'] - time.time(), 604790)
            self.assertTrue(all(len(value) == 64 for value in cache.iterkeys()))
        self.assertEqual(key(first), key('https://OWNED.invalid:443/another'))

    def test_invalid_headers_back_off_and_valid_zero_does_not(self):
        for index, value in enumerate(['-2', 'NaN', '1.5', 'yesterday', '', '1' * 129, None]):
            url = f'https://invalid{index}.invalid/'
            remember(url, 429, {'Retry-After': value})
            with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'): guard(url)
        for value in ['0', formatdate(time.time() - 30, usegmt=True)]:
            remember('https://immediate.invalid/', 429, {'Retry-After': value})
            guard('https://immediate.invalid/')
        remember('https://normal.invalid/', 200, {'Retry-After': '20'}); guard('https://normal.invalid/')
        guard('about:blank')
        with Cache(self.storage) as cache: self.assertIsNone(cache.get(key('https://normal.invalid/')))

    def test_missing_or_corrupt_storage_is_not_healthy(self):
        url = 'https://owned.invalid/'
        with Cache(self.storage) as cache: cache.set(key(url), 'not json')
        with self.assertRaises(ValueError): guard(url)
        with patch.dict(os.environ, {'BAT_ACCESS_STATE_DIR': 'relative'}):
            with self.assertRaisesRegex(ValueError, 'absolute_path'): guard(url)

    def test_missing_retry_after_blocks_the_next_task(self):
        url = 'https://missing-header.invalid/'
        remember(url, 429, {})
        with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'):
            guard(url)

    def test_declared_policy_validation_and_shared_native_quota(self):
        file = Path(self.temp.name) / 'policy.json'
        policy = {'version': 1, 'policies': [{'origin': 'https://owned.invalid', 'source': 'operator',
            'rates': [{'limit': 1, 'intervalMs': 60000}]}]}
        for value in ['https://owned.invalid/path', 'https://a:secret@owned.invalid', 'https://*.invalid', 'file:///x']:
            with self.assertRaises(ValueError):
                Policies.model_validate({**policy, 'policies': [{**policy['policies'][0], 'origin': value}]})
        file.write_text(json.dumps(policy), encoding='utf-8')
        with patch.dict(os.environ, {'BAT_ACCESS_POLICY_FILE': str(file)}):
            self.assertEqual(acquire('https://other.invalid'), 'unconfigured')
            self.assertEqual(acquire('https://owned.invalid/one'), 'admitted')
            with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'):
                acquire('https://OWNED.invalid:443/two')
            file.write_text('{bad', encoding='utf-8')
            with self.assertRaises(ValueError): acquire('https://other.invalid')

    def test_explicit_policy_missing_is_not_unconfigured(self):
        file = Path(self.temp.name) / 'policy.json'
        policy = {'version': 1, 'policies': [{'origin': 'https://owned.invalid', 'source': 'operator',
            'rates': [{'limit': 2, 'intervalMs': 60000}]}]}
        with patch.dict(os.environ, {'BAT_ACCESS_POLICY_FILE': ''}):
            self.assertEqual(acquire('https://owned.invalid'), 'unconfigured')
        with patch.dict(os.environ, {'BAT_ACCESS_POLICY_FILE': str(file)}):
            with self.assertRaisesRegex(ValueError, 'access_policy_file_unavailable'):
                acquire('https://owned.invalid')
            file.write_text(json.dumps(policy), encoding='utf-8')
            self.assertEqual(acquire('https://owned.invalid'), 'admitted')
            file.rename(file.with_suffix('.saved'))
            # WHY：已声明策略消失也不能使用缓存放行，未列出的origin同样不能猜为未配置。
            for url in ['https://owned.invalid', 'https://other.invalid']:
                with self.assertRaisesRegex(ValueError, 'access_policy_file_unavailable'): acquire(url)
            file.with_suffix('.saved').rename(file)
            self.assertEqual(acquire('https://owned.invalid'), 'admitted')
            with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'): acquire('https://owned.invalid')

    async def test_cancelled_admission_never_continues_request(self):
        from threading import Event
        began, release = Event(), Event()
        sent = []
        async def send(method, params, session): sent.append(method)
        def delayed(_url):
            began.set(); release.wait(5)
            return 'admitted'
        admission = Admission(send)
        with patch('browser_use_runner.task_access.acquire', side_effect=delayed):
            try:
                admission.paused({'requestId': 'owned', 'request': {'url': 'https://owned.invalid'}})
                self.assertTrue(await asyncio.to_thread(began.wait, 2))
                await admission.close()
            finally: release.set()
        self.assertEqual(sent, ['failRequest'])
        self.assertEqual(admission.counts['cancelled:Other'], 1)
        self.assertFalse(admission.tasks)

    def test_backoff_grows_but_active_cooldown_survives_other_success(self):
        url, start = 'https://backoff.invalid/', time.time()
        for step, expected in enumerate([30, 60, 120, 120]):
            now = start + step * 121
            with patch('browser_use_runner.access_cooldown.time.time', return_value=now):
                remember(url, 503, None)
                with Cache(self.storage) as cache: record = json.loads(cache.get(key(url)))
                self.assertGreaterEqual(record['until'] - now, expected)
                self.assertLessEqual(record['until'] - now, expected + 1)
                remember(url, 200, {})
                with self.assertRaisesRegex(RuntimeError, 'capture_server_error_503'): guard(url)
        with patch('browser_use_runner.access_cooldown.time.time', return_value=start + 600):
            guard(url); remember(url, 200, {}); remember(url, 429, {})
            with Cache(self.storage) as cache: reset = json.loads(cache.get(key(url)))
            self.assertEqual(reset['until'], start + 630)

    def test_duplicate_cdp_response_does_not_count_as_another_attempt(self):
        runner = Runner()
        runner.allowed_sites = [{'scheme': 'https', 'domain': 'owned.invalid', 'port': None, 'includeSubdomains': False}]
        event = {'requestId': 'owned-request', 'timestamp': 123.45, 'type': 'Document',
                 'response': {'url': 'https://owned.invalid/', 'status': 429, 'headers': {}}}
        for session in ['primary', 'another-existing-session']:
            runner.record_document_response(event, session)
            event['timestamp'] += .0001  # 同一真实响应在另一个CDP会话的事件时间不同。
        with Cache(self.storage) as cache: record = json.loads(cache.get(key(event['response']['url'])))
        self.assertEqual(record['failures'], 1)
        runner.record_document_response({**event, 'requestId': 'next-request', 'timestamp': 234.56}, 'primary')
        with Cache(self.storage) as cache: record = json.loads(cache.get(key(event['response']['url'])))
        self.assertEqual(record['failures'], 2)

    async def test_browser_fetch_and_document_observation_count_one_failure(self):
        url = 'https://owned.invalid/'
        async def send(*_): pass
        admission = Admission(send)
        await admission.decide({'requestId': 'intercepted', 'request': {'url': url},
            'resourceType': 'Document', 'responseStatusCode': 429, 'responseHeaders': []}, 'owned-browser')
        runner = Runner()
        runner.allowed_sites = [{'scheme': 'https', 'domain': 'owned.invalid', 'port': None, 'includeSubdomains': False}]
        runner.browser = SimpleNamespace(_cdp_client_root=SimpleNamespace(send=SimpleNamespace(
            Fetch=SimpleNamespace(_bat_access=SimpleNamespace(browser_session='owned-browser')))))
        runner.record_document_response({'requestId': 'network', 'loaderId': 'document', 'type': 'Document',
            'response': {'url': url, 'status': 429, 'headers': {}}}, 'owned-page')
        with Cache(self.storage) as cache: record = json.loads(cache.get(key(url)))
        self.assertEqual(record['failures'], 1)
        self.assertEqual(runner.document_status[url], 429)

    async def test_new_author_rejected_before_model_construction(self):
        url = 'https://owned.invalid/'
        remember(url, 429, {'Retry-After': '30'})
        runner = Runner(); runner.browser = SimpleNamespace()
        source = {'sourceProtocol': 'bat-hybrid/3', 'task': 'Owned test', 'input': None,
            'inputSchema': {'type': 'null'}, 'outputSchema': {'type': 'null'},
            'resultSpec': {'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'},
            'requirementId': str(uuid4()), 'requirementVersion': 1, 'requirementText': 'Owned test',
            'requirementDigest': 'a' * 64, 'entryUrls': [url], 'planId': str(uuid4()),
            'planVersion': 1, 'planDigest': 'b' * 64, 'stepId': 'step-1', 'callMode': 'once', 'maxSteps': 4}
        with patch('browser_use_runner.hybrid_main.AIConnectModel') as model:
            with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'):
                await runner.handle({'id': str(uuid4()), 'type': 'hybrid_author', 'source': source,
                    'model': {'model': 'owned', 'token': 'synthetic', 'endpoint': 'http://127.0.0.1:1'}})
            model.assert_not_called()

    async def test_account_fetch_and_navigation_share_native_response_cooldown(self):
        # Actual local server arrivals, without route interception or external platform access.
        visits = []
        class Fixture(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == '/limited': visits.append(self.path)
                self.send_response(429 if self.path == '/limited' else 200)
                self.send_header('Content-Type', 'text/html')
                if self.path == '/limited': self.send_header('Retry-After', '30')
                self.end_headers(); self.wfile.write(b'<link rel="icon" href="data:,"><input value="owned">')
            def log_message(self, *_): pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
        thread = Thread(target=server.serve_forever, daemon=True); thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        try:
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(channel='chrome', headless=True)
                try:
                    page = await browser.new_page(); await page.goto(origin)
                    borrowed = SimpleNamespace(page=page)
                    response = await browser_request(borrowed, [origin], 'GET', origin + '/limited')
                    self.assertEqual(response.status_code, 429)
                    with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'):
                        await open_page(borrowed, {'url': origin + '/limited', 'origins': [origin]})
                    with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'):
                        await browser_request(borrowed, [origin], 'GET', origin + '/limited')
                    facade = CheckPage(borrowed, [origin], {'errors': []})
                    with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'):
                        await facade.goto(origin + '/limited')
                    observations = {'errors': [], 'observe': True}
                    await CheckPage(borrowed, [origin], observations).goto(origin + '/limited')
                    self.assertTrue(observations['navigationSuppressed'])
                    # 当前页被用户导航到别处时，存储读取也不得自动绕过目标站冷却。
                    await page.goto('about:blank')
                    with self.assertRaisesRegex(RuntimeError, 'capture_rate_limited'):
                        await storage_origin(borrowed, origin)
                    self.assertEqual(visits, ['/limited']); self.assertEqual(page.url, 'about:blank')
                    print(json.dumps({'limitedOriginArrivals': len(visits), 'guarded': [
                        'account-fetch', 'open-page', 'storage-origin', 'check-page'], 'observeNoNavigation': True}))
                finally: await browser.close()
        finally:
            await asyncio.to_thread(server.shutdown); server.server_close(); thread.join(timeout=3)


if __name__ == '__main__': unittest.main()
