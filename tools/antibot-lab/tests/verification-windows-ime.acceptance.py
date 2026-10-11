"""B-A-T owned browser + actual Windows pinyin; no physical-human or timing-spoof claim."""
import asyncio
import ctypes
from ctypes import wintypes
import importlib.util
import json
import os
from pathlib import Path
import sys

ROOT=Path.cwd().resolve()
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tools/antibot-lab/tests'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
v=load('verified','verification.acceptance.py')
from browser_use_runner.managed_window import _owner_process

def native_api():
    user=ctypes.WinDLL('user32',use_last_error=True);imm=ctypes.WinDLL('imm32',use_last_error=True)
    user.GetForegroundWindow.restype=wintypes.HWND
    user.GetWindowThreadProcessId.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.DWORD)]
    imm.ImmGetDefaultIMEWnd.argtypes=[wintypes.HWND];imm.ImmGetDefaultIMEWnd.restype=wintypes.HWND
    user.SendMessageW.argtypes=[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]
    user.SendMessageW.restype=ctypes.c_ssize_t
    return user,imm

async def scanned_key(user,hwnd,text,scan=True):
    import win32api
    assert user.GetForegroundWindow()==hwnd,'owned_foreground_required_for_scanned_key'
    value={'{SHIFT}':16,'{ENTER}':13,'{TAB}':9}.get(text)
    if value is None:value=user.VkKeyScanW(ord(text))
    vk=value&255;shift=bool(value&256)
    modifierScan=win32api.MapVirtualKey(16,0) if scan else 0
    keyScan=win32api.MapVirtualKey(vk,0) if scan else 0
    if shift:win32api.keybd_event(16,modifierScan,0,0)
    win32api.keybd_event(vk,keyScan,0,0)
    try:await asyncio.sleep(.08)
    finally:
        assert user.GetForegroundWindow()==hwnd,'owned_foreground_changed_during_hold'
        win32api.keybd_event(vk,keyScan,2,0)
        if shift:win32api.keybd_event(16,modifierScan,2,0)

async def ime_hotkey(user,hwnd):
    import win32api
    assert user.GetForegroundWindow()==hwnd,'owned_foreground_required_for_IME_hotkey'
    keys=[(vk,win32api.MapVirtualKey(vk,0)) for vk in [17,32]]
    for vk,scan in keys:win32api.keybd_event(vk,scan,0,0)
    try:await asyncio.sleep(.08)
    finally:
        assert user.GetForegroundWindow()==hwnd,'owned_foreground_changed_during_IME_hotkey'
        # 真人首错配的释放顺序：先Control，后Space；仅发真实OS按键，不补DOM事件。
        for vk,scan in keys:win32api.keybd_event(vk,scan,2,0);await asyncio.sleep(.002)

