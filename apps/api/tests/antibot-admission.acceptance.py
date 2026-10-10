"""Actual owned browser arrivals: shared admission, redirects, cache and failure paths."""
import asyncio
import base64
import hashlib
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from threading import Thread
import time
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'vendor/workflow-use/workflows'))
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present
from browser_use_runner.task_access import attach
from browser_use_runner.account_borrow import borrow_window, CheckPage
from browser_use_runner.account_browser_http import browser_request
from browser_use_runner.access_cooldown import key
from diskcache import Cache
from browser_use import BrowserProfile
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/deferred.js': time.sleep(1.2)
        if getattr(self.server, 'proxy', False):
            valid = self.headers.get('Proxy-Authorization') == 'Basic ' + base64.b64encode(b'owned:fixture').decode()
            self.server.auth.append(valid)
            if not valid:
                self.send_response(407); self.send_header('Proxy-Authenticate', 'Basic realm="owned"')
                self.end_headers(); return
            self.path = urlsplit(self.path).path
        self.server.arrivals.append(self.path)
        code = getattr(self.server, 'worker_status', 429) if self.path == '/worker-limited' else 302 if self.path == '/redirect' else 200
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'public,max-age=600' if self.path == '/asset' else 'no-store')
        self.send_header('Content-Type', 'text/javascript' if self.path in ('/sw.js', '/deferred.js') else 'text/html; charset=utf-8')
        if code == 302: self.send_header('Location', '/data')
        if code == 429: self.send_header('Retry-After', '2')
        self.end_headers()
        body = b'''const instance=crypto.randomUUID();
        self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
        self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
        self.addEventListener('message',e=>e.waitUntil((async()=>{
          const data=typeof e.data==='string'?{url:e.data,count:8}:e.data;
          if(data.inspect){e.ports[0].postMessage({instance});return;}
          const read=()=>fetch(data.url).then(r=>r.status).catch(()=>0);
          let result=[];
          if(data.sequential){for(let i=0;i<data.count;i++)result.push(await read())}
          else result=await Promise.all(Array.from({length:data.count},read));
          e.ports[0].postMessage(result);
        })()));''' \
            if self.path == '/sw.js' else b'<title>Owned admission</title><link rel="icon" href="data:,"><p>owned</p>'
        if self.path == '/page-a': body += b'<a id="open" href="/page-b" target="_blank">Open owned page</a>'
        if self.path == '/deferred-page':
            body = b'<title>Owned delayed script</title><button id="action">Confirm</button><script defer src="/deferred.js"></script>'
        elif self.path == '/deferred.js':
            body = b'document.querySelector("#action").onclick=()=>{document.body.dataset.clicked="yes"}'
        self.wfile.write(body)

    def log_message(self, *_): pass


def save(out, name, value):
    (out / name).write_text(json.dumps(value, indent=2), encoding='utf-8')


def server():
    instance = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    instance.arrivals = []
    thread = Thread(target=instance.serve_forever, daemon=True); thread.start()
    return instance, thread, f'http://127.0.0.1:{instance.server_port}'


async def fetch(page, url, count=1):
    result = await page.evaluate("""(args) => Promise.all(Array.from({length:args.count}, (_,i) =>
      fetch(args.url).then(r=>r.status).catch(()=>0)))""", {'url': url, 'count': count})
    return json.loads(result) if isinstance(result, str) else result


