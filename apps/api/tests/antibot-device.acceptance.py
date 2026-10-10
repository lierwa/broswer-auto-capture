"""Original screen/GPU integrity rules, consistent DPR counterexample and unavailable APIs."""
import asyncio
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch
from uuid import uuid4
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = Path.cwd().resolve(); BASE = ROOT/'work/antibot-service'
spec = importlib.util.spec_from_file_location('online', ROOT/'apps/api/tests/antibot-online.acceptance.py')
online = importlib.util.module_from_spec(spec); spec.loader.exec_module(online)
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


async def exercise(browser, out):
    page = await browser.get_current_page(); results = {}
    session = await browser.get_or_create_cdp_session()
    for mode in ['baseline', 'scaled', 'screen-tampered', 'gpu-tampered', 'no-gpu', 'no-permissions']:
        try:
            if mode == 'scaled':
                await session.cdp_client.send.Emulation.setDeviceMetricsOverride(params={
                    'width': 1200, 'height': 800, 'deviceScaleFactor': 1.5, 'mobile': False,
                    'screenWidth': 1200, 'screenHeight': 800}, session_id=session.session_id)
            await page.goto('https://localhost:4183/measurement/worker/devices?mode=' + mode)
            for _ in range(200):
                current = json.loads(await page.evaluate('() => ({query:location.search,result:globalThis.__deviceResult || null})'))
                if current['query'] == '?mode=' + mode and current['result']: break
                await asyncio.sleep(.1)
            else: raise AssertionError('device-probe-timeout:' + mode)
            results[mode] = current['result']; online.save(out, 'device-results.json', results)
        finally:
            if mode == 'scaled': await session.cdp_client.send.Emulation.clearDeviceMetricsOverride(session_id=session.session_id)
    for mode in ['baseline', 'scaled']:
        assert results[mode]['screen']['validity'] == 'measured' and results[mode]['screen']['lied'] is False, 'normal-screen-false-positive'
        assert not results[mode]['rules'].get('GPU.requestAdapter'), 'native-gpu-method-false-positive'
    assert results['screen-tampered']['screen']['lied'], 'screen-css-mismatch-missed'
    assert results['gpu-tampered']['rules'].get('GPU.requestAdapter'), 'gpu-method-tampering-missed'
    assert results['no-gpu']['gpu']['validity'] == 'unavailable', 'missing-gpu-reported-healthy'
    assert results['no-permissions']['permissions']['validity'] == 'unavailable', 'missing-permissions-reported-healthy'
    assert {'camera', 'microphone', 'geolocation'} <= set(results['baseline']['permissions']['states']['denied'])
    online.save(out, 'passed.json', {'screenMatchMediaRule': True, 'consistentEmulatedDprNormal': True,
        'gpuNativeIntegrityRule': True, 'permissionDenialAndMissingDistinct': True, 'noMediaCaptured': True,
        'physicalMultiMonitorOrGpuTested': False, 'webglWebgpuIdentityClassifier': False, 'modelCalls': 0})


async def contexts(browser, out):
    page = await browser.get_current_page()
    rows = []
    controls = [('baseline', None), ('platform', 'owned-other-platform'),
        ('userAgent', 'owned-other-user-agent'), ('deviceMemory', 123), ('language', 'zz-ZZ'),
        ('languages', ['zz-ZZ'])]
    for name, value in controls:
        await page.goto('https://localhost:4183/measurement/worker/devices?mode=baseline&control='+name)
        for _ in range(200):
            raw = json.loads(await page.evaluate('() => ({result:globalThis.__deviceResult || null})'))['result']
            if raw: break
            await asyncio.sleep(.1)
        assert raw and not raw.get('rules'), 'context_normal_baseline_missing:'+name
        if name != 'baseline':
            # WHY：先完成原生对象扫描，再单侧改值并调用原probe，避免把getter篡改告警误当worker比较。
            source = "() => {Object.defineProperty(navigator," + json.dumps(name)
            source += ',{get:()=>'+json.dumps(value)+"}); return import('/measurement/worker/devices.js').then(m=>m.probe());}"
            raw = json.loads(await page.evaluate(source))
        row = {'control': name, 'workerAvailable': raw.get('workerAvailable'), 'navigator': raw.get('navigator'),
            'rules': sorted(raw.get('rules', {})), 'workerMismatchRules': sorted(key for key, reasons in raw.get('rules', {}).items()
                if any('does not match worker scope' in reason for reason in reasons)), 'rawFingerprintPersisted': False}
        rows.append(row); online.save(out, 'context-results.json', rows)
        assert row['workerAvailable'] and row['navigator']['validity'] == 'measured'
        if name in ('platform', 'userAgent', 'deviceMemory'):
            assert 'Navigator.'+name in row['workerMismatchRules'], 'context_mismatch_missed:'+name
        elif name in ('language', 'languages'):
            row['signalDetected'] = 'Navigator.'+name in row['rules']
            online.save(out, 'context-results.json', rows)
    online.save(out, 'context-passed.json', {'normalNative': True, 'detectedSingleFieldMismatches': 3,
        'languageSignals': {row['control']: row.get('signalDetected') for row in rows if row['control'] in ('language','languages')},
        'allContextRulesAccepted': False, 'productInjectionAdded': False, 'modelCalls': 0})