async def native_bilingual(page,cap,window,out,delay=.12):
    import win32com.client
    import win32gui,win32process,win32con
    title='SHIELD WINDOWS IME '+str(window.owner_id)
    await page.evaluate('(t)=>{document.title=t}',title)
    shell=win32com.client.Dispatch('WScript.Shell')
    user,imm=native_api();lease=window._load()
    assert _owner_process(lease) is not None,'owner_process_changed'
    # 标题异步更新不应成为 OS 按键归属凭据；原 AppActivate 支持精确 PID。
    activated=shell.AppActivate(lease.browserPid)
    await asyncio.sleep(.3)
    owned=[]
    def owned_window(handle,_):
        if win32process.GetWindowThreadProcessId(handle)[1]==lease.browserPid and win32gui.IsWindowVisible(handle) and win32gui.GetWindowText(handle).startswith(title):owned.append(handle)
    win32gui.EnumWindows(owned_window,None)
    if len(owned)==1:
        win32gui.ShowWindow(owned[0],win32con.SW_RESTORE)
        try:win32gui.SetForegroundWindow(owned[0])
        except win32gui.error:pass
        await asyncio.sleep(.3)
    if '--manual-focus' in sys.argv:
        deadline=asyncio.get_running_loop().time()+600;announced=False
        while asyncio.get_running_loop().time()<deadline:
            actual=wintypes.DWORD();user.GetWindowThreadProcessId(user.GetForegroundWindow(),ctypes.byref(actual))
            if actual.value==lease.browserPid:break
            if not announced:print(json.dumps({'waitingForOwnedForeground':title,'ownerPid':lease.browserPid}),flush=True);announced=True
            await asyncio.sleep(.25)
    hwnd=user.GetForegroundWindow();pid=wintypes.DWORD()
    user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
    v.save(out,'foreground.json',dict(activated=bool(activated),pid=pid.value,ownerPid=lease.browserPid))
    assert pid.value==lease.browserPid,'owned_foreground_required'
    imehwnd=imm.ImmGetDefaultIMEWnd(hwnd);assert imehwnd,'Windows_IME_required'
    control=lambda cmd,value=0:user.SendMessageW(imehwnd,0x283,cmd,value)
    original=control(5),control(1);held={}
    await page.evaluate('''()=>{globalThis.__ownedImeEvents=[];for(const type of ['keydown','keyup','compositionstart','compositionend','blur','focus'])document.addEventListener(type,e=>{if(['sample-english','sample-text'].includes(e.target.id))globalThis.__ownedImeEvents.push({field:e.target.id,type:e.type,at:e.timeStamp,code:e.code??null,keyCode:e.keyCode??null,modifier:['Shift','Control','Alt','Meta','CapsLock'].includes(e.key),composing:e.isComposing??null,trusted:e.isTrusted,repeat:e.repeat??null})},true)}''')
    async def send(text):
        assert user.GetForegroundWindow()==hwnd,'owned_foreground_changed'
        if text=='{CONTROLSPACE}':
            await asyncio.gather(*held.values());held.clear()
            await ime_hotkey(user,hwnd);await asyncio.sleep(delay);return
        if text=='{SHIFT}':
            await asyncio.gather(*held.values());held.clear()
            await scanned_key(user,hwnd,text,'--hardware-codes' in sys.argv);await asyncio.sleep(delay);return
        if '--hardware-codes' in sys.argv:
            rollover='--rollover' in sys.argv and (len(text)==1 and (text.islower() or text==' ') or text=='{ENTER}')
            # 同一物理键不能再次按下而未释放；仅不同键重叠，模拟真实rollover。
            if not rollover:await asyncio.gather(*held.values());held.clear()
            elif text in held:await held[text]
            task=asyncio.create_task(scanned_key(user,hwnd,text))
            if rollover:held[text]=task;await asyncio.sleep(.04);return
            await task
        else:shell.SendKeys(text,0)
        await asyncio.sleep(delay)
    try:
        control(6,1);control(2,original[1]|1)
        assert control(5)==1 and control(1)&1,'Chinese_IME_must_be_open'
        v.save(out,'ime-mode.json',dict(originalOpen=original[0],originalConversion=original[1],
            appliedOpen=control(5),appliedConversion=control(1),source='Windows IMM + Win32 scanned keybd_event' if '--hardware-codes' in sys.argv else 'Windows IMM + WScript.Shell.SendKeys'))
        await cap.execute_checked('click',{}, {'strategy':'css','value':'#sample-english'},[])
        session=await page._browser_session.get_or_create_cdp_session(target_id=page._target_id)
        await session.cdp_client.send.Page.bringToFront(session_id=session.session_id)
        focus=json.loads(await page.evaluate('()=>({documentFocused:document.hasFocus(),active:document.activeElement.id})'))
        v.save(out,'content-focus.json',focus)
        assert focus['documentFocused'] and focus['active']=='sample-english','owned_content_focus_required_before_OS_keys'
        for i,word in enumerate(['Today','feels','like','a','good','day']):
            for char in word:await send(char)
            if i==0 and '--control-space' in sys.argv:await send('{CONTROLSPACE}')
            elif i==0 and '--mixed-mode' in sys.argv:await send('{SHIFT}')
            elif '--control-space' in sys.argv:pass
            elif '--mixed-mode' not in sys.argv:await send('{ENTER}')
            if i<5:await send(' ')
        if '--control-space' in sys.argv:await send('{CONTROLSPACE}')
        elif '--mixed-mode' in sys.argv:await send('{SHIFT}')
        await send('.') # 中文输入法保持开启；统一保留它实际提交的中文句号，不替换DOM文本。
        await send('{TAB}')
        assert await page.evaluate('()=>document.activeElement.id')=='sample-text','native_Tab_field_transition_required'
        for word in ['jintian','shihe','chuqu','zouzou']:
            for char in word:await send(char)
            await send(' ')
        await send('.')
        values=json.loads(await page.evaluate('() => ({english:document.querySelector("#sample-english").value==="Today feels like a good day。",chinese:document.querySelector("#sample-text").value==="今天适合出去走走。",englishLength:document.querySelector("#sample-english").value.length,chineseLength:document.querySelector("#sample-text").value.length})'))
        v.save(out,'input-match.json',{**values,'rawTextStored':False})
        assert values['english'] and values['chinese'],'same_bilingual_fixture_not_committed'
    finally:
        keyResults=await asyncio.gather(*held.values(),return_exceptions=True)
        v.save(out,'owned-native-events.json',json.loads(await page.evaluate('()=>globalThis.__ownedImeEvents')))
        control(6,original[0]);control(2,original[1]);await asyncio.sleep(.3)
        restored=control(5),control(1)
        v.save(out,'ime-restored.json',dict(open=restored[0],conversion=restored[1],restored=restored==original))
        assert restored==original,'owned_IME_restore_failed'
        assert not any(isinstance(r,Exception) for r in keyResults),'owned_key_release_failed'