async def proxy_exercise(window, out, normal, policy):
    instance, _, endpoint = normal
    instance.proxy, instance.auth = True, []
    policy.write_text(json.dumps({'version': 1, 'policies': [{'origin': 'http://owned.invalid', 'source': 'operator',
        'rates': [{'limit': 2, 'intervalMs': 60000}]}]}), encoding='utf-8')
    original = subprocess.Popen
    def launch(args, **kwargs):
        if '--user-data-dir=' + str(window.profile_path) in args:
            args = [*args, '--proxy-server=' + endpoint, '--proxy-bypass-list=<-loopback>']
        return original(args, **kwargs)
    def profile(**kwargs):
        return BrowserProfile(**kwargs, proxy={'server': endpoint, 'username': 'owned', 'password': 'fixture'})
    with patch('browser_use_runner.managed_window.subprocess.Popen', side_effect=launch), \
            patch('browser_use_runner.managed_window.BrowserProfile', side_effect=profile):
        browser = await window.start(resume=False, allowed_domains=['owned.invalid'])
    try:
        page = await browser.get_current_page()
        await page.goto('http://owned.invalid/page')
        result = await fetch(page, 'http://owned.invalid/proxy-quota', 2)
        save(out, 'proxy.json', {'results': result, 'arrivals': instance.arrivals,
            'authChallenges': instance.auth.count(False), 'authenticatedRequests': instance.auth.count(True)})
        assert Counter(result) == {200: 1, 0: 1}
        assert instance.auth.count(False) >= 1 and instance.auth.count(True) >= 2
        assert instance.arrivals.count('/page') == instance.arrivals.count('/proxy-quota') == 1
        save(out, 'passed.json', {'originalBuProxyAuthPreserved': True, 'oneAdmissionPerRequest': True, 'modelCalls': 0})
    finally:
        save(out, 'proxy-closed.json', await window.close(browser))


async def daily_exercise(out, normal, limited, policy):
    # Reuse the existing real chrome.debugger extension gate in a disposable Profile.
    os.environ['BAT_ACCOUNT_BORROW_OUTPUT'] = str(out)
    os.environ['BAT_TEST_TRACE_FILE'] = str(out / 'daily-protocol.jsonl')
    spec = importlib.util.spec_from_file_location('owned_daily', ROOT / 'apps/api/tests/account-borrow-windows.acceptance.py')
    fixture = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
    async def probe(window, _profile, _client):
        browser = await window.start(resume=True, allowed_domains=None)
        try:
            if '--navigation' in sys.argv:
                await deferred_navigation_exercise(browser, out, normal)
                result = json.loads((out / 'passed.json').read_text())
                save(out, 'passed.json', {**result, 'realChromeDebuggerExtension': True,
                    'personalProfileTouched': False, 'physicalHeadless': True})
                return
            await exercise(browser, out, normal, limited)
            page = await browser.get_current_page()
            await page.goto('https://localhost:4185/measurement/fingerprint')
            result = None
            async with asyncio.timeout(20):
                while not result:
                    raw = await page.evaluate('() => globalThis.__probeResult || null')
                    result = json.loads(raw) if raw and raw != 'null' else None
                    if not result: await asyncio.sleep(.1)
            save(out, 'daily-fingerprint.json', result)
            assert result['validity'] != 'error'
            assert result['detections']['hasCDP']['detected'] is False
            await window.handoff(browser)
            async with borrow_window(window.profile_path, window.owner_id, window.owner_id, 'daily') as borrowed:
                assert await fetch(borrowed.page, normal[2] + '/daily-account') == [200]
                policy.write_text('{invalid', encoding='utf-8')
                before = len(normal[0].arrivals)
                assert await fetch(borrowed.page, normal[2] + '/invalid-policy') == [0]
                assert len(normal[0].arrivals) == before
            save(out, 'passed.json', {'realChromeDebuggerExtension': True, 'personalProfileTouched': False,
                'sharedAdmissionCacheAndRedirects': True, 'nativeCdpProbeClear': True,
                'accountBorrowAndCorruptPolicy': True, 'physicalHeadless': True, 'modelCalls': 0})
        finally:
            if not window.transferred:
                await window.close(browser)
    certificate = x509.load_pem_x509_certificate((ROOT / 'work/antibot-service/tls/cert.pem').read_bytes())
    pin = base64.b64encode(hashlib.sha256(certificate.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).digest()).decode()
    try: await fixture.daily(probe, launch_args=['--ignore-certificate-errors-spki-list=' + pin])
    finally:
        save(out, 'daily-lifecycle.json', fixture.proof)
        profile = out / 'daily'
        assert not _profile_process_present(profile)
        assert profile.resolve().parent == out and not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'daily-profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


