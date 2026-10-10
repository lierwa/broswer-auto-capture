"""Existing business/positive controls through TLS + unchanged full CrowdSec shield."""
import asyncio
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import sys
import time
from urllib.parse import urlsplit
from unittest.mock import patch
from uuid import UUID, uuid4

from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = Path.cwd().resolve(); BASE = ROOT / 'work/antibot-service'
spec = importlib.util.spec_from_file_location('online', ROOT/'apps/api/tests/antibot-online.acceptance.py')
online = importlib.util.module_from_spec(spec); spec.loader.exec_module(online)
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present
from browser_use_runner.account_borrow import borrow_window, CheckPage
from browser_use_runner.account_browser_http import browser_request
from antibot_flow_cases import exercise as flow_exercise


async def behavior_exercise(browser, out):
    page = await browser.get_current_page()
    case = online.local('/api/cases', {'kind': 'booking', 'variant': 1})
    before = {row['id'] for row in online.alerts()}
    state = await online.ready(page, case['url'])
    await (await page.get_elements_by_css_selector('input[name=code]'))[0].fill('representative_2026')
    await asyncio.sleep(1.5)
    observed = [row for row in online.observations(case) if row.get('category') == 'input-behavior']
    online.save(out, 'behavior-native.json', observed)
    measured = [row for row in observed if row['valid'] == 'true']
    assert {'keystroke-interval', 'keystroke-entropy'} <= {row['detector'] for row in measured}
    # 若实际B-A-T触发原判据，保留首次失败，不调规则让其过测。
    assert not any(row['outcome'] == 'detected' for row in measured), 'native_keyboard_detected'
    normal = {'keys': [0, 140, 370, 455, 890, 1050, 1370],
        'scroll': {'count': 1, 'maxDelta': 1800, 'wheelCount': 1, 'scrollKey': False, 'maxTouchPoints': 0}}
    results = []
    for name in ['varied-wheel', 'fast-fixed', 'keyboard-scroll', 'touch-scroll', 'anchor-teleport', 'touch-api-missing', 'missing', 'invalid-clock']:
        data = json.loads(json.dumps(normal))
        if name == 'fast-fixed': data['keys'] = [0, 5, 10, 15, 20, 25]
        elif name == 'keyboard-scroll': data['scroll'].update(wheelCount=0, scrollKey=True)
        elif name == 'touch-scroll': data['scroll'].update(wheelCount=0, maxTouchPoints=1)
        elif name == 'anchor-teleport': data['scroll']['wheelCount'] = 0
        elif name == 'touch-api-missing': data['scroll']['maxTouchPoints'] = None
        elif name == 'missing': data = None
        elif name == 'invalid-clock': data['keys'] = [50, 40, 30, 20]
        batch = str(uuid4())
        payload = {'version': 1, 'page': state['page'], 'batch': batch, 'events': [], 'dropped': 0}
        if data is not None: payload['behavior'] = data
        status = await page.evaluate("() => fetch('/shield/telemetry/" + case['id'] + "', {method:'POST',headers:{'Content-Type':'application/json'},body:"
            + json.dumps(json.dumps(payload)) + "}).then(r=>r.status)")
        assert str(status) == '202'
        rows = [row for row in online.observations(case) if row.get('batch') == batch and row.get('category') == 'input-behavior']
        detected = sorted(row['detector'] for row in rows if row['outcome'] == 'detected')
        results.append({'name': name, 'syntheticPayload': True, 'rows': rows})
        online.save(out, 'behavior-controls.json', results)
        expected = ['keystroke-entropy', 'keystroke-interval'] if name == 'fast-fixed' else ['scroll-teleport'] if name == 'anchor-teleport' else []
        assert detected == expected
        if name in ['missing', 'invalid-clock']: assert all(row['valid'] == 'false' for row in rows)
        if name == 'touch-api-missing': assert rows[-1]['outcome'] == 'unavailable'
    await asyncio.sleep(2)
    alerts = [row for row in online.alerts() if row['id'] not in before and row['scenario'] == 'bat-lab/input-behavior']
    online.save(out, 'behavior-alerts.json', alerts)
    assert len(alerts) == 3, 'original_behavior_controls_not_detected'
    diagnostic = json.loads(await page.evaluate("""() => {
      const input=document.querySelector('input[name=code]'), button=document.querySelector('button[type=submit]');
      globalThis.__behaviorClicks=[];
      document.addEventListener('click',e=>globalThis.__behaviorClicks.push({button:e.target===button,trusted:e.isTrusted}),true);
      return {valueCorrect:input.value==='representative_2026',valid:input.checkValidity(),length:input.value.length};
    }"""))
    online.save(out, 'behavior-form-before.json', diagnostic)
    await (await page.get_elements_by_css_selector('button[type=submit]'))[0].click()
    for _ in range(20):
        await asyncio.sleep(.25)
        if '/booking' in await page.get_url(): break
    diagnostic.update(url=await page.get_url(), clicks=json.loads(await page.evaluate('() => globalThis.__behaviorClicks || []')))
    online.save(out, 'behavior-form-after.json', diagnostic)
    assert diagnostic['valueCorrect'] and diagnostic['valid'] and '/booking' in diagnostic['url']
    online.save(out, 'passed.json', {'nativeKeyboardClear': True, 'syntheticControls': len(results),
        'originalCrowdsecAlerts': 3, 'anchorCounterexampleTriggersSoftClue': True, 'modelCalls': 0,
        'generalHumanClassifierAccepted': False})


