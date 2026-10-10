"""Visitor website: real receipts, native B-A-T input, positive and failed probes; owned Chrome only."""
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch
from uuid import uuid4
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = Path.cwd().resolve(); BASE = ROOT/'work/antibot-service'; URL = 'https://localhost:4185/measurement/check'
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


async def normal(browser, page, session, out):
    await page.goto(URL)
    current = await report(page, lambda r: len([s for s in r['signals'] if not s['key'].startswith('input') and s.get('valid')]) == 34)
    save(out,'automatic.json',current)
    assert current['counts']['flagged'] == 0, 'normal_automatic_false_positive'
    await screenshot(session,out,'desktop.png',1440,1020)
    capability = OrdinaryCapability(browser)
    try:
        await capability.execute_checked('input',{'text':'Today feels like a good day.'},{'strategy':'css','value':'#sample-text'},[])
        await capability.execute_checked('click',{}, {'strategy':'css','value':'#interaction-form button'},[])
        current = await report(page, lambda r: r['input']['events'] > 10)
        save(out,'native-input.json',current)
        assert current['input']['untrusted'] == 0
        assert not any(s['status'] == 'detected' for s in current['signals'] if not s['key'].startswith('input-behavior'))
        await asyncio.sleep(2)
        await page.evaluate('() => {scrollTo(0,0)}')
        await screenshot(session,out,'mobile.png',390,844)
        size = json.loads(await page.evaluate('() => ({viewport:innerWidth,content:document.documentElement.scrollWidth})'))
        assert size['content'] == size['viewport'], 'mobile_horizontal_overflow'
        save(out,'responsive.json',size)
    finally: await capability.close()


async def abnormal(page, session, out):
    hook = await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(params={
        'source':"Object.defineProperty(navigator,'webdriver',{get:()=>true,configurable:true});"},session_id=session.session_id)
    try:
        await page.goto(URL)
        current = await report(page,lambda r: any(s['key'] == 'browser-marker:detectWebDriver' and s['status'] == 'detected' for s in r['signals']))
        save(out,'webdriver-positive.json',current)
        await page.evaluate("() => document.querySelector('#sample-text').dispatchEvent(new Event('input',{bubbles:true}))")
        current = await report(page,lambda r: r['input']['untrusted'] > 0)
        save(out,'scripted-positive.json',current)
        assert current['status'] == 'detected'
        await screenshot(session,out,'positive.png',1440,1020)
        case = json.loads(await page.evaluate("() => document.querySelector('script[data-case]').dataset.case"))
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
            assert all(s['status'] == 'unavailable' for s in botd), 'failed_probe_became_clear'
            if expected == 'collector-error': await screenshot(session,out,'unavailable.png',1440,1020)
        finally:
            await session.cdp_client.send.Network.setBlockedURLs(params={'urls':[]},session_id=session.session_id)


async def main():
    if os.environ.get('BAT_RUN_OWNED_CHECK') != '1': raise ValueError('owned_website_gate_required')
    out = Path(tempfile.mkdtemp(prefix='check-site-',dir=BASE/'reports')).resolve(); profile = out/'profile'
    os.environ['BAT_ACCESS_STATE_DIR'] = str(out/'access-state')
    window, browser = ManagedWindow(profile,uuid4()), None
    certificate = x509.load_pem_x509_certificate((BASE/'tls/cert.pem').read_bytes())
    pin = base64.b64encode(hashlib.sha256(certificate.public_key().public_bytes(Encoding.DER,PublicFormat.SubjectPublicKeyInfo)).digest()).decode()
    original = subprocess.Popen
    def launch(args, **kwargs):
        if '--user-data-dir='+str(profile) in args: args = [*args,'--ignore-certificate-errors-spki-list='+pin]
        return original(args,**kwargs)
    print(json.dumps({'evidence':str(out)}),flush=True)
    try:
        with patch('browser_use_runner.managed_window.subprocess.Popen',side_effect=launch):
            browser = await window.start(resume=False,allowed_domains=['localhost'])
        lease = window._load(); save(out,'owner.json',{'pid':lease.browserPid,'started':lease.browserStarted,
            'profile':str(profile),'humanBaseline':False,'modelCalls':0,'tlsTrust':'owned-SPKI-only'})
        page = await browser.get_current_page(); session = await browser.get_or_create_cdp_session()
        await normal(browser,page,session,out)
        await abnormal(page,session,out)
        await unavailable(page,session,out)
        save(out,'result.json',{'normal':True,'nativeInput':True,'webdriverPositive':True,'scriptedInputPositive':True,
            'probeFailure':True,'collectorFailure':True,'mobileOverflow':False,'modelCalls':0,'fullShieldAdmission':False})
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
