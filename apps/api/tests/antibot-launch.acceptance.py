"""Owned ManagedWindow launch evidence; no personal profile or remote site."""
import argparse
from collections import Counter
import asyncio
import hashlib
import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
from contextlib import nullcontext
import sys
import tempfile
from threading import Thread
from uuid import uuid4
from unittest.mock import patch

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'vendor/workflow-use/workflows'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present

BUNDLE = ROOT / 'work/antibot-service/runtime/botd/package/dist/botd.esm.js'
PAGE = b'''<!doctype html><meta charset="utf-8"><title>B-A-T owned launch test</title>
<p>Local automated launch verification. No user action needed.</p><input>
<script type="module">
import {load} from '/botd.js';
const d = await load({monitoring:false});
globalThis.result = {verdict:d.detect(),detections:d.getDetections(),
  states:Object.fromEntries(Object.entries(d.getComponents()).map(([k,v])=>[k,v.state]))};
</script>'''


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.arrivals[self.path] += 1
        bundle = self.path == '/botd.js'
        body = BUNDLE.read_bytes() if bundle else PAGE
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript' if bundle else 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


async def exercise(window, site, out, headless):
    browser = await window.start(resume=False, allowed_domains=['127.0.0.1'])
    try:
        lease = window._load()
        save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted,
            'profile': lease.profilePath, 'headless': headless, 'port': lease.cdpPort,
            'purpose': 'owned-launch-calibration', 'modelCalls': 0})
        page = await browser.get_current_page()
        await page.goto(site)
        for _ in range(60):
            raw = await page.evaluate('() => globalThis.result || null')
            probe = json.loads(raw) if raw else None
            if probe: break
            await asyncio.sleep(.1)
        assert probe, 'independent-probe-missing'
        webdriver = json.loads(await page.evaluate('() => ({value:navigator.webdriver})'))['value']
        result = {'webdriver': webdriver, 'headless': headless, 'probe': probe}
        save(out, 'measurement.json', result)
        assert isinstance(webdriver, bool), 'webdriver-measurement-invalid'
        if headless:
            assert probe['detections']['detectUserAgent']['bot'], 'headless-positive-not-detected'
        else:
            assert webdriver is False, 'visible-launch-unexpected-webdriver-marker'
        entry = (await page.get_elements_by_css_selector('input'))[0]
        await entry.fill('owned launch input')
        assert await page.evaluate("() => document.querySelector('input').value") == 'owned launch input'
        if not headless:
            target, session = browser.agent_focus_target_id, browser.id
            await window.handoff(browser)
            window = ManagedWindow(window.profile_path, window.owner_id)
            browser = await window.start(resume=True, allowed_domains=['127.0.0.1'])
            assert browser.agent_focus_target_id == target and browser.id == session
            page = await browser.get_current_page()
            assert await page.evaluate("() => document.querySelector('input').value") == 'owned launch input'
            result['sameTargetSessionAndInputAfterResume'] = True
        save(out, 'passed.json', result)
    finally:
        closed = await window.close(browser)
        save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed', closed