async def exercise(browser, out, normal, limited):
    page = await browser.get_current_page()
    session = await browser.get_or_create_cdp_session()
    gate = session.cdp_client.send.Fetch._bat_access
    # Force the already observed SDK case: two CDP sessions attached to one target.
    extra = await session.cdp_client.send.Target.attachToTarget(params={'targetId': session.target_id, 'flatten': True})
    await attach(browser, SimpleNamespace(cdp_client=session.cdp_client, target_id=session.target_id,
                                        session_id=extra['sessionId']))
    assert len(gate.sessions) == 1, 'duplicate-target-admission-owners'
    original_handler = session.cdp_client._event_registry._handlers['Fetch.requestPaused']
    save(out, 'binding.json', {'handler': str(original_handler), 'delegate': str(gate.delegate),
        'register': str(gate.register), 'gate': str(gate)})
    events = []
    def trace(event, session_id=None):
        events.append({'session': session_id, **{k: event.get(k) for k in (
            'requestId', 'networkId', 'redirectedRequestId', 'resourceType', 'responseStatusCode')}})
        save(out, 'pause-identities.json', events)
        return original_handler(event, session_id)
    gate.register(trace)
    save(out, 'sessions.json', list(gate.sessions))
    await page.goto(normal[2] + '/page')
    assert await fetch(page, normal[2] + '/asset') == [200]
    assert await fetch(page, normal[2] + '/asset') == [200]
    assert normal[0].arrivals.count('/asset') == 1, 'interception-disabled-browser-cache'
    assert await fetch(page, normal[2] + '/redirect') == [200]
    assert normal[0].arrivals.count('/redirect') == normal[0].arrivals.count('/data') == 1
    started = time.time()
    results = await fetch(page, limited[2] + '/quota', 8)
    save(out, 'first-burst.json', {'results': results, 'arrivals': limited[0].arrivals, 'counts': gate.counts})
    assert Counter(results) == {200: 2, 0: 6}, 'client-budget-did-not-stop-before-request'
    assert len(limited[0].arrivals) == 2, 'origin-received-over-budget-request'
    assert await fetch(page, normal[2] + '/unrelated') == [200]
    await asyncio.sleep(max(0, started + 5.1 - time.time()))
    assert await fetch(page, limited[2] + '/after-expiry') == [200]
    save(out, 'browser-gate.json', {'counts': gate.counts, 'normalArrivals': normal[0].arrivals,
                                  'limitedArrivals': limited[0].arrivals})
    await session.cdp_client.send.Target.detachFromTarget(params={'sessionId': extra['sessionId']})
    return page, gate


async def worker_message(page, data):
    raw = await page.evaluate("""(data) => navigator.serviceWorker.register('/sw.js')
      .then(()=>navigator.serviceWorker.ready).then(registration=>new Promise(resolve=>{
        const channel=new MessageChannel();channel.port1.onmessage=e=>resolve(e.data);
        registration.active.postMessage(data,[channel.port2]);
      }))""", data)
    return json.loads(raw) if isinstance(raw, str) else raw


async def service_worker_exercise(page, gate, out, normal, limited):
    result = await worker_message(page, limited[2] + '/service-worker')
    save(out, 'service-worker.json', {'results': result, 'arrivals': limited[0].arrivals, 'counts': gate.counts})
    assert Counter(result) == {200: 1, 0: 7}, 'service-worker-request-admission-gap'
    limited_response = await worker_message(page, {'url': normal[2] + '/worker-limited', 'count': 2, 'sequential': True})
    save(out, 'sw-cooldown.json', {'results': limited_response, 'arrivals': normal[0].arrivals, 'counts': gate.counts})
    assert limited_response == [429, 0] and normal[0].arrivals.count('/worker-limited') == 1
    await asyncio.sleep(2.2); normal[0].worker_status = 200
    assert await worker_message(page, {'url': normal[2] + '/worker-limited', 'count': 1}) == [200]
    assert normal[0].arrivals.count('/worker-limited') == 2
    await page.evaluate('() => navigator.serviceWorker.getRegistrations().then(rows=>Promise.all(rows.map(r=>r.unregister())))')
    save(out, 'passed.json', {'ownedServiceWorkerBudget': True, 'workerResponseCooldownAndExpiry': True,
        'modelCalls': 0, 'dailySharedWorkerCovered': False})