async def deadlines(browser, out):
    page = await browser.get_current_page()
    rows = []
    for mode in ['baseline', 'permission-pending', 'gpu-pending', 'restored']:
        await page.goto('https://localhost:4183/measurement/worker/devices?mode=baseline')
        async with asyncio.timeout(20):
            while True:
                raw = json.loads(await page.evaluate('() => ({result:globalThis.__deviceResult || null})'))['result']
                if raw: break
                await asyncio.sleep(.1)
        if mode not in ('baseline', 'restored'):
            raw = json.loads(await page.evaluate("""(mode) => {
              if(mode==='permission-pending') navigator.permissions.query=()=>new Promise(()=>{});
              if(mode==='gpu-pending') {
                if(!navigator.gpu) throw Error('owned_gpu_control_unavailable');
                navigator.gpu.requestAdapter=()=>new Promise(()=>{});
              }
              return import('/measurement/worker/devices.js').then(module=>Promise.race([
                module.probe(),new Promise(resolve=>setTimeout(()=>resolve({probePending:true}),8000))
              ]));
            }""", mode))
        rows.append({'mode': mode, 'result': raw}); online.save(out, 'device-deadline.json', rows)
    for row in rows:
        result, mode = row['result'], row['mode']
        assert not result.get('probePending'), 'device-pending-blocked-independent-screen'
        assert result['screen']['validity'] == 'measured' and result['workerAvailable']
        if mode in ('permission-pending', 'gpu-pending'):
            assert result['navigator']['validity'] == 'timeout' and result['navigator']['lied'] is None
            assert result['gpu']['validity'] == result['permissions']['validity'] == 'timeout'
        else: assert result['navigator']['validity'] == 'measured'
    online.save(out, 'passed.json', {'boundedDeviceProbe': True, 'controls': 4, 'modelCalls': 0})


async def main():
    out = Path(tempfile.mkdtemp(prefix='device-', dir=BASE/'reports')).resolve(); profile = out/'profile'
    window, browser = ManagedWindow(profile, uuid4()), None
    certificate = x509.load_pem_x509_certificate((BASE/'tls/cert.pem').read_bytes())
    pin = base64.b64encode(hashlib.sha256(certificate.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).digest()).decode()
    original = subprocess.Popen
    def launch(args, **kwargs):
        if any(arg == '--user-data-dir=' + str(profile) for arg in args): args = [*args, '--ignore-certificate-errors-spki-list=' + pin]
        return original(args, **kwargs)
    print(json.dumps({'evidence': str(out)}), flush=True)
    try:
        with patch('browser_use_runner.managed_window.subprocess.Popen', side_effect=launch):
            browser = await window.start(resume=False, allowed_domains=['*.localhost'])
        lease = window._load(); online.save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted,
            'profile': str(profile), 'purpose': 'owned-read-only-device-calibration'})
        await (deadlines(browser, out) if '--deadline' in sys.argv else contexts(browser, out) if '--contexts' in sys.argv else exercise(browser, out))
    finally:
        closed = await window.close(browser); online.save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        assert profile.parent == out and out.is_relative_to(BASE/'reports')
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        online.save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


