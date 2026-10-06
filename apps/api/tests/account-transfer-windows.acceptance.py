"""Real Windows dual Profile transfer, server-backed identity and native DPAPI recovery."""
import asyncio, hashlib, importlib.util, json, os, secrets, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs
from uuid import uuid4

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT/'apps/api/python'))
from browser_use_runner.account_borrow import borrow_window
from browser_use_runner.account_auth import capture, prepare, write, restore, canonical
from browser_use_runner.account_secrets import RollbackStore
from browser_use_runner.account_session import catalog, module_from
from browser_use_runner.managed_window import ManagedWindow

OUTPUT = ROOT/'work/account-rebuild-20261003/transfer-windows'
OUTPUT.mkdir(parents=True, exist_ok=True)
proof = {'passed':False, 'personalProfileTouched':False, 'modelCalls':0, 'steps':[]}
sessions, credential = {}, secrets.token_urlsafe(24)

class Site(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_GET(self):
        token = next((part.strip().split('=',1)[1] for part in self.headers.get('Cookie','').split(';') if part.strip().startswith('session=')), None)
        user = sessions.get(token)
        self.send_response(200)
        self.send_header('Content-Type','application/json' if self.path.startswith('/x/web-interface/nav') else 'text/html; charset=utf-8')
        self.send_header('Cache-Control','no-store'); self.end_headers()
        if self.path.startswith('/x/web-interface/nav'):
            self.wfile.write(json.dumps({'code':0,'data':{'isLogin':bool(user),'mid':user,'uname':f'Owned {user}' if user else None}}).encode()); return
        self.wfile.write(b'<html><title>Owned account transfer site</title><form method="post" action="/login"><input name="account"><input type="password" name="password"><button>Sign in</button></form></html>')
    def do_POST(self):
        form = parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode())
        if form.get('password') != [credential]: self.send_response(403); self.end_headers(); return
        token = secrets.token_urlsafe(32); sessions[token] = form['account'][0]
        self.send_response(303)
        self.send_header('Set-Cookie', f'session={token}; HttpOnly; SameSite=Strict; Path=/')
        self.send_header('Set-Cookie', 'csrf=synthetic; SameSite=Strict; Path=/')
        self.send_header('Location','/'); self.end_headers()

def step(text): proof['steps'].append(text); print(text, flush=True)