async def identity_exercise(browser, out):
    """Actual wire/JS baseline plus explicitly synthetic single-field controls."""
    page = await browser.get_current_page()
    case = online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
    before = {row['id'] for row in online.alerts()}
    state = await online.ready(page, case['url'])
    await asyncio.sleep(2)
    observed = online.observations(case)
    normal = [row for row in observed if row.get('category') == 'request-identity']
    online.save(out, 'identity-normal.json', normal)
    assert len(normal) == 11 and all(row['valid'] == 'true' and row['outcome'] == 'clear' for row in normal)
    assert not any(row['scenario'] == 'bat-lab/request-identity' for row in online.alerts() if row['id'] not in before)
    identity = json.loads(await page.evaluate("""() => {
      const keys=['architecture','bitness','model','platformVersion','wow64','fullVersionList','formFactors'];
      return navigator.userAgentData.getHighEntropyValues(keys).then(data=>({userAgent:navigator.userAgent,
        hints:navigator.userAgentData.toJSON(),highEntropy:Object.fromEntries(keys.map(key=>[key,data[key]??null]))}));
    }"""))
    environment = {'version': '2.0.0', 'status': 'measured', 'unavailable': [],
        'signals': [{'name': row['detector'], 'detected': row['outcome'] == 'detected'}
                    for row in observed if row.get('category') == 'browser-marker' and row.get('detector_version') == '2.0.0']}
    results = []
    high = ['architecture', 'bitness', 'model', 'platformVersion', 'wow64', 'fullVersionList', 'formFactors']
    controls = [] if '--identity-business-only' in sys.argv else [
        'order-normal', 'user-agent', 'brands', 'mobile', 'platform', *high, 'missing-api', 'missing-high']
    if '--identity-permission-only' in sys.argv: controls = ['policy-denied']
    if '--form-factor-only' in sys.argv: controls = ['formFactors', 'policy-denied']
    for field in controls:
        changed = json.loads(json.dumps(identity))
        if field == 'order-normal':
            changed['hints']['brands'].reverse(); changed['highEntropy']['fullVersionList'].reverse()
        elif field == 'user-agent': changed['userAgent'] = 'owned-inconsistent-ua'
        elif field == 'brands': changed['hints']['brands'][0]['version'] = '99999'
        elif field == 'mobile': changed['hints']['mobile'] = not changed['hints']['mobile']
        elif field == 'platform': changed['hints']['platform'] = 'owned-inconsistent-platform'
        elif field == 'missing-api': changed['hints'] = None
        elif field == 'missing-high': changed['highEntropy'] = None
        elif field == 'formFactors': changed['highEntropy']['formFactors'] = ['owned-other-factor']
        elif field == 'policy-denied':
            policy = json.loads(await page.evaluate("""() => {
              const frame=document.createElement('iframe');frame.allow="ch-ua-high-entropy-values 'none'";
              document.body.append(frame);const child=frame.contentWindow;
              const keys=['architecture','bitness','model','platformVersion','wow64','fullVersionList','formFactors'];
              return child.navigator.userAgentData.getHighEntropyValues(keys).then(value=>({
                allowed:child.document.featurePolicy.allowsFeature('ch-ua-high-entropy-values'),
                values:Object.fromEntries(keys.map(key=>[key,value[key]??null]))
              })).finally(()=>frame.remove());
            }"""))
            assert policy['allowed'] is False and all(value is None for value in policy['values'].values())
            changed['highEntropy'] = policy['values']
            online.save(out, 'identity-policy.json', {'browserDenied': True, 'highEntropyValuesAbsent': True})
        elif field == 'wow64': changed['highEntropy'][field] = not changed['highEntropy'][field]
        elif field == 'fullVersionList': changed['highEntropy'][field][0]['version'] = '99999.0.0.0'
        else: changed['highEntropy'][field] = 'owned-inconsistent-value'
        batch = str(uuid4())
        body = json.dumps({'version': 1, 'page': state['page'], 'batch': batch, 'events': [], 'dropped': 0,
            'environment': environment, 'identity': changed})
        status = await page.evaluate("() => fetch('/shield/telemetry/" + case['id'] + "', {method:'POST',headers:{'Content-Type':'application/json'},body:"
            + json.dumps(body) + "}).then(r=>r.status)")
        assert str(status) == '202'
        actual = [row for row in online.observations(case) if row.get('batch') == batch and row.get('category') == 'request-identity']
        results.append({'control': field, 'syntheticPayload': True, 'observed': actual})
        online.save(out, 'identity-controls.json', results)
        assert len(actual) == 11
        mismatches = [row['detector'] for row in actual if row['outcome'] == 'mismatch']
        assert mismatches == ([] if field in ['order-normal', 'missing-api', 'missing-high', 'policy-denied'] else [field])
        if field in ['missing-api', 'missing-high', 'policy-denied']:
            assert sum(row['valid'] == 'false' and row['outcome'] == 'unavailable' for row in actual) == (3 if field == 'missing-api' else 7)
    await asyncio.sleep(3)
    current = [row for row in online.alerts() if row['id'] not in before and row['scenario'] == 'bat-lab/request-identity']
    online.save(out, 'identity-alerts.json', current)
    expected = sum(field not in ['order-normal', 'missing-api', 'missing-high', 'policy-denied'] for field in controls)
    assert len(current) == expected, 'identity_controls_not_independently_detected'
    await (await page.get_elements_by_css_selector('a[href$="/7"]'))[0].click()
    # WHY：Actor的点击完成不代表导航完成；验收不能在网络到达前立即finally关窗。
    for _ in range(50):
        if (await page.get_url()).endswith('/document/7'): break
        await asyncio.sleep(.1)
    report = online.local('/api/report')
    selected = [json.loads(row['value']) for row in report['business']
                if row['case_id'] == case['id'] and row['action'] == 'selected']
    online.save(out, 'identity-business.json', {'selected': selected, 'urlMatched': (await page.get_url()).endswith('/document/7')})
    assert selected == [{'version': 7, 'correct': True}], 'identity_business_not_reached'
    online.save(out, 'passed.json', {'nativeWireJsConsistent': True, 'normalBrandOrder': 'order-normal' in controls,
        'singleFieldControlsDetected': len(current), 'controlsRun': bool(controls),
        'businessSelected': 7, 'highEntropyFields': 7, 'modelCalls': 0})


