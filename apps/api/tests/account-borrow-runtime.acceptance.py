"""Use the real handoff/borrow APIs against the already-calibrated local holdout."""
import asyncio
import json
from pathlib import Path
import shutil
import sys
from uuid import uuid4

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present
from browser_use_runner.account_borrow import borrow_window, CheckPage
from browser_use_runner.account_browser_http import browser_request
from browser_use_runner.attached_window import _client


async def result(out, case):
    file = out / (case['id'] + '.raw.json')
    for _ in range(100):
        if file.exists():
            value = json.loads(file.read_text())
            assert value['state'] == 'ready' and value['errors'] == 0
            return value
        await asyncio.sleep(.1)
    raise AssertionError('owned-holdout-missing')


async def background_counterexample(lease):
    # 仅本次私有Chrome内新增about:blank作为前台页；原账号owner页应保持后台状态。
    endpoint = f'ws://127.0.0.1:{lease.cdpPort}/devtools/browser/{lease.browserId}'
    async with _client(endpoint) as client:
        other = await client.send.Target.createTarget({'url': 'about:blank', 'newWindow': False, 'background': False})
        await client.send.Target.activateTarget({'targetId': other['targetId']})
        attached = await client.send.Target.attachToTarget({'targetId': lease.targetId, 'flatten': True})
        session = attached['sessionId']
        value = await client.send.Runtime.evaluate({'expression': '({hidden:document.hidden,focus:document.hasFocus()})',
            'returnByValue': True}, session_id=session)
        await client.send.Target.detachFromTarget({'sessionId': session})
        state = value['result']['value']
        assert state == {'hidden': True, 'focus': False}, 'background-control-invalid'
        return state


async def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    out = Path(spec['out']).resolve(); profile = out / 'profile'
    assert out.is_relative_to(ROOT / 'work/antibot-service/reports')
    cases = spec['cases']
    owner = uuid4(); window = ManagedWindow(profile, owner); browser = None
    try:
        browser = await window.start(resume=False, allowed_domains=['127.0.0.1'])
        lease = window._load()
        (out / 'owner.json').write_text(json.dumps(dict(owner=str(owner), pid=lease.browserPid,
            started=lease.browserStarted, profile=str(profile), personalBrowser=False)))
        page = await browser.get_current_page()
        await page.goto(cases[0]['url'])
        await result(out, cases[0])
        await window.handoff(browser)
        before_borrow = await background_counterexample(window._load())
        origins = [cases[1]['url'].split('/case/')[0]]
        async with borrow_window(profile, owner, owner, 'dedicated') as borrowed:
            during_borrow = await borrowed.page.evaluate('() => ({hidden:document.hidden,focus:document.hasFocus()})')
            (out / 'focus.json').write_text(json.dumps(dict(before=before_borrow, during=during_borrow,
                changed=before_borrow != during_borrow, ownedBackgroundTab=True)))
            observations = {'errors': []}
            account_page = CheckPage(borrowed, origins, observations)
            await account_page.goto(cases[1]['url'])
            await result(out, cases[1])
            assert not observations['errors']
            assert await borrowed.page.locator('h1').count() == 1
            # WHY：替换连接后保留页面主世界语义；默认隔离世界不能悄悄吞掉站点变量。
            await borrowed.cdp.send('Runtime.evaluate', {'expression': 'window.__batBorrowContract = 37'})
            assert await borrowed.page.evaluate('() => window.__batBorrowContract') == 37
            assert await borrowed.page.evaluate('() => /native code/.test(console.log.toString())')
            await borrowed.cdp.send('Runtime.evaluate', {'expression': 'delete window.__batBorrowContract'})
            await borrowed.put_cookies([{'name': 'bat_borrow_contract', 'value': 'owned', 'domain': '127.0.0.1', 'path': '/'}])
            cookie = next(v for v in await borrowed.cookies([origins[0] + '/']) if v['name'] == 'bat_borrow_contract')
            assert cookie['value'] == 'owned'
            await borrowed.remove_cookie(cookie)
            assert not any(v['name'] == 'bat_borrow_contract' for v in await borrowed.cookies([origins[0] + '/']))
            assert await borrowed.page.evaluate("() => { localStorage.setItem('bat_borrow_contract', 'owned'); const v = localStorage.getItem('bat_borrow_contract'); localStorage.removeItem('bat_borrow_contract'); return v }") == 'owned'
            response = await browser_request(borrowed, origins, 'GET', cases[1]['url'] + '/gate')
            assert response.status_code == 200 and response.json()['collect'] is True
            # 已有夹具connect-src self必须继续拒绝跨源；TS端另核确实产生CSP违规而非DNS错误。
            try:
                await browser_request(borrowed, [*origins, 'https://outside.invalid'], 'GET', 'https://outside.invalid/')
            except Exception:
                pass
            else:
                raise AssertionError('account-fetch-bypassed-CSP')
            await asyncio.sleep(.2)
            (out / 'compatibility.json').write_text(json.dumps(dict(mainWorld=True, nativeConsole=True,
                locator=True, navigation=True, cookieReadWriteRemove=True, storage=True, nativeFetch=True)))
        assert window.inspect(owner)['active'], 'borrow-stop-closed-owner'
        (out / 'borrow-release.json').write_text(json.dumps(dict(ownerStillActive=True, modelCalls=0)))
    finally:
        if window.transferred:
            await window.end_gracefully(owner)
            closed = dict(status='confirmed', path='original-handoff-owner-end')
        else:
            closed = await window.close(browser)
        (out / 'closed.json').write_text(json.dumps(closed))
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        assert profile.parent == out
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists():
            shutil.rmtree(profile)
        (out / 'profile-deleted.json').write_text(json.dumps(dict(permanentlyDeleted=not profile.exists())))


if __name__ == '__main__':
    asyncio.run(main())