async def shared_owned_worker_exercise(browser, out, normal, limited, policy):
    # WHY：两任务页面共用同一SW时必须共用origin预算；不是测试个人页面的选择性拦截。
    policy.write_text(json.dumps({'version': 1, 'policies': [{'origin': limited[2], 'source': 'operator',
        'rates': [{'limit': 2, 'intervalMs': 60000}]}]}), encoding='utf-8')
    first = await browser.get_current_page()
    await first.goto(normal[2] + '/page-a')
    await (await first.get_elements_by_css_selector('#open'))[0].click()
    second = None
    async with asyncio.timeout(5):
        while second is None:
            for page in await browser.get_pages():
                if (await page.get_url()).endswith('/page-b'): second = page
            if second is None: await asyncio.sleep(.05)
    identities = [await worker_message(page, {'inspect': True}) for page in (first, second)]
    assert identities[0]['instance'] == identities[1]['instance'], 'worker-was-not-shared'
    batches = await asyncio.gather(*(worker_message(page, {'url': limited[2] + '/shared-budget', 'count': 4})
        for page in (first, second)))
    arrivals = limited[0].arrivals.count('/shared-budget')
    save(out, 'owned-shared-worker.json', {'sameWorker': True, 'pages': 2, 'results': batches,
        'attempts': 8, 'originArrivals': arrivals, 'limit': 2})
    assert Counter(v for batch in batches for v in batch) == {200: 2, 0: 6} and arrivals == 2
    assert await worker_message(second, {'url': normal[2] + '/independent-origin', 'count': 1}) == [200]
    cooldown = [await worker_message(page, {'url': normal[2] + '/worker-limited', 'count': 1})
        for page in (first, second)]
    save(out, 'owned-shared-cooldown.json', {'results': cooldown,
        'originArrivals': normal[0].arrivals.count('/worker-limited')})
    assert cooldown == [[429], [0]] and normal[0].arrivals.count('/worker-limited') == 1
    await asyncio.sleep(2.2); normal[0].worker_status = 200
    assert await worker_message(second, {'url': normal[2] + '/worker-limited', 'count': 1}) == [200]
    save(out, 'passed.json', {'dedicatedVisible': True, 'twoPagesSameWorkerBudget': True,
        'sharedResponseCooldownAndExpiry': True, 'independentOrigin': True, 'modelCalls': 0,
        'personalProfileTouched': False})


async def worker_restart_exercise(window, out, normal, limited, policy):
    policy.write_text(json.dumps({'version': 1, 'policies': [{'origin': limited[2], 'source': 'operator',
        'rates': [{'limit': 2, 'intervalMs': 60000}]}]}), encoding='utf-8')
    owners = []
    for phase in ('cold', 'restarted'):
        browser = None
        try:
            browser = await window.start(resume=False, allowed_domains=['127.0.0.1'])
            lease = window._load(); owners.append({'pid': lease.browserPid, 'started': lease.browserStarted})
            page = await browser.get_current_page()
            session = await browser.get_or_create_cdp_session()
            gate = session.cdp_client.send.Fetch._bat_access
            save(out, phase + '-before.json', {'gate': id(gate), 'browserAdmission': gate.browser_session,
                'sessions': list(gate.sessions)})
            await page.goto(normal[2] + '/page')
            if phase == 'restarted':
                exists = await page.evaluate('() => navigator.serviceWorker.getRegistration().then(r=>!!r?.active)')
                assert str(exists).lower() == 'true', 'service-worker-registration-not-persisted'
            count = 1 if phase == 'cold' else 8
            result = await worker_message(page, {'url': limited[2] + '/restart-worker', 'count': count})
            save(out, phase + '-worker.json', {'results': result, 'arrivals': limited[0].arrivals,
                'counts': gate.counts, 'failure': gate.failure})
            assert Counter(result) == ({200: 1} if phase == 'cold' else {200: 1, 0: 7})
        finally:
            closed = await window.close(browser); save(out, phase + '-closed.json', closed)
            assert closed['status'] == 'confirmed' and not _profile_process_present(window.profile_path)
    assert owners[0] != owners[1] and limited[0].arrivals.count('/restart-worker') == 2
    save(out, 'passed.json', {'sameProfileWorkerRegistrationPersisted': True, 'actualBrowserRestart': owners,
        'sharedQuotaSurvived': True, 'originArrivals': 2, 'modelCalls': 0, 'dailySharedWorkerCovered': False})