async def process_exercise(browser, out):
    page = await browser.get_current_page()
    session = await browser.get_or_create_cdp_session()
    cdp, sid = session.cdp_client, session.session_id
    results = []
    definitions = [('normal', None, 'measured'), ('electron',
        "Object.defineProperty(window,'process',{value:{type:'renderer'},configurable:true})", 'measured'),
        ('unreadable', "Object.defineProperty(window,'process',{get(){throw Error('owned-getter-error')},configurable:true})", 'partial')]
    for name, source, status in definitions:
        before = {row['id'] for row in online.alerts()}
        script = await cdp.send.Page.addScriptToEvaluateOnNewDocument(params={'source': source}, session_id=sid) if source else None
        try:
            case = online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
            state = await online.ready(page, case['url'])
            await asyncio.sleep(2)
            observed = online.observations(case)
            process = [row for row in observed if row.get('detector') == 'detectProcess']
            health = [row for row in observed if row.get('category') == 'environment-health']
            alerts = [row['scenario'] for row in online.alerts() if row['id'] not in before]
            results.append({'name': name, 'case': case['id'], 'state': state, 'process': process, 'health': health, 'alerts': alerts})
            online.save(out, 'process-calibration.json', results)
            assert state['status'] == status
            assert len(process) == 1 and process[0]['outcome'] == ('detected' if name == 'electron' else 'clear')
            if name == 'normal':
                assert health and health[0]['outcome'] == 'expected-absence' and health[0]['valid'] == 'true'
                assert 'bat-lab/telemetry-invalid' not in alerts
            else: assert ('bat-lab/browser-marker' if name == 'electron' else 'bat-lab/telemetry-invalid') in alerts
        finally:
            if script: await cdp.send.Page.removeScriptToEvaluateOnNewDocument(params=script, session_id=sid)
    online.save(out, 'passed.json', {'normalAbsenceMeasured': True, 'electronDetected': True,
        'getterFailureRemainsInvalid': True, 'originalBotdAndCrowdSecRules': True, 'modelCalls': 0})


