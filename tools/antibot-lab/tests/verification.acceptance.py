"""Actual B-A-T bilingual flow and native protocol; separate from a physical manual baseline."""
import asyncio
import base64
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from uuid import uuid4

ROOT=Path.cwd().resolve();BASE=Path(os.environ.get('BAT_ANTIBOT_DATA',ROOT/'work/antibot-service')).resolve()
sys.path.insert(0,str(ROOT/'apps/api/python'))
from browser_use_runner.managed_window import ManagedWindow,_profile_process_present
from workflow_use.hybrid.capability import OrdinaryCapability

def save(out,name,value): (out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
async def read_report(page,predicate):
    last=None
    for _ in range(280):
        try:
            raw=await page.evaluate('() => globalThis.__batCheckReport || null')
            value=(json.loads(raw) if isinstance(raw,str) else raw) if raw else None
            last=value
            if value and predicate(value): return value
        except Exception: pass
        await asyncio.sleep(.25)
    raise AssertionError('server_verification_timeout:'+json.dumps({'runId':last.get('runId'), 'phase':last.get('phase'), 'health':last.get('health'), 'verification':last.get('verification')} if last else {'report':None}))

async def bilingual(cap,page,out):
    await cap.execute_checked('input',{'text':'Today feels like a good day.'},{'strategy':'css','value':'#sample-english'},[])
    await cap.execute_checked('input',{'text':'今天适合出去走走。'},{'strategy':'css','value':'#sample-text'},[])
    await cap.execute_checked('scroll',{'down':True,'pages':.5},{'strategy':'css','value':'#reading'},[])
    for _ in range(80):
        ready=json.loads(await page.evaluate('() => ({ready:!document.querySelector("#submit").disabled,reason:document.querySelector("#submit-help").textContent,input:document.querySelector("#keyboard-feedback").textContent,scroll:document.querySelector("#reading").scrollTop,english:document.querySelector("#sample-english").value.length,chinese:document.querySelector("#sample-text").value.length,counts:globalThis.__batCheckReport.counts})'))
        if ready['ready']:break
        await asyncio.sleep(.25)
    save(out,'submit-ready.json',ready)
    assert ready['ready'],'bilingual_submit_not_ready'
    await cap.execute_checked('click',{}, {'strategy':'css','value':'#submit'},[])
    return await read_report(page,lambda r:r['scope']=='automatic+interactive' and r['phase']=='complete')

async def main():
    if os.environ.get('BAT_RUN_OWNED_CHECK')!='1': raise ValueError('owned_website_gate_required')
    out=Path(tempfile.mkdtemp(prefix='verified-flow-',dir=BASE/'reports')).resolve();profile=out/'profile'
    os.environ['BAT_ACCESS_STATE_DIR']=str(out/'access-state')
    window,browser,cap=ManagedWindow(profile,uuid4()),None,None
    print(json.dumps({'evidence':str(out)}),flush=True)
    try:
        browser=await window.start(resume=False,allowed_domains=['localhost','*.localhost']);cap=OrdinaryCapability(browser)
        lease=window._load();save(out,'owner.json',dict(pid=lease.browserPid,profile=str(profile),started=lease.browserStarted,humanBaseline=False,modelCalls=0))
        page=await browser.get_current_page();session=await browser.get_or_create_cdp_session();tls=[]
        def response(event,*args):
            value=event.get('response',{})
            if event.get('type')=='Document' and '/measurement/check' in value.get('url',''):
                tls.append({'url':value['url'],'securityState':value.get('securityState'),'status':value.get('status')})
        session.cdp_client.register.Network.responseReceived(response)
        await session.cdp_client.send.Network.enable(session_id=session.session_id)
        await session.cdp_client.send.Page.bringToFront(session_id=session.session_id)
        await cap.execute_checked('navigate',{'url':'https://localhost:4185/measurement/check?mode=interactive'},None,[])
        page=await browser.get_current_page()
        # WHY：可见验收沿产品原导航，不能用后台 Page.goto 代替；失败只记录，不恢复窗口或改写属性。
        geometry=json.loads(await page.evaluate('() => ({outerWidth,outerHeight,hidden:document.hidden,focus:document.hasFocus()})'))
        save(out,'window-geometry.json',geometry)
        assert not geometry['hidden'] and geometry['outerWidth']>0 and geometry['outerHeight']>0,'owned_visible_window_not_ready'
        initial=await read_report(page,lambda r:r['verification']['status']=='accepted' and r['health']['environment']=='measured')
        save(out,'automatic.json',initial)
        save(out,'browser-tls.json',tls)
        assert tls and all(item['securityState']=='secure' for item in tls),'Chrome_certificate_not_secure'
        result=await bilingual(cap,page,out)
        save(out,'bilingual-report.json',result)
        assert result['verdict']=='human',{'verdict':result['verdict'],'evidence':result['evidence']}
        assert result['verification']['challengeAccepted'] and result['verification']['protectedRequestAccepted']
        assert result['flow']['englishInputs']>0 and result['flow']['chineseInputs']>0
        values=json.loads(await page.evaluate('() => ({english:document.querySelector("#sample-english").value==="Today feels like a good day.",chinese:document.querySelector("#sample-text").value==="今天适合出去走走。",sameJson:JSON.stringify(globalThis.__batCheckReport)===JSON.stringify(JSON.parse(document.querySelector("#shield-report").textContent))})'))
        assert values['english'] and values['chinese'] and values['sameJson'];save(out,'input-match.json',dict(english=True,chinese=True,domJsonMatches=True,rawTextStored=False))
        api=json.loads(await page.evaluate('() => (async()=>await (await fetch("/measurement/check/report/"+globalThis.__batCheckReport.runId+"?mode=interactive")).json())()'))
        assert api['verdict']==result['verdict'] and api['verification']==result['verification'];save(out,'api-report.json',api)
        session=await browser.get_or_create_cdp_session()
        await page.evaluate('() => scrollTo(0,0)')
        image=await session.cdp_client.send.Page.captureScreenshot(params={'format':'png'},session_id=session.session_id)
        (out/'result.png').write_bytes(base64.b64decode(image['data']))
        save(out,'result.json',dict(passed=True,controller='B-A-T ManagedWindow + OrdinaryCapability',english=True,chinese=True,
            nativeWindowsIme=False,modelCalls=0,runId=result['runId'],verdict=result['verdict'],verification=result['verification']))
        print(json.dumps({'passed':True,'verdict':result['verdict'],'evidence':str(out)}),flush=True)
    except Exception as error:
        if browser:
            try:
                page=await browser.get_current_page()
                geometry=json.loads(await page.evaluate('() => ({outerWidth,outerHeight,innerWidth,innerHeight,hidden:document.hidden,focused:document.activeElement?.id})'))
                save(out,'failure-window-geometry.json',geometry)
            except Exception:pass
        save(out,'failure.json',dict(type=type(error).__name__,error=str(error)[:300]));raise
    finally:
        if cap: await cap.close()
        closed=await window.close(browser);save(out,'closed.json',closed)
        assert closed['status']=='confirmed' and not _profile_process_present(profile)
        assert profile.resolve().parent==out and out.parent==(BASE/'reports').resolve()
        assert not any(p.is_symlink() or p.is_junction() for p in [profile,*profile.rglob('*')])
        if profile.exists():shutil.rmtree(profile)
        save(out,'profile-deleted.json',dict(permanentlyDeleted=not profile.exists()))

if __name__=='__main__':asyncio.run(main())