def load_case(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.acceptance.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def mode_probe(window, browser, site, out, online):
    page = await browser.get_current_page()
    await page.goto(site)
    async with asyncio.timeout(15):
        while True:
            raw = await page.evaluate('() => globalThis.result || null')
            probe = json.loads(raw) if raw else None
            if probe: break
            await asyncio.sleep(.1)
    environment = json.loads(await page.evaluate('''() => ({webdriver:navigator.webdriver,
      ua:navigator.userAgent,platform:navigator.platform,language:navigator.language,
      languages:navigator.languages,concurrency:navigator.hardwareConcurrency,memory:navigator.deviceMemory,
      plugins:navigator.plugins.length,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen:[screen.width,screen.height,screen.availWidth,screen.availHeight,screen.colorDepth],
      viewport:[innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio]})'''))
    save(out, 'probe.json', {'probe': probe, 'webdriver': environment['webdriver'],
        'headlessUa': 'HeadlessChrome' in environment['ua']})
    save(out, 'environment-hashes.json', {key: hashlib.sha256(json.dumps(value).encode()).hexdigest()
        for key, value in environment.items()})
    public = '--comparison-public' in sys.argv
    save(out, 'stage.json', {'stage': 'public-diagnostic' if public else 'full-shield-normal-business'})
    diagnostic = None
    session = await browser.get_or_create_cdp_session()
    if '--comparison-diagnostic' in sys.argv:
        from challenge_diagnostics import SOURCE
        # 仅owned诊断：不读取挑战输入/输出，只观察原Worker生命周期与消息是否返回。
        workers = '''(() => {const counts=globalThis.__ownedWorkers={created:0,messages:0,errors:0};
          globalThis.Worker=new Proxy(Worker,{construct(target,args,newTarget){
            const worker=Reflect.construct(target,args,newTarget);counts.created++;
            worker.addEventListener('message',()=>counts.messages++);
            worker.addEventListener('error',()=>counts.errors++);return worker;}})})();'''
        protocol = []
        session.cdp_client.register.Target.attachedToTarget(lambda event, sid: protocol.append({
            'type': event.get('targetInfo', {}).get('type'), 'waiting': event.get('waitingForDebugger')}))
        session.cdp_client.register.Network.loadingFailed(lambda event, sid: protocol.append({
            'failed': event.get('type'), 'error': event.get('errorText')}))
        diagnostic = await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(
            params={'source': SOURCE + workers}, session_id=session.session_id)
    try:
        if public:
            browser.browser_profile.allowed_domains = ['127.0.0.1', 'deviceandbrowserinfo.com']
            await load_case('antibot-public').device_check(browser, out)
            results = json.loads((out/'result.json').read_text())
            assert all(row['signals'].get('isBot') is False for row in results), 'public-detector-positive'
        else:
            await online.exercise(browser, out, controls=False)
    except Exception:
        from challenge_diagnostics import SNAPSHOT
        if not public: save(out, 'challenge-failure.json', json.loads(await page.evaluate(SNAPSHOT)))
        if diagnostic:
            save(out, 'worker-diagnostic.json', {'workers': json.loads(await page.evaluate('() => globalThis.__ownedWorkers')),
                'protocol': protocol})
        raise
    finally:
        if diagnostic:
            await session.cdp_client.send.Page.removeScriptToEvaluateOnNewDocument(
                params=diagnostic, session_id=session.session_id)
    # WHY：同任务/同采集/同盾规则；不通过删探针或伪造属性使两模式相等。
    assert environment['webdriver'] is False and 'HeadlessChrome' not in environment['ua']
    assert not any(value['bot'] for value in probe['detections'].values())
    await page.goto(site)
    await page.evaluate('''() => {localStorage.setItem('owned-mode','retained');
      sessionStorage.setItem('owned-mode','retained');return true}''')
    target, session = browser.agent_focus_target_id, browser.id
    await window.handoff(browser)
    resumed = await window.start(resume=True, allowed_domains=['127.0.0.1', '*.localhost'])
    page = await resumed.get_current_page()
    retained = json.loads(await page.evaluate('''() => ({local:localStorage.getItem('owned-mode')==='retained',
      session:sessionStorage.getItem('owned-mode')==='retained'})'''))
    assert all(retained.values()) and resumed.agent_focus_target_id == target and resumed.id == session
    save(out, 'resume.json', {'sameTargetAndSession': True, 'syntheticStateRetained': retained})
    return environment, resumed


def detector_summary(out):
    if '--comparison-public' in sys.argv:
        path = out/'result.json'
        return {str(row['interactions']): row['signals'] for row in json.loads(path.read_text())} if path.exists() else {}
    path = out / 'normal.json'
    if not path.exists(): return {}
    rows = json.loads(path.read_text(encoding='utf-8'))['observations']
    result = {}
    for row in rows:
        if 'detector' not in row: continue
        key = row['category'] + '/' + row['detector'] + '/' + row.get('detector_version', '')
        result.setdefault(key, set()).add((row.get('valid'), row.get('outcome')))
    return {key: sorted(value) for key, value in sorted(result.items())}


def delete_daily_profile(out, profile):
    assert profile == out / 'daily' and out.resolve().is_relative_to(ROOT / 'work/antibot-service/reports')
    assert not _profile_process_present(profile), 'owned-daily-browser-still-running'
    assert not any(p.is_symlink() or p.is_junction() for p in [out, profile, *profile.rglob('*')])
    if profile.exists(): shutil.rmtree(profile)
    save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists(), 'browserClosed': True})


async def dedicated_mode(combined, site, out, mode_out):
    window, browser = ManagedWindow(out/'profile', uuid4()), None
    launch = combined.owned_launcher(out/'profile', None, mode_out, subprocess.Popen)
    try:
        with patch('browser_use_runner.managed_window.subprocess.Popen', side_effect=launch):
            browser = await window.start(resume=False, allowed_domains=['127.0.0.1', '*.localhost'])
        lease = window._load()
        save(mode_out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted,
            'profile': lease.profilePath, 'headless': lease.headless})
        environment, browser = await mode_probe(window, browser, site, mode_out, combined.online)
        return environment
    except Exception as error:
        save(mode_out, 'original-failure.json', {'type': type(error).__name__, 'message': str(error)[:600]})
        raise
    finally:
        if window.transferred:
            await window.end_gracefully(window.owner_id, allow_controlled=True)
            closed = {'status': 'confirmed', 'path': 'original-handoff-owner-end'}
        else: closed = await window.close(browser)
        save(mode_out, 'closed.json', closed)
        assert closed['status'] == 'confirmed' or browser is None and not _profile_process_present(window.profile_path), closed