async def account_worker_exercise(window, browser, out, normal, limited, policy):
    policy.write_text(json.dumps({'version': 1, 'policies': [{'origin': limited[2], 'source': 'operator',
        'rates': [{'limit': 2, 'intervalMs': 60000}]}]}), encoding='utf-8')
    page = await browser.get_current_page()
    await page.goto(normal[2] + '/page')
    assert await worker_message(page, {'url': limited[2] + '/account-worker', 'count': 1}) == [200]
    await window.handoff(browser, account_maintenance=True)
    if '--resume-worker' in sys.argv:
        resumed = None
        try:
            resumed = await window.start(resume=True, allowed_domains=['127.0.0.1'])
            current = await resumed.get_current_page()
            result = await worker_message(current, limited[2] + '/resumed-worker')
            save(out, 'resumed-worker.json', {'results': result, 'arrivals': limited[0].arrivals})
            assert Counter(result) == {200: 1, 0: 7}, 'resume-warm-worker-admission-gap'
            save(out, 'passed.json', {'sameBrowserWarmWorkerResumeSharedBudget': True, 'modelCalls': 0})
        finally:
            save(out, 'resume-closed.json', await window.close(resumed))
        return
    async with borrow_window(window.profile_path, window.owner_id, window.owner_id, 'dedicated') as borrowed:
        result = await worker_message(borrowed.page, limited[2] + '/account-worker')
        save(out, 'account-worker.json', {'results': result, 'arrivals': limited[0].arrivals})
        assert Counter(result) == {200: 1, 0: 7}, 'account-warm-worker-admission-gap'
        assert limited[0].arrivals.count('/account-worker') == 2
        limited_response = await worker_message(borrowed.page, {'url': normal[2] + '/worker-limited', 'count': 2, 'sequential': True})
        save(out, 'account-worker-cooldown.json', {'results': limited_response, 'arrivals': normal[0].arrivals})
        assert limited_response == [429, 0] and normal[0].arrivals.count('/worker-limited') == 1
        await asyncio.sleep(2.2); normal[0].worker_status = 200
        assert await worker_message(borrowed.page, {'url': normal[2] + '/worker-limited', 'count': 1}) == [200]
        for kind in ('fetch', 'navigation'):
            normal[0].worker_status = 429
            url = normal[2] + '/worker-limited'
            if kind == 'fetch':
                response = await browser_request(borrowed, [normal[2]], 'GET', url)
                assert response.status_code == 429
            else:
                response = await CheckPage(borrowed, [normal[2]], {'errors': []}).goto(url)
                assert response.status == 429
            with Cache(os.environ['BAT_ACCESS_STATE_DIR'], eviction_policy='none') as cache:
                record = json.loads(cache.get(key(url)))
            save(out, 'account-' + kind + '-single-response.json', record)
            assert record['failures'] == 1, 'account-response-double-counted'
            await asyncio.sleep(2.2); normal[0].worker_status = 200
            assert await fetch(borrowed.page, url) == [200]
    save(out, 'passed.json', {'dedicatedAccountWarmWorkerSharedBudget': True, 'responseCooldownAndExpiry': True, 'modelCalls': 0})