async def finish(page,cap,out,expected='human'):
    await cap.execute_checked('scroll',{'down':True,'pages':.5},{'strategy':'css','value':'#reading'},[])
    for _ in range(80):
        ready=json.loads(await page.evaluate('()=>({ready:!document.querySelector("#submit").disabled})'))
        if ready['ready']:break
        await asyncio.sleep(.25)
    assert ready['ready'],'submit_not_ready'
    if expected=='human':await cap.execute_checked('click',{}, {'strategy':'css','value':'#submit'},[])
    else:await page.evaluate('()=>{const b=document.querySelector("#submit");b.form.requestSubmit(b)}')
    report=await v.read_report(page,lambda r:r['scope']=='automatic+interactive' and r.get('flow',{}).get('submitted') and r['phase'] in ['complete','failed'])
    v.save(out,'bilingual-report.json',report)
    assert report['verdict']==expected,{'verdict':report['verdict'],'evidence':report['evidence']}
    assert report['verification']['challengeAccepted'] and report['verification']['protectedRequestAccepted']
    assert len(report['timing'])==2,'separate_field_samples_required'
    for sample in report['timing']:
        assert sample['context']['imePairs']>0 and sample['keyCount']>=10,'actual_IME_and_ten_real_key_pairs_required_per_field'
        assert sample['keyCount']==len(sample['starts'])==len(sample['dwellTimes'])
        assert not sample['pending'] and not sample['excluded']
        if expected=='human':assert not sample['invalid']
    for detector in ['keystroke-interval','keystroke-entropy','typing-cadence']:
        row=next(r for r in report['signals'] if r['id']==detector)
        if expected=='unknown' and detector=='typing-cadence':assert row['status']=='failed' and not row['valid']
        else:assert row['valid'] and row['status'] in ['clear','flagged'],'each_metric_must_be_measured'
    assert report['counts']['failed']==(1 if expected=='unknown' else 0) and not report['counts']['excluded']
    assert all(not report['input']['byType'].get(t,{}).get('untrusted',0) for t in ['input','change','click','keydown','keyup'])
    exported=json.loads(await page.evaluate('()=>document.querySelector("#shield-report").textContent'))
    assert exported==report,'same_page_JSON_mismatch'
    api=json.loads(await page.evaluate('()=> (async()=>await (await fetch("/measurement/check/report/"+globalThis.__batCheckReport.runId+"?mode=interactive")).json())()'))
    v.save(out,'api-report.json',api)
    assert api['timing']==report['timing'] and api['verdict']==report['verdict']
    return report

async def native_mismatch(page,browser,out):
    # 正常输入尚未提交时发送受控错配；提交后输入区隐藏，不能在那里伪称已测原生错误。
    session=await browser.get_or_create_cdp_session(target_id=page._target_id)
    active=await page.evaluate('()=>document.activeElement.id')
    v.save(out,'reverse-target.json',dict(pageTarget=page._target_id,sessionTarget=session.target_id,active=active))
    assert active=='sample-text' and session.target_id==page._target_id,'reverse_control_target_required'
    await page.evaluate('()=>{globalThis.__reverseKeyups=[];document.addEventListener("keyup",e=>globalThis.__reverseKeyups.push({target:e.target.id,code:e.code,trusted:e.isTrusted}),true)}')
    await session.cdp_client.send.Input.dispatchKeyEvent(params={'type':'keyUp','key':'b','code':'KeyB','windowsVirtualKeyCode':66},session_id=session.session_id)
    v.save(out,'reverse-event-target.json',json.loads(await page.evaluate('()=>globalThis.__reverseKeyups')))
    invalid=await v.read_report(page,lambda r:any(t.get('context',{}).get('fault',{}).get('trace') for t in r.get('timing',[])))
    v.save(out,'unmatched-native-release.json',invalid)
    assert not invalid['health']['transportFailed'] and invalid['verdict']=='unknown'
    assert next(r for r in invalid['signals'] if r['id']=='typing-cadence')['status']=='failed'

