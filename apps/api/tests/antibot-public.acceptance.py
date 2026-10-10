"""One native B-A-T visit to a public diagnostic; no raw fingerprints are persisted."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from uuid import uuid4

ROOT = Path.cwd().resolve(); PARENT = ROOT/'work/antibot-service/reports'
sys.path.insert(0, str(ROOT/'apps/api/python')); sys.path.insert(0, str(ROOT/'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present
from workflow_use.hybrid.capability import OrdinaryCapability

SNAPSHOT = r"""() => {
  const allowed=new Set(['User Agent (Old)','WebDriver (New)','WebDriver Advanced','Chrome (New)',
    'Permissions (New)','Plugins Length (Old)','Plugins is of type PluginArray','Languages (Old)',
    'WebGL Vendor','WebGL Renderer','Broken Image Dimensions']);
  const rows=[...document.querySelectorAll('table tr')].flatMap(row=>{
    const cells=[...row.querySelectorAll('td')];if(cells.length<2)return [];
    const name=cells[0].innerText.replace(/\s+/g,' ').trim();if(!allowed.has(name) && !/^[A-Z][A-Z0-9_]{2,40}$/.test(name))return [];
    const value=cells[1],text=value.innerText.trim();
    return [{name,classes:[...value.classList].filter(c=>['passed','failed','warn','warning','ok'].includes(c)),
      verdict:/^(ok|passed)$/i.test(text)?'passed':/^(fail|failed)$/i.test(text)?'failed':
        /\(passed\)/i.test(text)?'passed':/\(failed\)/i.test(text)?'failed':null}];
  });
  return {origin:location.origin,path:location.pathname,rows,
    challenge:/just a moment|请稍候|verification required/i.test(document.title),
    rawFingerprintPersisted:false};
}"""

DEVICE_SNAPSHOT = r"""() => {
  const known = new Set(['isBot','suspiciousClientSideBehavior','superHumanSpeed','hasCDPMouseLeak',
    'hasBotUserAgent','hasWebdriverTrue','hasWebdriverInFrameTrue','isPlaywright','hasInconsistentChromeObject',
    'isPhantom','isNightmare','isSequentum','isSeleniumChromeDefault','isHeadlessChrome','isWebGLInconsistent',
    'hasInconsistentWebGLShaderLang','hasInconsistentTimingResolution','isAutomatedWithCDP',
    'isAutomatedWithCDPInWebWorker','hasInconsistentClientHints','hasInconsistentGPUFeatures',
    'isIframeOverridden','hasInconsistentWorkerValues','hasHighHardwareConcurrency',
    'hasHeadlessChromeDefaultScreenResolution','hasSuspiciousWeakSignals']);
  const signals={};let parsed=false;
  const collect=(value,depth=0)=>{if(!value||typeof value!=='object'||depth>4)return;
    for(const [key,item] of Object.entries(value)){if(known.has(key)&&typeof item==='boolean')signals[key]=item;
      else if(typeof item==='object')collect(item,depth+1);}};
  try{collect(JSON.parse(document.querySelector('#jsonResult')?.textContent||''));parsed=true;}catch{}
  return {parsed,signals,rawFingerprintPersisted:false};
}"""

async def device_check(browser, out):
    capability = OrdinaryCapability(browser)
    results = []
    try:
        for interactions in ([True] if '--interactions-only' in sys.argv else [False, True]):
            url = 'https://deviceandbrowserinfo.com/are_you_a_bot' + ('_interactions' if interactions else '')
            await capability.execute_checked('navigate', {'url': url, 'new_tab': False}, None, [])
            if '--manual' in sys.argv:
                save(out,'human-ready.json',{'url':url,'controllerConnected':True,'automatedInput':False})
                print('HUMAN_READY '+str(out),flush=True)
                for _ in range(600):
                    if (out/'human-done.json').exists(): break
                    await asyncio.sleep(1)
                else: raise TimeoutError('human_control_not_confirmed')
            elif interactions:
                for selector, value in [('#email', 'bat-probe@example.invalid'), ('#password', 'Local-Test-123!')]:
                    await capability.execute_checked('input', {'text': value}, {'strategy':'css','value':selector}, [])
                await capability.execute_checked('click', {}, {'strategy':'css','value':'#loginForm button[type="submit"]'}, [])
            page = await browser.get_current_page()
            for _ in range(10):
                await asyncio.sleep(2)
                result = json.loads(await page.evaluate(DEVICE_SNAPSHOT))
                if result['parsed']: break
            results.append({'interactions':interactions,**result})
            save(out,'result.json',results);print(json.dumps(results[-1]),flush=True)
            assert result['parsed'] and result['signals'], 'public_probe_measurement_unavailable'
    finally: await capability.close()

async def main():
    if os.environ.get('BAT_RUN_PUBLIC_DIAGNOSTIC') != '1': raise ValueError('public_diagnostic_gate_required')
    out=Path(tempfile.mkdtemp(prefix='public-probe-',dir=PARENT)).resolve(); profile=out/'profile'
    os.environ['BAT_ACCESS_STATE_DIR']=str(out/'access-state')
    window=ManagedWindow(profile,uuid4());browser=None
    print(json.dumps({'evidence':str(out)}),flush=True)
    device = '--device-check' in sys.argv
    site = 'https://deviceandbrowserinfo.com/are_you_a_bot' if device else 'https://bot.sannysoft.com/'
    save(out,'precondition.json',{'site':site,
        'purpose':'one-public-diagnostic-native-BAT-visit','modelCalls':0})
    try:
        browser=await window.start(resume=False,allowed_domains=['deviceandbrowserinfo.com' if device else 'bot.sannysoft.com'])
        lease=window._load();save(out,'owner.json',{'pid':lease.browserPid,'started':lease.browserStarted,'profile':str(profile)})
        if device:
            await device_check(browser,out)
            return
        page=await browser.get_current_page()
        await asyncio.wait_for(page.goto('https://bot.sannysoft.com/'),40)
        await asyncio.sleep(5)
        result=json.loads(await page.evaluate(SNAPSHOT));save(out,'result.json',result)
        print(json.dumps(result),flush=True)
    except Exception as error:
        save(out,'failure.json',{'type':type(error).__name__,'error':str(error)[:160]});raise
    finally:
        closed=await window.close(browser);save(out,'closed.json',closed)
        assert closed['status']=='confirmed' and not _profile_process_present(profile)
        assert profile.resolve().parent==out and out.parent==PARENT.resolve()
        assert not any(p.is_symlink() or p.is_junction() for p in [profile,*profile.rglob('*')])
        if profile.exists():shutil.rmtree(profile)
        save(out,'profile-deleted.json',{'permanentlyDeleted':not profile.exists()})

if __name__=='__main__':asyncio.run(main())