async def account_exercise(window, browser, out):
    """Actual account connection through the same enforced TLS/challenge entry."""
    case = online.local('/api/cases', {'kind': 'catalog', 'variant': 2})
    origin = case['url'].split('/case/')[0]
    await window.handoff(browser)
    before = {row['id'] for row in online.alerts()}
    async with borrow_window(window.profile_path, window.owner_id, window.owner_id, 'dedicated') as borrowed:
        assert not any(c['name'] == '__crowdsec_challenge' for c in await borrowed.cookies([case['url']]))
        page = CheckPage(borrowed, [origin], {'errors': []})
        await page.goto(case['url'])
        await borrowed.page.locator('tbody tr').first.wait_for(state='visible', timeout=60000)
        await borrowed.page.wait_for_function('() => !!globalThis.__batShieldTelemetry', timeout=15000)
        telemetry = await borrowed.page.evaluate('() => globalThis.__batShieldTelemetry')
        assert any(c['name'] == '__crowdsec_challenge' for c in await borrowed.cookies([case['url']]))
        rows = await borrowed.page.evaluate("""() => [...document.querySelectorAll('tbody tr')].map(row =>
          ({version:Number(row.dataset.version),status:row.dataset.status,href:row.querySelector('a').getAttribute('href')}))""")
        selected = max((row for row in rows if row['status'] == '已发布'), key=lambda row: row['version'])
        await borrowed.page.locator('a[href="' + selected['href'] + '"]').click()
        response = await browser_request(borrowed, [origin], 'GET', case['url'])
        assert response.status_code == 200 and '<tbody>' in response.text
        await asyncio.sleep(2)
        observed = online.observations(case)
        assert not any(row.get('outcome') == 'detected' for row in observed)
        assert len([row for row in observed if row.get('category') == 'browser-marker' and row.get('detector_version') == '2.0.0']) == 18
        business = [row for row in online.local('/api/report')['business'] if row['case_id'] == case['id']]
        assert any(row['action'] == 'selected' and json.loads(row['value']) == {
            'version': selected['version'], 'correct': True} for row in business)
        online.save(out, 'normal.json', {'tasks': [{'id': case['id'], 'selected': selected['version'], 'telemetry': telemetry}],
            'business': business, 'observations': observed})
        await borrowed.cdp.send('Page.enable')
        script = await borrowed.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            'source': "Object.defineProperty(navigator,'webdriver',{get:()=>true,configurable:true})"})
        try:
            await page.goto(case['url'])
            await borrowed.page.wait_for_function('() => !!globalThis.__batShieldTelemetry', timeout=15000)
            actual_marker = await borrowed.page.evaluate('() => navigator.webdriver')
            online.save(out, 'positive-control.json', {'actualWebdriver': actual_marker})
            assert actual_marker is True, 'positive-control-not-applied'
            await asyncio.sleep(3)
            alerts = [row for row in online.alerts() if row['id'] not in before]
            assert any(row['scenario'] == 'bat-lab/browser-marker' for row in alerts)
        finally:
            await borrowed.cdp.send('Page.removeScriptToEvaluateOnNewDocument', script)
    assert window.inspect(window.owner_id)['active']
    online.save(out, 'passed.json', {'actualAccountBorrow': True, 'normalTasks': 1, 'challengeCookieIssued': True,
        'nativeFetch': True, 'abnormalMarkerStillDetected': True, 'modelCalls': 0, 'fullCoverageClaim': False})


