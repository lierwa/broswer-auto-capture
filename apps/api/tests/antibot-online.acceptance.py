"""Live business -> reduced telemetry -> native CrowdSec; one owned visible session."""
import asyncio
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path.cwd().resolve()
BASE = ROOT / 'work/antibot-service'
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


def local(route, value=None):
    request = Request('http://127.0.0.1:4188' + route, data=None if value is None else json.dumps(value).encode(),
        headers={'Origin': 'http://127.0.0.1:4188', 'Content-Type': 'application/json'})
    with urlopen(request, timeout=20) as response: return json.load(response)


def observations(case):
    return [row for line in (BASE / 'logs/observations.jsonl').read_text().splitlines()
        if (row := json.loads(line)).get('site') == case['id']]


def alerts():
    base = json.loads((BASE / 'prepared.json').read_text())['base']
    result = subprocess.run(['wsl', '-d', 'Ubuntu', '--exec',
        base + '/runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli', '-c', base + '/config/config.yaml',
        'alerts', 'list', '-l', '0', '-o', 'json'], capture_output=True, check=True)
    return json.loads(result.stdout.decode('utf-8')) or []


async def ready(page, url):
    await page.goto(url)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        raw = await page.evaluate('() => globalThis.__batShieldTelemetry || null')
        if raw and raw != 'null': return json.loads(raw)
        await asyncio.sleep(.25)
    raise AssertionError('full-shield-or-telemetry-not-ready')


async def exercise(browser, out, *, controls=True):
    before = {row['id'] for row in alerts()}
    page = await browser.get_current_page()
    cases, normals = [], []
    for variant, expected in [(1, 7), (3, 13)]:
        case = local('/api/cases', {'kind': 'catalog', 'variant': variant}); cases.append(case)
        state = await ready(page, case['url'])
        rows = json.loads(await page.evaluate("""() => [...document.querySelectorAll('tbody tr')].map(row =>
          ({version:Number(row.dataset.version),status:row.dataset.status,href:row.querySelector('a').getAttribute('href')}))"""))
        selected = max((row for row in rows if row['status'] == '已发布'), key=lambda row: row['version'])
        assert selected['version'] == expected
        await asyncio.sleep(1.1)
        await (await page.get_elements_by_css_selector('a[href="' + selected['href'] + '"]'))[0].click()
        # WHY：原click只确认输入送达；验收驱动不能立刻goto下一case取消尚在准入中的导航。
        # 等原动作实际提交，不重发点击，也不以等待通过替代后面的源站业务断言。
        async with asyncio.timeout(10):
            while not (await page.get_url()).endswith(selected['href']): await asyncio.sleep(.05)
        normals.append({'id': case['id'], 'kind': 'catalog', 'selected': expected, 'telemetry': state})
    case = local('/api/cases', {'kind': 'booking'}); cases.append(case)
    state = await ready(page, case['url'])
    await (await page.get_elements_by_css_selector('input[name=code]'))[0].fill('owned_demo')
    await (await page.get_elements_by_css_selector('button[type=submit]'))[0].click()
    await asyncio.sleep(2)
    normals.append({'id': case['id'], 'kind': 'booking', 'telemetry': state})
    report = local('/api/report')
    business = [row for row in report['business'] if row['case_id'] in {c['id'] for c in cases}]
    assert all(next(row for row in report['telemetry'] if row['caseId'] == task['id'])['pageId'] == task['telemetry']['page'] for task in normals)
    normal_rows = [row for item in cases for row in observations(item)]
    save(out, 'normal.json', {'tasks': normals, 'business': business, 'observations': normal_rows})
    assert len([row for row in business if row['action'] == 'selected']) == 2
    submitted = [json.loads(row['value']) for row in business if row['action'] == 'submitted']
    assert submitted == [{'code': 'owned_demo', 'format': 'online'}]
    assert sum(row.get('category') == 'browser-marker' and row.get('detector_version') == '2.0.0' for row in normal_rows) == 54
    assert not any(row.get('outcome') == 'detected' for row in normal_rows), 'normal-browser-marker'
    native = [row for row in normal_rows if row.get('category') == 'input' and row.get('event_type') in ['input','change','click','keydown','keyup']]
    assert native and all(row['trusted'] == 'true' for row in native), 'normal-scripted-input'
    normal_alerts = [row for row in alerts() if row['id'] not in before]
    assert not any(row['scenario'] in ['bat-lab/browser-marker', 'bat-lab/scripted-input'] for row in normal_alerts)
    if controls:
        await abnormal(browser, page, case, out, {row['id'] for row in alerts()})
    save(out, 'passed.json', {'liveOriginToCrowdSec': True, 'normalTasks': 3, 'normalEvents': len(native),
        'modelCalls': 0, 'abnormalControlsExecuted': controls,
        'naturalLanguageCompilationTested': False, 'fullCoverageClaim': False})


