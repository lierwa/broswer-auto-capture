"""New post-mutation guard only: original owned Chrome/CDP plus native Windows DPAPI."""
import asyncio, copy, json, os, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4
ROOT=Path.cwd(); sys.path.insert(0,str(ROOT/'apps/api/python'))
from browser_use_runner.account_auth import capture, prepare, write, restore, canonical
from browser_use_runner.account_borrow import borrow_window
from browser_use_runner.account_secrets import RollbackStore
from browser_use_runner.managed_window import ManagedWindow
OUT=ROOT/'work/account-rebuild-20261003/auth-native-guard'; OUT.mkdir(exist_ok=True)
proof={'passed':False,'personalProfileTouched':False,'modelCalls':0}
class Site(BaseHTTPRequestHandler):
    def log_message(self,*_args): pass
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b'Owned native mutation guard')
async def probe(b,platform,store,binding):
    await b.put_cookies([{'name':'session','value':'owned-B','domain':'127.0.0.1','path':'/'},
                         {'name':'unrelated','value':'preserve','domain':'127.0.0.1','path':'/'}])
    before=await capture(platform,b); source=copy.deepcopy(before); source['cookies'][0]['value']='owned-A'
    ref=str(uuid4())
    try:
        await prepare(platform,b,store,ref,binding,before)
        await write(platform,b,source,store,ref,binding)
        assert canonical(await capture(platform,b))==canonical(source)
        await restore(platform,b,store,ref,binding)
        assert canonical(await capture(platform,b))==canonical(before)
        assert any(c['name']=='unrelated' and c['value']=='preserve' for c in await b.cookies(platform['cookieUrls']))
        proof.update(nativeCookieRoundTrip=True,nativeDPAPIRollback=True,unrelatedCookiePreserved=True)
        await prepare(platform,b,store,ref,binding,before)
        original=b.put_cookies
        async def manual_change_after_write(cookies):
            await original(cookies)
            changed=copy.deepcopy(cookies); changed[0]['value']='owned-manual-C'; await original(changed)
        b.put_cookies=manual_change_after_write
        try:
            await write(platform,b,source,store,ref,binding); raise AssertionError('manual_change_was_blessed')
        except ValueError as error: assert str(error)=='account_transfer_target_changed'
        b.put_cookies=original
        try:
            await restore(platform,b,store,ref,binding); raise AssertionError('manual_change_was_overwritten')
        except ValueError as error: assert str(error)=='account_rollback_target_changed'
        assert (await capture(platform,b))['cookies'][0]['value']=='owned-manual-C'
        proof.update(postMutationRaceRefused=True,manualStateNotAddedToAllowedDigests=True)
    finally: store.remove(ref)
async def main():
    attempt=OUT/str(uuid4()); attempt.mkdir(); owner=str(uuid4())
    window=ManagedWindow(attempt/'browser-profile/default',owner); store=RollbackStore(attempt)
    server=ThreadingHTTPServer(('127.0.0.1',0),Site); threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    platform={'id':'owned','origins':[origin],'cookieUrls':[origin+'/'],'cookieDomains':['127.0.0.1'],'cookieNames':['session'],'localStorageKeys':{}}
    binding={'ownerId':owner,'leaseId':owner,'kind':'dedicated','platformId':'owned','catalogVersion':'guard-v1','evidenceSha256':'a'*64}
    try:
        browser=await window.start(resume=False,allowed_domains=None); await window.handoff(browser)
        async with borrow_window(window.profile_path,owner,owner,'dedicated') as borrowed:
            await borrowed.page.goto(origin+'/')
            if '--shared-domain-only' in sys.argv: await shared_domain(borrowed,store,binding)
            else: await probe(borrowed,platform,store,binding)
        assert window.inspect(owner)['active']; proof.update(passed=True,borrowDisconnectPreservesOwner=True)
    finally: window.end(owner,allow_controlled=True); server.shutdown()
async def shared_domain(b,store,binding):
    platform={'id':'owned','origins':['https://app.shared.example.test'],
              'cookieUrls':['https://app.shared.example.test/','https://studio.shared.example.test/'],
              'cookieDomains':['shared.example.test'],'cookieNames':['session'],'localStorageKeys':{}}
    await b.put_cookies([{'name':'session','value':'owned-B','domain':'.shared.example.test','path':'/'},
                         {'name':'unrelated','value':'preserve','domain':'.shared.example.test','path':'/'},
                         {'name':'session','value':'other-parent','domain':'.other.example.test','path':'/'}])
    before=await capture(platform,b)
    assert len(before['cookies'])==1 and before['cookies'][0]['domain']=='.shared.example.test'
    source=copy.deepcopy(before);source['cookies'][0]['value']='owned-A';ref=str(uuid4())
    try:
        await prepare(platform,b,store,ref,binding,before);await write(platform,b,source,store,ref,binding)
        for url in platform['cookieUrls']:
            assert any(c['name']=='session' and c['value']=='owned-A' for c in await b.cookies([url]))
            assert any(c['name']=='unrelated' and c['value']=='preserve' for c in await b.cookies([url]))
        assert any(c['name']=='session' and c['value']=='other-parent' for c in await b.cookies(['https://app.other.example.test/']))
        await restore(platform,b,store,ref,binding);assert canonical(await capture(platform,b))==canonical(before)
        proof.update(sharedParentBothServices=True,nonApprovedKeyPreserved=True,otherParentPreserved=True,scopedCaptureOneKey=True)
    finally:store.remove(ref)
if __name__=='__main__':
    if os.environ.get('BAT_RUN_ACCOUNT_NATIVE_GUARD')!='1': raise ValueError('explicit_owned_native_gate_required')
    try: asyncio.run(asyncio.wait_for(main(),60))
    finally:
        name='shared-domain-result.json' if '--shared-domain-only' in sys.argv else 'result.json'
        (OUT/name).write_text(json.dumps(proof,indent=2)+'\n')