async def daily_mode(combined, site, _out, mode_out):
    os.environ['BAT_ACCOUNT_BORROW_OUTPUT'] = str(mode_out)
    os.environ['BAT_TEST_TRACE_FILE'] = str(mode_out/'relay-commands.jsonl')
    daily = load_case('account-borrow-windows')
    certificate = combined.x509.load_pem_x509_certificate((combined.BASE/'tls/cert.pem').read_bytes())
    pin = combined.base64.b64encode(hashlib.sha256(certificate.public_key().public_bytes(
        combined.Encoding.DER, combined.PublicFormat.SubjectPublicKeyInfo)).digest()).decode()
    environment = None
    async def attached_probe(window, _profile, _client):
        nonlocal environment
        current = await window.start(resume=True, allowed_domains=['127.0.0.1', '*.localhost'])
        try:
            environment, current = await mode_probe(window, current, site, mode_out, combined.online)
        finally:
            await window.handoff(current)
    try:
        # 仅因果诊断：临时撤销iframe启动暂停；该运行不能结算请求治理验收。
        control = patch('browser_use_runner.target_scope.TargetScope._frame_admission_required', return_value=False) \
            if '--comparison-worker-control' in sys.argv else nullcontext()
        with control:
            await daily.daily(probe=attached_probe, headless=False,
                launch_args=['--ignore-certificate-errors-spki-list=' + pin])
        return environment
    finally:
        save(mode_out, 'fixture.json', daily.proof)
        delete_daily_profile(mode_out, mode_out/'daily')