async def abnormal(browser, page, case, out, before):
    session = await browser.get_or_create_cdp_session()
    script = await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(params={
        'source': "Object.defineProperty(navigator,'webdriver',{get:()=>true,configurable:true})"}, session_id=session.session_id)
    try:
        await ready(page, case['url'])
        await page.evaluate("() => document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}))")
        await asyncio.sleep(4)
        current = [row for row in alerts() if row['id'] not in before]
        scenarios = {row['scenario'] for row in current}
        save(out, 'positive.json', {'scenarios': sorted(scenarios), 'observations': observations(case)})
        assert {'bat-lab/browser-marker', 'bat-lab/scripted-input'} <= scenarios
    finally:
        await session.cdp_client.send.Page.removeScriptToEvaluateOnNewDocument(params=script, session_id=session.session_id)
    await session.cdp_client.send.Network.enable(session_id=session.session_id)
    await session.cdp_client.send.Network.setBlockedURLs(params={'urls': ['*/measurement/probe/botd.js']}, session_id=session.session_id)
    try:
        state = await ready(page, case['url'])
        await asyncio.sleep(2)
        save(out, 'unavailable.json', {'telemetry': state, 'observations': observations(case)})
        assert state['status'] == 'error', 'blocked-probe-was-reported-healthy'
        assert any(row.get('outcome') == 'error' and row.get('valid') == 'false' for row in observations(case))
        code = await page.evaluate("""() => fetch('/shield/telemetry/""" + case['id'] + """',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rawInput:'must-not-be-logged'})}).then(r=>({status:r.status}))""")
        assert json.loads(code)['status'] == 400, 'unsafe-payload-not-rejected'
        unknown = json.dumps({'version': 1, 'page': str(uuid4()), 'batch': str(uuid4()), 'events': [], 'dropped': 0})
        code = await page.evaluate("() => fetch('/shield/telemetry/" + case['id'] + "', {method:'POST',headers:{'Content-Type':'application/json'},body:"
            + json.dumps(unknown) + "}).then(r=>({status:r.status}))")
        assert json.loads(code)['status'] == 400, 'unknown-page-accepted'
        await telemetry_protocol(page, case, out)
        await session.cdp_client.send.Network.setBlockedURLs(params={'urls': ['*/shield/collector.js']}, session_id=session.session_id)
        await page.goto(case['url']); await asyncio.sleep(1)
        health = next(row for row in local('/api/report')['telemetry'] if row['caseId'] == case['id'])
        save(out, 'missing-collector.json', health)
        assert health['environment'] == 'missing', 'earlier-page-measurement-masked-missing-collector'
        await asyncio.sleep(10)
        health = next(row for row in local('/api/report')['telemetry'] if row['caseId'] == case['id'])
        save(out, 'timeout-collector.json', health)
        assert health['environment'] == 'timeout', 'measurement-timeout-was-hidden'
    finally:
        await session.cdp_client.send.Network.setBlockedURLs(params={'urls': []}, session_id=session.session_id)


async def telemetry_protocol(page, case, out):
    current = json.loads(await page.evaluate('() => globalThis.__batShieldTelemetry'))['page']
    packet = {'version': 1, 'page': current, 'batch': str(uuid4()), 'events': [
        {'type': 'click', 'trusted': True, 'hidden': False}], 'dropped': 0}
    request = "fetch('/shield/telemetry/" + case['id'] + "', {method:'POST',headers:{'Content-Type':'application/json'},body:"
    send = lambda value: request + json.dumps(json.dumps(value)) + "}).then(r=>r.status)"
    result = json.loads(await page.evaluate('() => Promise.all([' + send(packet) + ',' + send(packet) + '])'))
    assert sorted(result) == [202, 400], 'concurrent-replay-not-deduplicated'
    malformed = []
    for patch in [{'version': 2}, {'environment': {'version': '2.0.0', 'status': 'measured', 'signals': [], 'unavailable': []}},
        {'environment': {'version': '2.0.0', 'status': 'partial', 'signals': [], 'unavailable': []}}]:
        candidate = {**packet, 'batch': str(uuid4()), **patch}
        code = await page.evaluate('() => ' + send(candidate))
        malformed.append(int(code)); assert int(code) == 400
    base = json.loads((BASE / 'prepared.json').read_text())['base']
    inspect = subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', 'systemctl', '--user', 'show',
        'bat-antibot-origin.service', '--property=WorkingDirectory', '--value'], capture_output=True, check=True)
    assert inspect.stdout.decode().strip() == base
    subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', 'systemctl', '--user', 'restart',
        'bat-antibot-origin.service'], capture_output=True, check=True)
    for attempt in range(20):
        try:
            if local('/api/health')['owner'] == 'bat-antibot-lab': break
        except Exception: await asyncio.sleep(.25)
    else: raise AssertionError('origin-restart-not-ready')
    code = int(await page.evaluate('() => ' + send(packet)))
    assert code == 400, 'replay-after-origin-restart-accepted'
    # 同批次现已有独立行为健康记录；去重不变量是本次唯一输入事件只采纳一次。
    observed = [row for row in observations(case) if row.get('batch') == packet['batch'] and row.get('category') == 'input']
    assert len(observed) == 1, 'duplicate-detector-observation'
    save(out, 'telemetry-protocol.json', {'concurrent': result, 'malformed': malformed, 'afterRestart': code,
        'acceptedObservationCount': len(observed), 'clientAuthenticationProven': False})


