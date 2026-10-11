"""Visitor website: real receipts, native B-A-T input, positive and failed probes; owned Chrome only."""
import asyncio
import base64
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from uuid import uuid4

ROOT = Path.cwd().resolve(); BASE = Path(os.environ.get('BAT_ANTIBOT_DATA', ROOT/'work/antibot-service')).resolve(); URL = 'https://localhost:4185/measurement/check'
sys.path.insert(0, str(ROOT/'apps/api/python')); sys.path.insert(0, str(ROOT/'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present
from workflow_use.hybrid.capability import OrdinaryCapability


async def report(page, predicate):
    for _ in range(120):
        value = json.loads(await page.evaluate('() => globalThis.__batCheckReport || null'))
        if value and predicate(value): return value
        await asyncio.sleep(.25)
    raise AssertionError('visitor_report_timeout')


async def screenshot(session, out, name, width, height):
    await session.cdp_client.send.Emulation.setDeviceMetricsOverride(params={
        'width':width,'height':height,'deviceScaleFactor':1,'mobile':False},session_id=session.session_id)
    await asyncio.sleep(.2)
    image = await session.cdp_client.send.Page.captureScreenshot(params={'format':'png'},session_id=session.session_id)
    (out/name).write_bytes(base64.b64decode(image['data']))


async def responsive(page, session, out):
    await page.evaluate('() => {scrollTo(0,0)}')
    await screenshot(session,out,'mobile.png',390,844)
    size = json.loads(await page.evaluate('() => ({viewport:innerWidth,content:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})'))
    save(out,'responsive.json',size)
    # classic scrollbar占15px；不把content小于viewport的正常布局误报为横向溢出。
    assert size['content'] <= size['viewport'], 'mobile_horizontal_overflow'


async def normal(browser, page, session, out):
    await page.goto(URL)
    current = await report(page, lambda r: len([s for s in r['signals'] if not s['key'].startswith('input') and s.get('valid')]) == 34)
    save(out,'automatic.json',current)
    assert current['counts']['flagged'] == 0, 'normal_automatic_false_positive'
    assert current['verdict'] == 'human'
    assert json.loads(await page.evaluate("() => document.querySelector('#shield-report').textContent")) == current
    assert json.loads(await page.evaluate("() => document.querySelectorAll('#report-rows tr[data-signal]').length")) == 39
    await screenshot(session,out,'desktop.png',1440,1020)
    capability = OrdinaryCapability(browser)
    try:
        await capability.execute_checked('click',{}, {'strategy':'css','value':'#next-action'},[])
        await capability.execute_checked('input',{'text':'Today feels like a good day.'},{'strategy':'css','value':'#sample-text'},[])
        await capability.execute_checked('scroll',{'down':True,'pages':.5},{'strategy':'css','value':'#reading'},[])
        await capability.execute_checked('click',{}, {'strategy':'css','value':'#submit'},[])
        current = await report(page, lambda r: r['scope'] == 'automatic+interactive' and r['phase'] == 'complete')
        assert current['runId'] == json.loads((out/'automatic.json').read_text())['runId']
        current = await report(page, lambda r: r['input']['events'] > 10)
        save(out,'native-input.json',current)
        assert current['input']['untrusted'] == 0
        current = await report(page, lambda r: any(s['key'] == 'input-behavior:typing-cadence' and s.get('valid') for s in r['signals']))
        save(out,'native-cadence.json',current)
        assert not any(s['status'] == 'flagged' for s in current['signals'] if not s['key'].startswith('input-behavior'))
        await asyncio.sleep(2)
        await responsive(page,session,out)
    finally: await capability.close()


async def cadence_controls(page, out):
    cadence = dict(keyCount=10, intervals=[120,180,210,140,260,160,190,220,170],
                   dwellTimes=[70]*10, pending=0, invalid=False, excluded=False)
    cases = [('clear',cadence), ('detected',{**cadence,'intervals':[5]*9,'dwellTimes':[5]*10}),
             ('unavailable',{**cadence,'keyCount':2,'intervals':[120],'dwellTimes':[70]*2}),
             ('excluded',{**cadence,'excluded':True}), ('incomplete',{**cadence,'pending':1}),
             ('invalid',{**cadence,'invalid':True})]
    results = []
    for expected, data in cases:
        await page.goto(URL)
        await report(page,lambda r: r['health']['environment'] == 'measured')
        # 通过真实同源遥测接口消费原判据，再使用collector原回执事件；不是伪造判定。
        script = '''(data) => (async () => {
          const collector=document.querySelector('script[data-case]');
          const payload={version:1,page:collector.dataset.page,batch:crypto.randomUUID(),events:[],dropped:0,
            behavior:{keys:[],scroll:{count:0,maxDelta:0,wheelCount:0,scrollKey:false,maxTouchPoints:0},cadence:data}};
          const response=await fetch(collector.dataset.endpoint,{method:'POST',credentials:'same-origin',
            headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
          if (!response.ok) throw Error('cadence_receipt_'+response.status);
          const receipt=await response.json(); document.dispatchEvent(new CustomEvent('bat:measurement',{detail:receipt}));
          return receipt;
        })()'''
        receipt = json.loads(await page.evaluate(script,data))
        signal = next(s for s in receipt['report']['signals'] if s['detector'] == 'typing-cadence')
        assert signal['outcome'] == expected, signal
        current = await report(page, lambda r: any(s['key'] == 'input-behavior:typing-cadence' and s.get('outcome') == expected for s in r['signals']))
        row = next(s for s in current['signals'] if s['key'] == 'input-behavior:typing-cadence')
        assert row['valid'] == (expected in ('clear','detected'))
        if expected == 'detected':
            await page.evaluate(script,cadence)
            retained = json.loads(await page.evaluate('() => globalThis.__batCheckReport'))
            assert next(s for s in retained['signals'] if s['key'] == row['key'])['outcome'] == 'detected'
        label = await page.evaluate("() => document.querySelector('[data-signal=\"input-behavior:typing-cadence\"] .signal-state').textContent")
        results.append(dict(expected=expected,receipt=signal,exported=row,label=label))
    source = BASE/'upstream/fcaptcha-inputforensics-56aa2b38.cjs'
    original = source.read_bytes()
    try:
        source.write_bytes(original+b'\n// owned corruption control')
        await page.goto(URL)
        await report(page,lambda r: r['health']['environment'] == 'measured')
        receipt = json.loads(await page.evaluate(script,cadence))
        current = await report(page,lambda r: any(s['key'] == 'input-behavior:typing-cadence' and s.get('outcome') == 'error' for s in r['signals']))
        row = next(s for s in current['signals'] if s['key'] == 'input-behavior:typing-cadence')
        assert not row['valid'] and row['status'] == 'failed'
        results.append(dict(expected='error',exported=row))
    finally: source.write_bytes(original)
    save(out,'cadence-controls.json',results)


async def abnormal(page, session, out):
    hook = await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(params={
        'source':"Object.defineProperty(navigator,'webdriver',{get:()=>true,configurable:true});"},session_id=session.session_id)
    try:
        await page.goto(URL)
        current = await report(page,lambda r: any(s['key'] == 'browser-marker:detectWebDriver' and s['status'] == 'flagged' for s in r['signals']))
        save(out,'webdriver-positive.json',current)
        await page.evaluate("() => document.querySelector('#sample-text').dispatchEvent(new Event('input',{bubbles:true}))")
        current = await report(page,lambda r: r['input']['untrusted'] > 0)
        save(out,'scripted-positive.json',current)
        assert current['status'] == 'detected'
        assert current['verdict'] == 'bot'
        await screenshot(session,out,'positive.png',1440,1020)
        case = await page.evaluate("() => document.querySelector('script[data-case]').dataset.case")
        observations = [json.loads(line) for line in (BASE/'logs/observations.jsonl').read_text().splitlines()]
        own = [row for row in observations if row.get('site') == case]
        assert any(r.get('detector') == 'detectWebDriver' and r.get('outcome') == 'detected' for r in own)
        assert any(r.get('category') == 'input' and r.get('trusted') == 'false' for r in own)
        save(out,'original-channel.json',{'case':case,'webdriverPositive':True,'scriptedInputPositive':True,
            'originalCrowdSecObservationChannel':True,'publicRawFingerprint':False})
    finally:
        await session.cdp_client.send.Page.removeScriptToEvaluateOnNewDocument(params={'identifier':hook['identifier']},session_id=session.session_id)


async def unavailable(page, session, out):
    await session.cdp_client.send.Network.enable(session_id=session.session_id)
    for asset, expected in [('probe/botd.js','probe-error'),('check/collector.js','collector-error')]:
        try:
            await session.cdp_client.send.Network.setBlockedURLs(params={'urls':['*'+asset]},session_id=session.session_id)
            await page.goto(URL)
            current = await report(page,lambda r: r['health']['environment'] == 'error' if expected == 'probe-error' else r['health']['transportFailed'])
            save(out,expected+'.json',current)
            assert current['status'] == 'unavailable'
            botd = [s for s in current['signals'] if s['key'].startswith('browser-marker:detect')]
            assert all(s['status'] in ('unavailable','failed') for s in botd), 'failed_probe_became_clear'
            assert current['verdict'] == 'unknown'
            if expected == 'collector-error': await screenshot(session,out,'unavailable.png',1440,1020)
        finally:
            await session.cdp_client.send.Network.setBlockedURLs(params={'urls':[]},session_id=session.session_id)


async def main():
    if os.environ.get('BAT_RUN_OWNED_CHECK') != '1': raise ValueError('owned_website_gate_required')
    out = Path(tempfile.mkdtemp(prefix='check-site-',dir=BASE/'reports')).resolve(); profile = out/'profile'
    os.environ['BAT_ACCESS_STATE_DIR'] = str(out/'access-state')
    window, browser = ManagedWindow(profile,uuid4()), None
    print(json.dumps({'evidence':str(out)}),flush=True)
    try:
        browser = await window.start(resume=False,allowed_domains=['localhost'])
        lease = window._load(); save(out,'owner.json',{'pid':lease.browserPid,'started':lease.browserStarted,
            'profile':str(profile),'humanBaseline':False,'modelCalls':0,'tlsTrust':'Windows-root-default-validation'})
        page = await browser.get_current_page(); session = await browser.get_or_create_cdp_session()
        if '--responsive-only' in sys.argv:
            await page.goto(URL)
            await responsive(page,session,out)
            return
        controls_only = '--controls-only' in sys.argv
        failures_only = '--failures-only' in sys.argv
        partial = controls_only or failures_only
        if not partial: await normal(browser,page,session,out)
        if not failures_only: await cadence_controls(page,out)
        await abnormal(page,session,out)
        await unavailable(page,session,out)
        save(out,'result.json',{'normal':not partial,'nativeInput':not partial,'cadenceControls':not failures_only,
            'webdriverPositive':True,'scriptedInputPositive':True,'probeFailure':True,'collectorFailure':True,
            'responsiveTested':not partial,'modelCalls':0,'fullShieldAdmission':False})
        print(json.dumps({'passed':True,'evidence':str(out)}),flush=True)
    except Exception as error:
        save(out,'failure.json',{'type':type(error).__name__,'error':str(error)[:200]}); raise
    finally:
        closed = await window.close(browser); save(out,'closed.json',closed)
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        assert profile.resolve().parent == out and out.parent == (BASE/'reports').resolve()
        assert not any(p.is_symlink() or p.is_junction() for p in [profile,*profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out,'profile-deleted.json',{'permanentlyDeleted':not profile.exists()})


if __name__ == '__main__': asyncio.run(main())