async def exercise_online(browser, out, online):
    page = await browser.get_current_page()
    controls = [('baseline', None), ('platform', 'owned-other-platform'), ('userAgent', 'owned-other-UA'),
                ('deviceMemory', 123), ('hardwareConcurrency', 123), ('blocked-worker', None)]
    results = []
    for name, value in controls:
        before = {row['id'] for row in online.alerts()}
        case = online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
        state = await online.ready(page, case['url'])
        for _ in range(160):
            native = [r for r in online.observations(case) if r.get('detector', '').startswith('creepWorker.')]
            if len(native) == 4: break
            await asyncio.sleep(.1)
        online.save(out, 'worker-native-last.json', native)
        assert len(native) == 4 and all(r['valid'] == 'true' and r['outcome'] == 'clear' for r in native)
        integrity = json.loads(await page.evaluate('() => globalThis.__batShieldWorker'))
        if name == 'blocked-worker':
            await page.evaluate("""() => {
              globalThis.__ownedWorkerBlocked=false;
              document.addEventListener('securitypolicyviolation',e=>{
                if(e.effectiveDirective==='worker-src') globalThis.__ownedWorkerBlocked=true;
              });
              const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';
              meta.content="worker-src 'none'";document.head.append(meta);return true;
            }""")
        elif name != 'baseline':
            await page.evaluate("() => {Object.defineProperty(navigator,"+json.dumps(name)
                                +",{get:()=>"+json.dumps(value)+"});return true;}")
        batch = None
        if name != 'baseline':
            integrity = json.loads(await page.evaluate("() => import('/measurement/worker/probe.js').then(m=>m.workerIntegrity())"))
            batch = str(uuid4())
            packet = {'version': 1, 'page': state['page'], 'batch': batch, 'events': [], 'dropped': 0, 'workerIntegrity': integrity}
            status = await page.evaluate("() => fetch('/shield/telemetry/"+case['id']+"', {method:'POST',headers:{'Content-Type':'application/json'},body:"
                +json.dumps(json.dumps(packet))+"}).then(r=>r.status)")
            assert str(status) == '202'
        measured = [r for r in online.observations(case) if r.get('detector', '').startswith('creepWorker.') and (batch is None or r['batch'] == batch)]
        flagged = [r['detector'] for r in measured if r['outcome'] == 'detected']
        assert flagged == ([] if name in ['baseline', 'blocked-worker'] else ['creepWorker.'+name])
        assert len(measured) == 4
        if name == 'blocked-worker':
            policy = json.loads(await page.evaluate('() => ({blocked:globalThis.__ownedWorkerBlocked})'))
            assert policy['blocked'] and all(r['valid'] == 'false' and r['outcome'] == 'unavailable' for r in measured)
            report = next(r for r in online.local('/api/report')['telemetry'] if r['caseId'] == case['id'])
            assert report['workerIntegrity'] == 'unavailable'
        resources = json.loads(await page.evaluate('() => navigator.serviceWorker.getRegistrations().then(r=>({registrations:r.length}))'))
        assert resources['registrations'] == 0, 'online_probe_registered_service_worker'
        await asyncio.sleep(2)
        alerts = [r for r in online.alerts() if r['id'] not in before and r['scenario'] == 'bat-lab/browser-marker']
        assert len(alerts) == len(flagged)
        observations = online.observations(case)
        botd = [r for r in observations if r.get('detector_version') == '2.0.0']
        webgl = [r for r in observations if r.get('detector') == 'creepWebglMirror']
        assert len(botd) == 18 and all(r['outcome'] == 'clear' for r in botd)
        assert len(webgl) == 1 and webgl[0]['outcome'] == 'clear' and webgl[0]['valid'] == 'true'
        results.append({'control': name, 'case': case['id'], 'native': native, 'observations': measured,
                        'alerts': alerts, 'resources': resources, 'botdClear': len(botd), 'webglClear': True})
        online.save(out, 'worker-online.json', results)
        if name == 'baseline':
            await (await page.get_elements_by_css_selector('a[href$="/document/7"]'))[0].click()
            for _ in range(50):
                if (await page.get_url()).endswith('/document/7'): break
                await asyncio.sleep(.1)
            selected = [json.loads(r['value']) for r in online.local('/api/report')['business'] if r['case_id'] == case['id'] and r['action'] == 'selected']
            online.save(out, 'worker-business.json', selected)
            assert selected == [{'version': 7, 'correct': True}]
    session = await browser.get_or_create_cdp_session()
    targets = await session.cdp_client.send.Target.getTargets()
    assert not any(t['type'] == 'worker' and '/measurement/worker/creep.js' in t['url'] for t in targets['targetInfos'])
    online.save(out, 'passed.json', {'controls': len(results), 'modelCalls': 0, 'probeWorkerRemaining': False})


if __name__ == '__main__': asyncio.run(main())