async def public_exercise(browser, out):
    """Low-volume public practice tasks; never solve an interactive challenge."""
    page = await browser.get_current_page()
    session = await browser.get_or_create_cdp_session()
    documents, challenge_resources, results, seen, failures = [], set(), [], set(), []
    def response(event, _sid):
        value = event.get('response', {})
        parsed = urlsplit(value.get('url', ''))
        identity = (event.get('requestId'), event.get('loaderId'), value.get('url'))
        if identity in seen: return
        seen.add(identity)
        headers = {k.lower(): v for k, v in value.get('headers', {}).items()}
        if '/cdn-cgi/challenge-platform/' in parsed.path: challenge_resources.add(parsed.hostname)
        if event.get('type') in ('Document', 'XHR', 'Fetch') or value.get('status', 0) >= 400:
            documents.append({'host': parsed.hostname, 'path': '/cdn-cgi/challenge-platform/[redacted]' if '/cdn-cgi/challenge-platform/' in parsed.path else parsed.path,
                'type': event.get('type'), 'status': value.get('status'),
                'protocol': value.get('protocol'), 'server': headers.get('server'), 'mitigated': headers.get('cf-mitigated')})
    session.cdp_client.register.Network.responseReceived(response)
    session.cdp_client.register.Network.loadingFailed(lambda event, _sid: failures.append({
        'type': event.get('type'), 'error': event.get('errorText'), 'blockedReason': event.get('blockedReason')}))
    await session.cdp_client.send.Network.enable(session_id=session.session_id)
    expression = """() => ({title:document.title,books:document.querySelectorAll('article.product_pod').length,
      products:document.querySelectorAll('.product-item').length,
      next:!!document.querySelector('li.next a'),load:!!document.querySelector('#load-more-btn'),
      challenge:!!document.querySelector('[name="cf-turnstile-response"],#challenge-running,#challenge-stage'),
      content:document.body?.innerText.includes('bypassed the Cloudflare challenge')||false})"""
    async def snapshot(): return json.loads(await page.evaluate(expression))
    cases = [('books', 'https://books.toscrape.com/'),
                      ('dynamic', 'https://www.scrapingcourse.com/button-click'),
                      ('cloudflare', 'https://www.scrapingcourse.com/cloudflare-challenge')]
    for name, url in cases:
        if '--public-dynamic-only' in sys.argv and name != 'dynamic': continue
        result = {'scenario': name, 'url': url, 'status': 'unmeasured'}
        start = len(documents)
        try:
            await asyncio.wait_for(page.goto(url), 40)
            deadline = time.monotonic() + 20
            observed = await snapshot()
            while time.monotonic() < deadline and not (observed['books'] or observed['products'] or observed['content']):
                await asyncio.sleep(1)
                observed = await snapshot()
            result['initial'] = observed
            if name == 'books' and observed['books'] and observed['next']:
                await (await page.get_elements_by_css_selector('li.next a'))[0].click()
                await asyncio.sleep(1)
                result['after'] = await snapshot()
                result['status'] = 'passed' if '/page-2.html' in await page.get_url() and result['after']['books'] > 0 else 'failed'
            elif name == 'dynamic' and observed['products'] and observed['load']:
                await page.evaluate("""() => {globalThis.__ownedClicks=[];document.addEventListener('click',e=>
                  globalThis.__ownedClicks.push({tag:e.target.tagName,id:e.target.id,trusted:e.isTrusted}),true)}""")
                result['scripts'] = json.loads(await page.evaluate("""() => [...document.scripts]
                  .filter(s=>!s.src && s.textContent.includes('load-more-btn')).map(s=>s.textContent)"""))
                await (await page.get_elements_by_css_selector('#load-more-btn'))[0].click()
                deadline = time.monotonic() + 15
                after = await snapshot()
                while time.monotonic() < deadline and after['products'] <= observed['products']:
                    await asyncio.sleep(.5)
                    after = await snapshot()
                result.update(after=after, status='passed' if after['products'] > observed['products'] else 'failed')
                result['clicks'] = json.loads(await page.evaluate('() => globalThis.__ownedClicks'))
            elif name == 'cloudflare' and observed['content']: result['status'] = 'passed'
            else: result['status'] = 'challenge_pending' if observed['challenge'] else 'expected_content_missing'
        except Exception as error:
            result.update(status='failed', errorType=type(error).__name__)
        result['documents'] = documents[start:]
        result['loadingFailures'] = list(failures)
        results.append(result)
        online.save(out, 'public-results.json', results)
    online.save(out, 'public-receipt.json', {'results': results, 'challengeResourceHosts': sorted(challenge_resources),
        'admission': dict(session.cdp_client.send.Fetch._bat_access.counts), 'modelCalls': 0,
        'personalProfileUsed': False, 'interactiveChallengeSolved': False, 'majoritySitesClaim': False})