async def compare_modes(site, out):
    combined = load_case('antibot-combined')
    online, base = combined.online, combined.BASE
    config = {str(p.relative_to(base)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in [base/'haproxy.cfg', base/'routes.yaml', *sorted((base/'config/scenarios').glob('bat-lab*.yaml'))]}
    original_local = online.local
    def full_entry(route, value=None):
        result = original_local(route, value)
        if route == '/api/cases': result['url'] = result['url'].replace('http:', 'https:').replace(':4187/', ':4183/')
        return result
    online.local = full_entry
    results, environments = {}, {}
    save(out, 'preconditions.json', {'config': config, 'sameHostAndExit': True, 'headless': False,
        'initialState': 'independent-new-owned-profiles',
        'fullEntry': None if '--comparison-public' in sys.argv else 'https://localhost:4183',
        'publicDiagnostic': '--comparison-public' in sys.argv,
        'modelCalls': 0, 'personalProfileTouched': False, 'dailyBootstrapDisconnectedBeforeProbe': True})
    if '--comparison-worker-control' in sys.argv:
        save(out, 'diagnostic-only.json', {'frameStartupPauseDisabled': True, 'admissionAcceptance': False})
    modes = ['dedicated', 'daily']
    if '--comparison-mode' in sys.argv: modes = [sys.argv[sys.argv.index('--comparison-mode') + 1]]
    for mode in modes:
        mode_out = out / mode
        mode_out.mkdir()
        os.environ['BAT_ACCESS_STATE_DIR'] = str(mode_out / 'access-state')
        try:
            async with asyncio.timeout(180):
                run_mode = dedicated_mode if mode == 'dedicated' else daily_mode
                environments[mode] = await run_mode(combined, site, out, mode_out)
            results[mode] = {'passed': True}
        except Exception as error:
            results[mode] = {'passed': False, 'errorType': type(error).__name__, 'error': str(error)[:600]}
        save(out, 'mode-results.json', results)
        print(json.dumps({'mode': mode, **results[mode]}), flush=True)
    for name, digest in config.items(): assert hashlib.sha256((base/name).read_bytes()).hexdigest() == digest
    detectors = {mode: detector_summary(out/mode) for mode in results}
    same = {key: environments['dedicated'][key] == environments['daily'][key]
        for key in environments['dedicated']} if len(environments) == 2 else {}
    save(out, 'comparison.json', {'modes': results, 'environmentEqual': same, 'detectors': detectors,
        'detectorOutcomesEqual': detectors.get('dedicated') == detectors.get('daily') if len(detectors) == 2 else None,
        'shieldUnchanged': True,
        'modelCalls': 0, 'allSitesReplacementProven': False, 'personalHistoryCompared': False,
        'diagnosticOnly': '--comparison-diagnostic' in sys.argv or '--comparison-worker-control' in sys.argv})
    assert all(row['passed'] for row in results.values()), 'mode-comparison-failed-see-first-evidence'


async def warm_worker(window, site, out, server):
    limited = site.replace('127.0.0.1', 'localhost')
    policy = out/'policy.json'
    policy.write_text(json.dumps({'version': 1, 'policies': [{'origin': limited, 'source': 'operator',
        'rates': [{'limit': 2, 'intervalMs': 60000}]}]}))
    os.environ['BAT_ACCESS_STATE_DIR'] = str(out/'access-state')
    os.environ['BAT_ACCESS_POLICY_FILE'] = str(policy)
    browser = None
    try:
        browser = await window.start(resume=False, allowed_domains=['127.0.0.1', 'localhost'])
        page = await browser.get_current_page()
        await page.goto(site)
        await page.evaluate('''() => {
          const source=`onmessage=async e=>postMessage(await Promise.all(Array.from({length:e.data.count},
            ()=>fetch(e.data.url).then(r=>r.status).catch(()=>0))))`;
          globalThis.ownedWorker=new Worker(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
          return true;
        }''')
        async def read(current, count):
            raw = await current.evaluate('''data=>new Promise(resolve=>{
              ownedWorker.onmessage=e=>resolve(e.data);
              ownedWorker.onerror=e=>resolve({workerError:e.message});ownedWorker.postMessage(data);
            })'''.replace('data=>', '(data)=>'), {'url': limited+'/worker-budget', 'count': count})
            return json.loads(raw)
        first = await asyncio.wait_for(read(page, 1), 10)
        save(out, 'warm-first.json', {'results': first, 'arrivals': server.arrivals['/worker-budget']})
        assert first == [200]
        await window.handoff(browser)
        browser = await window.start(resume=True, allowed_domains=['127.0.0.1', 'localhost'])
        page = await browser.get_current_page()
        after = await asyncio.wait_for(read(page, 8), 10)
        save(out, 'warm-resumed.json', {'results': after, 'arrivals': server.arrivals['/worker-budget']})
        assert Counter(after) == {200: 1, 0: 7} and server.arrivals['/worker-budget'] == 2
        save(out, 'passed.json', {'warmWorkerResumeBudget': True, 'modelCalls': 0})
    except Exception as error:
        save(out, 'original-failure.json', {'type': type(error).__name__, 'message': str(error)[:600]})
        raise
    finally:
        if window.transferred:
            await window.end_gracefully(window.owner_id, allow_controlled=True)
            closed = {'status': 'confirmed', 'path': 'original-handoff-owner-end'}
        else: closed = await window.close(browser)
        save(out, 'closed.json', closed)
        assert not _profile_process_present(window.profile_path)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--headless', action='store_true')
    parser.add_argument('--compare-modes', action='store_true')
    parser.add_argument('--comparison-mode', choices=['dedicated', 'daily'])
    parser.add_argument('--comparison-diagnostic', action='store_true')
    parser.add_argument('--comparison-worker-control', action='store_true')
    parser.add_argument('--comparison-public', action='store_true')
    parser.add_argument('--warm-worker', action='store_true')
    options = parser.parse_args()
    if options.comparison_public: assert os.environ.get('BAT_RUN_PUBLIC_DIAGNOSTIC') == '1'
    assert not (options.headless and options.compare_modes), 'comparison-requires-visible-browsers'
    assert (ROOT / 'apps/api/python/browser_use_runner/managed_window.py').is_file()
    assert hashlib.sha256(BUNDLE.read_bytes()).hexdigest() == 'f438ed251dc7414ece9d4a2b6941441ad9ffae1a1905817f5f0c7366e701dd86'
    parent = ROOT / 'work/antibot-service/reports'
    out = Path(tempfile.mkdtemp(prefix='launch-', dir=parent)).resolve()
    profile = out / 'profile'
    window = ManagedWindow(profile, uuid4(), headless=options.headless)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    server.arrivals = Counter()
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(json.dumps({'evidence': str(out), 'headless': options.headless}), flush=True)
    try:
        if options.warm_worker:
            await warm_worker(window, f'http://127.0.0.1:{server.server_port}', out, server)
            return
        if options.compare_modes:
            await compare_modes(f'http://127.0.0.1:{server.server_port}', out)
            return
        await exercise(window, f'http://127.0.0.1:{server.server_port}', out, options.headless)
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=3)
        assert profile.resolve().parent == out and out.is_relative_to(parent)
        assert not _profile_process_present(profile), 'owned-browser-still-running'
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__': asyncio.run(main())