async def main():
    assert os.environ.get('BAT_RUN_OWNED_CHECK')=='1','owned_website_gate_required'
    out=Path(v.tempfile.mkdtemp(prefix='windows-ime-flow-',dir=v.BASE/'reports')).resolve();profile=out/'profile'
    os.environ['BAT_ACCESS_STATE_DIR']=str(out/'access-state')
    window=v.ManagedWindow(profile,v.uuid4());browser=cap=None
    print(json.dumps({'evidence':str(out)}),flush=True)
    try:
        browser=await window.start(resume=False,allowed_domains=['localhost','*.localhost']);cap=v.OrdinaryCapability(browser)
        lease=window._load();v.save(out,'owner.json',dict(pid=lease.browserPid,started=lease.browserStarted,profile=str(profile),modelCalls=0,humanBaseline=False))
        session=await browser.get_or_create_cdp_session();tls=[]
        def response(event,*args):
            value=event.get('response',{})
            if event.get('type')=='Document' and '/measurement/check' in value.get('url',''):
                tls.append(dict(url=value['url'],securityState=value.get('securityState')))
        session.cdp_client.register.Network.responseReceived(response)
        await session.cdp_client.send.Network.enable(session_id=session.session_id)
        await session.cdp_client.send.Page.bringToFront(session_id=session.session_id)
        await cap.execute_checked('navigate',{'url':'https://localhost:4185/measurement/check?mode=interactive'},None,[])
        page=await browser.get_current_page()
        initial=await v.read_report(page,lambda r:r['verification']['status']=='accepted' and r['health']['environment']=='measured')
        v.save(out,'automatic.json',initial);v.save(out,'browser-tls.json',tls)
        assert tls and all(t['securityState']=='secure' for t in tls),'Chrome_default_TLS_validation_required'
        await native_bilingual(page,cap,window,out)
        adverse='--adverse' in sys.argv
        if adverse:await native_mismatch(page,browser,out)
        report=await finish(page,cap,out,'unknown' if adverse else 'human')
        session=await browser.get_or_create_cdp_session();await page.evaluate('()=>scrollTo(0,0)')
        shot=await session.cdp_client.send.Page.captureScreenshot(params={'format':'png'},session_id=session.session_id)
        (out/'result.png').write_bytes(v.base64.b64decode(shot['data']))
        source_control=adverse or '--source-control' in sys.argv
        if source_control:
            await page.evaluate('()=>document.querySelector("#sample-text").dispatchEvent(new Event("input",{bubbles:true}))')
            positive=await v.read_report(page,lambda r:r['verdict']=='bot')
            v.save(out,'script-input-positive.json',positive)
            assert 'input:trusted' in positive['evidence'],'script_source_positive_must_survive_IME'
        v.save(out,'result.json',dict(passed=True,runId=report['runId'],verdict=report['verdict'],counts=report['counts'],
            controller='B-A-T ManagedWindow + OrdinaryCapability; original public IME fixture',modelCalls=0,physicalHuman=False,
            nativeImeMethod='Windows OS IME',
            keyboardMethod='Win32 scanned keybd_event' if '--hardware-codes' in sys.argv else 'WScript.Shell.SendKeys',
            rolloverControl='--rollover' in sys.argv,
            mixedImeAndOrdinaryKeyboard='--mixed-mode' in sys.argv,
            controlSpaceImeSwitch='--control-space' in sys.argv,
            scriptSourceControl=source_control,
            nativeMismatchControl=adverse,
            submitMethod='HTMLFormElement.requestSubmit controlled negative' if adverse else 'B-A-T OrdinaryCapability click',
            sameBilingualFixture=True,bothFieldsActualWindowsIme=True,numericTimingsMeasured=True,domJsonMatches=True,apiMatches=True))
        print(json.dumps({'passed':True,'verdict':report['verdict'],'counts':report['counts'],'evidence':str(out)}),flush=True)
    except Exception as error:
        v.save(out,'failure.json',dict(type=type(error).__name__,error=str(error)[:350]))
        if browser:
            try:v.save(out,'failure-report.json',json.loads(await (await browser.get_current_page()).evaluate('()=>globalThis.__batCheckReport')))
            except Exception:pass
        raise
    finally:
        if cap:await cap.close()
        closed=await window.close(browser);v.save(out,'closed.json',closed)
        assert closed['status']=='confirmed' and not v._profile_process_present(profile)
        assert profile.resolve().parent==out and out.parent==(v.BASE/'reports').resolve()
        assert not any(p.is_symlink() or p.is_junction() for p in [profile,*profile.rglob('*')])
        if profile.exists():v.shutil.rmtree(profile)
        v.save(out,'profile-deleted.json',dict(permanentlyDeleted=not profile.exists()))

if __name__=='__main__':asyncio.run(main())