async def challenge_exercise(browser, out):
    from challenge_diagnostics import SOURCE, SNAPSHOT
    page = await browser.get_current_page()
    session = await browser.get_or_create_cdp_session()
    script = await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(params={'source': SOURCE}, session_id=session.session_id)
    case = online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
    began, rows = time.monotonic(), []
    try:
        await page.goto(case['url'])
        for _ in range(35):
            state = json.loads(await page.evaluate(SNAPSHOT))
            rows.append({'elapsed': round(time.monotonic()-began, 2), **state})
            online.save(out, 'challenge-state.json', {'case': case['id'], 'observations': rows, 'modelCalls': 0,
                'diagnosticWrapperOnly': True, 'rawFingerprintPersisted': False})
            if state['business']: break
            await asyncio.sleep(1)
    finally:
        await session.cdp_client.send.Page.removeScriptToEvaluateOnNewDocument(params=script, session_id=session.session_id)


def delete_profiles(out, profile, short_temp):
    assert profile == out/'profile' or (profile.parent.parent == out/'browser-profile'/'runs'
        and str(UUID(profile.parent.name)) == profile.parent.name and profile.name == 'default')
    assert out.is_relative_to(BASE/'reports') and profile.resolve().is_relative_to(out)
    assert not any(p.is_symlink() or p.is_junction() for p in [out, *profile.parents[:4], profile, *profile.rglob('*')])
    if profile.exists(): shutil.rmtree(profile)
    if short_temp:
        assert short_temp.resolve() == out/'browser-temp'
        assert not any(p.is_symlink() or p.is_junction() for p in [short_temp, *short_temp.rglob('*')])
        shutil.rmtree(short_temp)
    online.save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})
    if short_temp: online.save(out, 'temp-deleted.json', {'permanentlyDeleted': not short_temp.exists()})