async def telemetry_adversarial(browser, out):
    """Known client forgery is evidence of trust limits, never a human pass."""
    case = local('/api/cases', {'kind': 'catalog'})
    other = local('/api/cases', {'kind': 'catalog'})
    page = await browser.get_current_page()
    state = await ready(page, case['url'])
    await asyncio.sleep(.5)
    names = sorted({r['detector'] for r in observations(case) if r.get('category') == 'browser-marker' and r.get('detector_version') == '2.0.0'})
    assert len(names) == 18, 'normal_probe_measurement_incomplete'
    template = {'version': 1, 'page': state['page'], 'events': [], 'dropped': 0,
                'environment': {'version': '2.0.0', 'status': 'measured', 'unavailable': [],
                                'signals': [{'name': name, 'detected': False} for name in names]}}

    async def submit(packet, scope=case['id']):
        payload = json.dumps({**packet, 'batch': str(uuid4())})
        return int(await page.evaluate("() => fetch('/shield/telemetry/" + scope
            + "',{method:'POST',headers:{'Content-Type':'application/json'},body:"
            + json.dumps(payload) + "}).then(r=>r.status)"))

    forged = await submit({**template, 'events': [{'type': 'click', 'trusted': True, 'hidden': False}]})
    assert forged == 202, 'forgery_trust_boundary_changed_requires_review'
    cross_case = await submit(template, other['id'])
    assert cross_case == 400, 'cross_case_page_accepted'
    malformed = []
    for signals in [template['environment']['signals'][:-1], template['environment']['signals'][:-1] +
                    [template['environment']['signals'][0]], [{'name': 'unknownDetector', 'detected': False}]]:
        status = await submit({**template, 'environment': {**template['environment'], 'signals': signals}})
        malformed.append(status); assert status == 400
    assert await submit({**template, 'dropped': 9}) == 202
    assert await submit({**template, 'environment': {'version': '2.0.0', 'status': 'error', 'signals': [], 'unavailable': []}}) == 202
    rows = observations(case)
    assert any(r.get('category') == 'input-health' and r.get('valid') == 'false' and r.get('outcome') == 'overflow' for r in rows)
    assert any(r.get('category') == 'environment-health' and r.get('valid') == 'false' and r.get('outcome') == 'error' for r in rows)
    health = next(r for r in local('/api/report')['telemetry'] if r['caseId'] == case['id'])
    assert health['environment'] == 'error'
    save(out, 'adversarial-telemetry.json', {'caseId': case['id'], 'forgedCleanSignalsAndTrustedClickStatus': forged,
         'crossCaseStatus': cross_case, 'missingDuplicateUnknownSignalStatuses': malformed,
         'overflowAndErrorRemainInvalid': True, 'reportHealth': health['environment'], 'modelCalls': 0,
         'clientAuthenticationProven': False, 'humanIdentityClaim': False,
         'limitation': 'same-origin client can forge all clean probe values; protocol validity does not authenticate observations'})
    print(json.dumps({'telemetryAdversarialCompleted': True, 'forgedPayloadAccepted': True, 'directory': str(out)}))


async def main():
    out = Path(tempfile.mkdtemp(prefix='online-', dir=BASE / 'reports')).resolve()
    profile = out / 'profile'
    window, browser = ManagedWindow(profile, uuid4()), None
    print(json.dumps({'evidence': str(out)}), flush=True)
    try:
        browser = await window.start(resume=False, allowed_domains=['*.localhost'])
        lease = window._load()
        save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted, 'profile': str(profile),
            'purpose': 'live-local-shield-business', 'modelCalls': 0})
        await (telemetry_adversarial(browser, out) if '--telemetry-adversarial-only' in sys.argv else exercise(browser, out))
    finally:
        closed = await window.close(browser); save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed'
        assert profile.parent == out and out.is_relative_to(BASE / 'reports') and not _profile_process_present(profile)
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__': asyncio.run(main())