async def missing_policy_exercise(browser, out, normal, limited, policy):
    page = await browser.get_current_page()
    await page.goto(normal[2] + '/page')
    session = await browser.get_or_create_cdp_session()
    gate = session.cdp_client.send.Fetch._bat_access
    assert await fetch(page, limited[2] + '/before-missing') == [200]
    before = len(limited[0].arrivals)
    policy.rename(policy.with_suffix('.saved'))
    result = await fetch(page, limited[2] + '/after-missing', 3)
    save(out, 'missing-policy.json', {'results': result, 'arrivals': limited[0].arrivals,
        'counts': gate.counts, 'failure': gate.failure})
    assert result == [0, 0, 0] and len(limited[0].arrivals) == before
    assert gate.failure == 'capture_access_state_unavailable'
    save(out, 'passed.json', {'missingDeclaredPolicyClosed': True, 'initialArrival': 1,
        'requestsAttemptedAfterRemoval': 3, 'arrivalsAfterRemoval': 0, 'modelCalls': 0})


async def deferred_navigation_exercise(browser, out, normal):
    page = await browser.get_current_page()
    await page.goto(normal[2] + '/deferred-page')
    for _ in range(20):
        elements = await page.get_elements_by_css_selector('#action')
        if elements: break
        await asyncio.sleep(.02)
    before = json.loads(await page.evaluate("() => ({ready:document.readyState,handler:typeof document.querySelector('#action')?.onclick})"))
    await elements[0].click()
    after = json.loads(await page.evaluate("""() => new Promise(resolve=>{
      const read=()=>resolve({ready:document.readyState,clicked:document.body.dataset.clicked||null});
      if(typeof document.querySelector('#action').onclick==='function')read();
      else document.addEventListener('DOMContentLoaded',read,{once:true});
    })"""))
    save(out, 'deferred-navigation.json', {'beforeClick': before, 'afterDomReady': after})
    assert after['clicked'] == 'yes', 'navigation_returned_before_deferred_handlers'
    began = time.monotonic()
    await page.goto(normal[2] + '/deferred-page#kept')
    assert time.monotonic() - began < 2, 'same_document_waited_for_nonexistent_load'
    assert await page.evaluate('() => document.body.dataset.clicked') == 'yes'
    save(out, 'passed.json', {'nativeDeferredNavigation': True, 'singleClickEffective': True,
        'sameDocumentPreserved': True, 'modelCalls': 0})


