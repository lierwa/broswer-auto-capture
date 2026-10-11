"""Original headless Chrome, identical bilingual UI; no marker spoofing or certificate exceptions."""
import asyncio,ctypes,importlib.util,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path.cwd();spec=importlib.util.spec_from_file_location('verified',ROOT/'tools/antibot-lab/tests/verification.acceptance.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
async def main():
    assert os.environ.get('BAT_RUN_OWNED_CHECK')=='1','owned_website_gate_required'
    out=Path(a.tempfile.mkdtemp(prefix='verified-reverse-',dir=a.BASE/'reports')).resolve();profile=out/'profile'
    print(json.dumps({'evidence':str(out)}),flush=True)
    # Chromium 原 headless clipboard 与平台剪贴板隔离；只核序号，不读取个人内容。
    user=ctypes.WinDLL('user32');clipboardBefore=user.GetClipboardSequenceNumber()
    async with async_playwright() as api:
        context=None;proofs=[]
        try:
            context=await api.chromium.launch_persistent_context(str(profile),channel='chrome',headless=True)
            page=context.pages[0]
            async def response(response):
                if '/crowdsec-internal/challenge/' in response.url and 'submit' in response.url:
                    try:
                        value=await response.json();proofs.append({'statusCode':response.status,'resultStatus':value.get('status')})
                    except Exception:proofs.append({'statusCode':response.status})
            page.on('response',response)
            await page.goto('https://localhost:4185/measurement/check?mode=interactive')
            await page.wait_for_function('() => globalThis.__batCheckReport?.health.environment==="measured" && globalThis.__batCheckReport.signals.filter(r=>r.group<3).every(r=>r.status!=="pending")')
            await page.locator('#sample-english').press_sequentially('Today feels like a good day.')
            await context.grant_permissions(['clipboard-read','clipboard-write'],origin='https://'+(await page.evaluate('() => location.host')))
            await page.evaluate('() => navigator.clipboard.writeText("今天适合出去走走。")')
            await page.locator('#sample-text').press('Control+V')
            await page.locator('#reading').hover();await page.mouse.wheel(0,100);await page.locator('#submit').click()
            await page.wait_for_function('() => globalThis.__batCheckReport?.flow?.submitted')
            report=await page.evaluate('() => globalThis.__batCheckReport')
            assert report['verdict']=='bot' and 'browser-marker:detectWebDriver' in report['evidence']
            assert report['flow']['englishInputs'] and report['flow']['chineseInputs'] and report['flow']['scrolled']
            assert report['input']['byType']['paste']['events']>0 and report['input']['byType']['paste']['untrusted']==0
            assert next(row for row in report['signals'] if row['id']=='trusted')['status']=='clear'
            assert any(p.get('resultStatus')=='rejected' for p in proofs),'native_rejection_missing'
            a.save(out,'bilingual-report.json',report);a.save(out,'native-rejection.json',proofs)
            await page.screenshot(path=str(out/'result.png'))
            clipboardAfter=user.GetClipboardSequenceNumber()
            assert clipboardBefore==clipboardAfter,'platform_clipboard_sequence_changed'
            a.save(out,'result.json',{'passed':True,'controller':'unmodified Playwright channel=chrome headless','sameFlow':True,'nativeClipboardPaste':True,'inputSourceClear':True,'platformClipboardUntouched':True,'verdict':'bot','modelCalls':0})
            print(json.dumps({'reversePassed':True,'verdict':'bot'}),flush=True)
        except Exception as e:a.save(out,'failure.json',{'type':type(e).__name__,'error':str(e)[:250]});raise
        finally:
            if context:await context.close()
            assert not a._profile_process_present(profile)
            assert profile.resolve().parent==out and out.parent==(a.BASE/'reports').resolve() and not any(p.is_symlink() or p.is_junction() for p in [profile,*profile.rglob('*')])
            if profile.exists():a.shutil.rmtree(profile)
            a.save(out,'closed.json',{'processClosed':True,'permanentlyDeleted':not profile.exists()})
if __name__=='__main__':asyncio.run(main())