def profile_configuration(out):
    profile = out/'profile'
    if '--product-profile-depth' in sys.argv:
        if '--challenge-state' not in sys.argv: raise ValueError('profile_depth_diagnostic_only')
        profile = out/'browser-profile'/'runs'/str(uuid4())/'default'
    short_temp = out/'browser-temp' if '--short-browser-temp' in sys.argv else None
    if short_temp:
        if '--product-profile-depth' not in sys.argv: raise ValueError('short_temp_diagnostic_only')
        short_temp.mkdir()
    return profile, short_temp


def owned_launcher(profile, short_temp, out, original_popen):
    certificate = x509.load_pem_x509_certificate((BASE/'tls/cert.pem').read_bytes())
    pin = base64.b64encode(hashlib.sha256(certificate.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).digest()).decode()
    def launch(args, **kwargs):
        if any(arg == '--user-data-dir=' + str(profile) for arg in args):
            args = [*args, '--ignore-certificate-errors-spki-list=' + pin]
            if '--browser-startup-log' in sys.argv:
                if '--challenge-state' not in sys.argv: raise ValueError('browser_log_diagnostic_only')
                args += ['--enable-logging', '--log-level=2', '--log-file=' + str(out/'browser-errors.log')]
            if short_temp:
                kwargs['env'] = {**kwargs['env'], **{name: str(short_temp) for name in ['TMP', 'TEMP', 'TMPDIR']}}
            online.save(out, 'chrome-temp.json', {'profilePathLength': len(str(profile)),
                'browserTempPathLength': len(kwargs['env']['TEMP']), 'tempWithinProfile': Path(kwargs['env']['TEMP']).is_relative_to(profile)})
        return original_popen(args, **kwargs)
    return launch