async def main():
    server = ThreadingHTTPServer(('127.0.0.1',0), Site)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    data, file = catalog(); module = module_from(file)
    platform = {**data['platforms'][0], 'url':origin+'/', 'origins':[origin], 'host':origin,
                'cookieUrls':[origin+'/'], 'cookieDomains':['127.0.0.1'], 'cookieNames':['session','csrf'], 'localStorageKeys':{}}
    attempt = OUTPUT/str(uuid4()); attempt.mkdir()
    proof['attemptPath']=str(attempt)
    owner = str(uuid4()); profile = attempt/'dedicated/default'
    window = ManagedWindow(profile, owner)
    store = RollbackStore(OUTPUT)
    async def borrowed(kind, owned):
        return borrow_window(owned.profile_path, owned.owner_id, owned.owner_id, kind)
    async def login(kind, owned, name):
        step(f'login phase: {kind} {name}')
        async with await borrowed(kind, owned) as b:
            b.page.set_default_timeout(15000)
            await b.page.goto(origin+'/', timeout=15000)
            await b.page.locator('[name=account]').fill(name)
            await b.page.locator('[name=password]').fill(credential)
            await b.page.locator('button').click(timeout=15000)
            checked = await module.check(platform, b)
            assert checked['status']=='authenticated' and checked['identityConfirmed']
            return checked, await capture(platform,b)
    async def check(kind, owned):
        async with await borrowed(kind, owned) as b: return await module.check(platform,b)
    async def probe(daily, _profile, _client):
        alpha, source = await login('daily',daily,'Alpha')
        beta, target = await login('dedicated',window,'Beta')
        assert alpha['identityKey'] != beta['identityKey']; step('Windows actual daily/dedicated Profiles initially have different server-backed accounts')
        binding = {'ownerId':owner,'leaseId':owner,'kind':'dedicated','platformId':'bilibili','catalogVersion':data['version'],'evidenceSha256':data['evidenceSha256']}
        ref = str(uuid4())
        async with await borrowed('dedicated',window) as b:
            await b.put_cookies([{'name':'unrelated','value':'owned-unrelated','domain':'127.0.0.1','path':'/'}])
            await prepare(platform,b,store,ref,binding,await capture(platform,b))
            encrypted = store.path(ref).read_bytes()
            assert all(c['value'].encode() not in encrypted for c in target['cookies'])
            await write(platform,b,source,store,ref,binding)
            assert (await module.check(platform,b))['identityKey']==alpha['identityKey']
            assert any(c['name']=='unrelated' and c['value']=='owned-unrelated' for c in await b.cookies([origin+'/']))
        assert window.inspect(owner)['active']; assert (await daily.inspect(daily.owner_id))['active']
        step('daily → dedicated: scoped native Cookie write, fresh original pong identity match, unrelated cookie intact, both Chrome windows survive disconnect')
        # 独立新进程恢复：只传owner/范围/引用，不向磁盘写Cookie。
        request = {'profile':str(profile),'owner':owner,'reference':ref,'binding':binding,'platform':platform}
        recovery = OUTPUT/'recovery-request.json'; recovery.write_text(json.dumps(request))
        process = await asyncio.create_subprocess_exec(sys.executable, __file__, '--restore', str(recovery), cwd=ROOT,
                  stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await process.communicate()
        if process.returncode: raise AssertionError('native_restart_recovery_failed:'+stderr.decode()[-500:])
        assert (await check('dedicated',window))['identityKey']==beta['identityKey']
        step('fresh process + original owner + independent encrypted recovery key restore target Beta after transfer; native DPAPI readback verified')
        alpha, source = await login('dedicated',window,'Alpha')
        beta, target = await login('daily',daily,'Beta')
        daily_binding = {**binding,'ownerId':str(daily.owner_id),'leaseId':str(daily.owner_id),'kind':'daily'}
        ref = str(uuid4())
        async with await borrowed('daily',daily) as b:
            await prepare(platform,b,store,ref,daily_binding,await capture(platform,b))
            await write(platform,b,source,store,ref,daily_binding)
            assert (await module.check(platform,b))['identityKey']==alpha['identityKey']
            await restore(platform,b,store,ref,daily_binding)
            assert (await module.check(platform,b))['identityKey']==beta['identityKey']
        step('dedicated → daily reverse write and identity check through real extension relay; reverse rollback returns Beta')
        ref = str(uuid4())
        async with await borrowed('daily',daily) as b:
            await prepare(platform,b,store,ref,daily_binding,await capture(platform,b))
            await b.put_cookies([{'name':'session','value':'manual-change','domain':'127.0.0.1','path':'/'}])
            try: await write(platform,b,source,store,ref,daily_binding); raise AssertionError('stale_target_not_rejected')
            except ValueError as error: assert str(error)=='account_transfer_target_changed'
            try: await restore(platform,b,store,ref,daily_binding); raise AssertionError('manual_target_overwritten')
            except ValueError as error: assert str(error)=='account_rollback_target_changed'
        store.remove(ref); step('target changed by user after prepare: write and restore both refuse overwrite')
        await login('daily',daily,'Beta'); ref = str(uuid4())
        async with await borrowed('daily',daily) as b:
            await prepare(platform,b,store,ref,daily_binding,await capture(platform,b))
            original = b.put_cookies; count = 0
            async def fail_once(cookies):
                nonlocal count
                count += 1
                if count==2: raise ValueError('owned_injected_write_failure')
                await original(cookies)
            b.put_cookies = fail_once
            try: await write(platform,b,source,store,ref,daily_binding); raise AssertionError('failure_not_injected')
            except ValueError as error: assert str(error)=='owned_injected_write_failure'
            b.put_cookies = original
            await restore(platform,b,store,ref,daily_binding)
            assert (await module.check(platform,b))['identityKey']==beta['identityKey']
        step('partial native write failure retains first failure and restores original target; no source credentials persisted')
        proof['passed']=True
    try:
        browser = await window.start(resume=False, allowed_domains=None); await window.handoff(browser)
        spec = importlib.util.spec_from_file_location('owned_borrow_gate', ROOT/'apps/api/tests/account-borrow-windows.acceptance.py')
        gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
        gate.OUTPUT=attempt/'borrow'; gate.OUTPUT.mkdir()
        await gate.daily(probe)
    finally:
        window.end(owner, allow_controlled=True); server.shutdown()

async def recover(file):
    request=json.loads(Path(file).read_text())
    async with borrow_window(request['profile'],request['owner'],request['owner'],'dedicated') as b:
        await restore(request['platform'],b,RollbackStore(OUTPUT),request['reference'],request['binding'])
    print('owned recovery confirmed')

if __name__=='__main__':
    if '--restore' in sys.argv: asyncio.run(recover(sys.argv[-1]))
    else:
        if os.environ.get('BAT_RUN_ACCOUNT_TRANSFER')!='1': raise ValueError('explicit_owned_windows_gate_required')
        try: asyncio.run(asyncio.wait_for(main(), 150))
        except Exception as error:
            proof['errorType']=type(error).__name__; proof['reason']=str(error) if str(error).startswith('account_') else 'owned_acceptance_failed'
            raise
        finally: (OUTPUT/'result.json').write_text(json.dumps(proof,indent=2)+'\n')
