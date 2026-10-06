"""Test-only transport: original source checks/native DPAPI over cloned local platform data.

JSON on stdin/stdout stays in process memory; credentials never enter evidence files.
"""
import asyncio,json,sys
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'apps/api/python'))
from browser_use_runner.account_borrow import borrow_window
from browser_use_runner.account_session import catalog,module_from,open_page
from browser_use_runner.account_auth import capture,prepare,write,restore
from browser_use_runner.account_secrets import RollbackStore

async def run(raw):
    request,platform=raw['input'],raw.get('platform')
    if request['action']=='open_page':
        async with borrow_window(raw['profile'],request['ownerId'],request['leaseId'],request['kind']) as b:
            return await open_page(b,request['payload'])
    data,file=catalog()
    if request['catalogVersion']!=data['version'] or request['evidenceSha256']!=data['evidenceSha256']:
        raise ValueError('account_platform_version_changed')
    payload=request.get('payload') or {}; action=request['action']
    store=RollbackStore(Path(raw['profile']).resolve().parents[1])
    binding={k:request[k] for k in ('ownerId','leaseId','kind','platformId','catalogVersion','evidenceSha256')}
    if action=='auth_abandon':
        snapshot=store.load(payload['rollbackRef'])
        if snapshot['binding']!=binding:raise ValueError('account_rollback_owner_changed')
        store.remove(payload['rollbackRef']);return {'phase':'abandoned'}
    async with borrow_window(raw['profile'],request['ownerId'],request['leaseId'],request['kind']) as b:
        if action in ('check','observe'):return await module_from(file).check(platform,b,observe=action=='observe')
        if action=='auth_read':return await capture(platform,b)
        if action=='auth_prepare':return await prepare(platform,b,store,payload['rollbackRef'],binding,payload['expected'])
        if action=='auth_write':return await write(platform,b,payload['state'],store,payload['rollbackRef'],binding)
        if action=='auth_restore':return await restore(platform,b,store,payload['rollbackRef'],binding)
        if action=='fixture_login':
            await b.page.goto(platform['url'])
            await b.page.locator('[name=password]').fill(payload['password'])
            await b.page.locator('button').click()
            return {'phase':'fixture_logged_in'}
        if action=='fixture_signout':
            for cookie in await b.cookies(platform['cookieUrls']):
                if cookie['name'] in platform['cookieNames']:await b.remove_cookie(cookie)
            return {'phase':'fixture_signed_out'}
        raise ValueError('account_test_action_unknown')

if __name__=='__main__':
    try:print(json.dumps(asyncio.run(run(json.loads(sys.stdin.read())))),flush=True)
    except Exception as error:
        reason=str(error) if str(error).startswith('account_') and ' ' not in str(error) else 'account_native_fixture_failed'
        print(json.dumps({'error':reason}),flush=True);sys.exit(1)