async def main():
    out = Path(tempfile.mkdtemp(prefix='combined-', dir=BASE/'reports')).resolve()
    profile, short_temp = profile_configuration(out)
    os.environ['BAT_ACCESS_STATE_DIR'] = str(out/'access-state')
    external = '--public-practice' in sys.argv
    window, browser = ManagedWindow(profile, uuid4()), None
    original_local = online.local
    launch = owned_launcher(profile, short_temp, out, subprocess.Popen)
    def full_entry(route, value=None):
        result = original_local(route, value)
        if route == '/api/cases': result['url'] = result['url'].replace('http:', 'https:').replace(':4187/', ':4183/')
        return result
    configuration = {str(file.relative_to(BASE)): hashlib.sha256(file.read_bytes()).hexdigest()
        for file in [BASE/'haproxy.cfg', BASE/'routes.yaml', *sorted((BASE/'config/scenarios').glob('bat-lab*.yaml'))]}
    before = {row['id'] for row in online.alerts()}
    online.save(out, 'preconditions.json', {'configuration': configuration, 'fullEntry': None if '--h2' in sys.argv else 'https://localhost:4183',
        'profilePathLength': len(str(profile)),
            'normalTasks': ['native-h2-navigation-fetch'] if '--h2' in sys.argv else ['flow-form-spa-cache-redirect-api'] if '--flow' in sys.argv else ['account-catalog-native-fetch'] if '--account-borrow' in sys.argv else ['dynamic-catalog-variant1', 'dynamic-catalog-variant3', 'booking'],
        'positives': ['h2-settings-order-mismatch'] if '--h2' in sys.argv else ['workflow-prerequisite'] if '--flow' in sys.argv else ['webdriver'] if '--account-borrow' in sys.argv else ['webdriver', 'scripted-input'],
        'noWhitelist': True, 'sourceData': original_local('/api/report')['networkSource']})
    print(json.dumps({'evidence': str(out)}), flush=True)
    try:
        with patch('browser_use_runner.managed_window.subprocess.Popen', side_effect=launch):
            browser = await window.start(resume=False, allowed_domains=['books.toscrape.com', '*.scrapingcourse.com', 'scrapingcourse.com'] if external else ['*.localhost'])
        lease = window._load()
        online.save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted, 'profile': str(profile),
            'tlsTrust': 'only-owned-SPKI', 'personalTrustChanged': False})
        if external:
            await public_exercise(browser, out)
            return
        with patch.object(online, 'local', side_effect=full_entry):
            if '--webgl-online' in sys.argv or '--worker-online' in sys.argv:
                file = 'antibot-device.acceptance.py' if '--worker-online' in sys.argv else 'antibot-creep.acceptance.py'
                spec = importlib.util.spec_from_file_location('creep_online', Path(__file__).with_name(file))
                creep = importlib.util.module_from_spec(spec); spec.loader.exec_module(creep)
                await creep.exercise_online(browser, out, online)
                for name, digest in configuration.items(): assert hashlib.sha256((BASE/name).read_bytes()).hexdigest() == digest
                return
            if '--behavior' in sys.argv:
                await behavior_exercise(browser, out)
                for name, digest in configuration.items(): assert hashlib.sha256((BASE/name).read_bytes()).hexdigest() == digest
                return
            if '--challenge-state' in sys.argv:
                await challenge_exercise(browser, out)
                return
            if '--identity' in sys.argv:
                await identity_exercise(browser, out)
                for name, digest in configuration.items(): assert hashlib.sha256((BASE/name).read_bytes()).hexdigest() == digest
                return
            if '--process-calibration' in sys.argv:
                await process_exercise(browser, out)
                for name, digest in configuration.items(): assert hashlib.sha256((BASE/name).read_bytes()).hexdigest() == digest
                return
            if '--h2' in sys.argv:
                from antibot_h2_cases import exercise as h2_exercise
                await h2_exercise(online, browser, out)
            elif '--flow' in sys.argv: await flow_exercise(online, browser, out)
            elif '--account-borrow' in sys.argv: await account_exercise(window, browser, out)
            else: await online.exercise(browser, out)
        new_alerts = [row for row in online.alerts() if row['id'] not in before]
        assert not any(row['scenario'] in ['bat-lab/protocol-continuity', 'bat-lab/tor-repeated-failure'] for row in new_alerts)
        assert original_local('/api/report')['networkSource']['status'] == 'available'
        normal = json.loads((out/'normal.json').read_text())
        if '--h2' in sys.argv:
            for name, digest in configuration.items(): assert hashlib.sha256((BASE/name).read_bytes()).hexdigest() == digest
            online.save(out, 'combined.json', {'business': json.loads((out/'passed.json').read_text()),
                'fullShieldEntry': False, 'h2LayerOnly': True, 'allCoverageComplete': False})
            return
        hosts = {hashlib.sha256((item['id']+'.localhost').encode()).hexdigest() for item in normal['tasks']}
        transport = [json.loads(line) for line in (BASE/'logs/tls.jsonl').read_text().splitlines() if line.startswith('{')]
        transport = [row for row in transport if row['site'] in hosts]
        assert transport and all(row['valid'] == 'true' and row['ja4_status'] == 'measured' for row in transport)
        h2 = [row for item in normal['tasks'] for row in online.observations(item)
              if row['category'] == 'h2-coherence' and row.get('entry') == 'full-shield']
        if (BASE/'edge-h2.json').exists():
            assert h2 and all(row['valid'] == 'true' and row['outcome'] == 'consistent' for row in h2)
        online.save(out, 'integrated-h2.json', h2)
        online.save(out, 'combined.json', {'business': json.loads((out/'passed.json').read_text()),
            'tlsRequests': len(transport), 'tlsMeasurementValid': True, 'protocolFalsePositive': False,
            'integratedH2Requests': len(h2),
            'sourceDataAvailable': True, 'newAlertScenarios': sorted({row['scenario'] for row in new_alerts}),
            'naturalLanguageCompilationTested': False, 'allCoverageComplete': False})
        for name, digest in configuration.items(): assert hashlib.sha256((BASE/name).read_bytes()).hexdigest() == digest
    finally:
        if window.transferred:
            await window.end_gracefully(window.owner_id)
            closed = {'status': 'confirmed', 'path': 'original-handoff-owner-end'}
        else: closed = await window.close(browser)
        online.save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        delete_profiles(out, profile, short_temp)


if __name__ == '__main__': asyncio.run(main())