async def main():
    parent = ROOT / 'work/antibot-service/reports'
    out = Path(tempfile.mkdtemp(prefix='admission-', dir=parent)).resolve()
    profile = out / 'profile'; policy = out / 'policy.json'
    normal, limited = server(), server()
    policy.write_text(json.dumps({'version': 1, 'policies': [{'origin': limited[2], 'source': 'operator',
        'rates': [{'limit': 2, 'intervalMs': 4000}]}]}), encoding='utf-8')
    os.environ['BAT_ACCESS_STATE_DIR'] = str(out / 'state')
    os.environ['BAT_ACCESS_POLICY_FILE'] = str(policy)
    window, browser = ManagedWindow(profile, uuid4(),
        headless=not any(flag in sys.argv for flag in ('--resume-worker', '--owned-shared-worker'))), None
    print(json.dumps({'evidence': str(out)}), flush=True)
    try:
        if '--daily' in sys.argv:
            await daily_exercise(out, normal, limited, policy)
            return
        if '--proxy' in sys.argv:
            await proxy_exercise(window, out, normal, policy)
            return
        if '--service-worker-restart' in sys.argv:
            await worker_restart_exercise(window, out, normal, limited, policy)
            return
        browser = await window.start(resume=False, allowed_domains=['127.0.0.1'])
        lease = window._load()
        save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted, 'profile': str(profile)})
        if '--owned-shared-worker' in sys.argv:
            await shared_owned_worker_exercise(browser, out, normal, limited, policy)
            return
        if '--account-worker' in sys.argv:
            await account_worker_exercise(window, browser, out, normal, limited, policy)
            return
        if '--missing-policy' in sys.argv:
            await missing_policy_exercise(browser, out, normal, limited, policy)
            return
        if '--navigation' in sys.argv:
            await deferred_navigation_exercise(browser, out, normal)
            return
        page, gate = await exercise(browser, out, normal, limited)
        if '--service-worker' in sys.argv:
            await service_worker_exercise(page, gate, out, normal, limited)
            return
        if '--worker' in sys.argv:
            result = await page.evaluate("""(url) => new Promise((resolve,reject) => {
              const source = `Promise.all(Array.from({length:8},()=>fetch(${JSON.stringify(url)})
                .then(r=>r.status).catch(()=>0))).then(result=>postMessage(result))`;
              const worker = new Worker(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
              worker.onmessage = e => {worker.terminate();resolve(e.data)};
              worker.onerror = () => {worker.terminate();reject(Error('owned-worker-failed'))};
            })""", limited[2] + '/worker')
            result = json.loads(result) if isinstance(result, str) else result
            save(out, 'worker.json', {'results': result, 'arrivals': limited[0].arrivals, 'counts': gate.counts})
            assert Counter(result) == {200: 1, 0: 7}, 'worker-request-admission-gap'
            save(out, 'passed.json', {'ownedDedicatedWorkerBudget': True, 'modelCalls': 0})
            return
        if '--account' in sys.argv:
            await window.handoff(browser, account_maintenance=True)
            async with borrow_window(profile, window.owner_id, window.owner_id, 'dedicated') as borrowed:
                result = await fetch(borrowed.page, limited[2] + '/account', 2)
                save(out, 'account.json', {'results': result, 'arrivals': limited[0].arrivals})
                assert Counter(result) == {200: 1, 0: 1}, 'account-did-not-share-preparation-budget'
                assert limited[0].arrivals.count('/account') == 1
                assert await fetch(borrowed.page, normal[2] + '/asset') == [200]
                assert normal[0].arrivals.count('/asset') == 1
                policy.write_text('{invalid', encoding='utf-8')
                before = len(normal[0].arrivals)
                assert await fetch(borrowed.page, normal[2] + '/invalid-policy') == [0]
                assert len(normal[0].arrivals) == before
            save(out, 'passed.json', {'browserAndAccountShared': True, 'limitedOriginArrivalsBeforeExpiry': 2,
                'accountRemainingQuotaRespected': True, 'cachePreservedBothDrivers': True,
                'corruptPolicyClosed': True, 'modelCalls': 0})
            return
        # A malformed policy must not quietly release a request or erase the stored quota.
        policy.write_text('{invalid', encoding='utf-8')
        before = len(normal[0].arrivals)
        assert await fetch(page, normal[2] + '/invalid-policy') == [0]
        assert len(normal[0].arrivals) == before
        assert gate.failure == 'capture_access_state_unavailable'
        save(out, 'passed.json', {'concurrentRequests': 8, 'limitedOriginArrivalsBeforeExpiry': 2,
            'normalCachePreserved': True, 'redirectArrivals': 2, 'expiryRestored': True,
            'otherOriginIndependent': True, 'corruptPolicyClosed': True, 'modelCalls': 0,
            'proxyAuthTested': False, 'workerRequestsTested': False, 'accountBorrowTested': False})
    except Exception as error:
        save(out, 'first-failure.json', {'type': type(error).__name__, 'message': str(error),
            'normalArrivals': normal[0].arrivals, 'limitedArrivals': limited[0].arrivals})
        raise
    finally:
        if window.transferred:
            await window.end_gracefully(window.owner_id)
            closed = {'status': 'confirmed', 'path': 'original-handoff-owner-end'}
        else: closed = await window.close(browser)
        save(out, 'closed.json', closed)
        for instance, thread, _ in [normal, limited]:
            await asyncio.to_thread(instance.shutdown); instance.server_close(); thread.join(timeout=3)
        assert closed['status'] in ('confirmed', 'not_required') and not _profile_process_present(profile)
        assert profile.parent == out and out.is_relative_to(parent)
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__': asyncio.run(main())
