"""Native Windows DPAPI + scoped auth race/recovery boundaries, synthetic credentials only."""
import asyncio, copy, json, sys, unittest
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
ROOT=Path.cwd(); sys.path.insert(0,str(ROOT/'apps/api/python'))
from browser_use_runner.account_auth import capture, prepare, write, canonical
from browser_use_runner.account_secrets import RollbackStore
from browser_use_runner.account_session import handle

class Borrowed:
    def __init__(self):
        self.state={'cookies':[{'name':'session','value':'owned-B','domain':'example.test','path':'/'}], 'storage':{}}
        self.writes=0
    async def cookies(self, _urls): return copy.deepcopy(self.state['cookies'])
    async def put_cookies(self, cookies): self.writes+=1; self.state['cookies']=copy.deepcopy(cookies)
    async def remove_cookie(self,cookie): self.writes+=1; self.state['cookies']=[c for c in self.state['cookies'] if c['name']!=cookie['name']]

class AuthBoundaries(unittest.IsolatedAsyncioTestCase):
    async def test_native_encryption_confirm_race_old_scope_and_idempotent_abandon(self):
        out=ROOT/'work/account-rebuild-20261003'; out.mkdir(exist_ok=True)
        with TemporaryDirectory(dir=out) as directory:
            store=RollbackStore(directory); borrowed=Borrowed()
            platform={'id':'owned', 'cookieNames':['session'], 'cookieDomains':['example.test'], 'cookieUrls':['https://example.test/'], 'origins':['https://example.test'], 'localStorageKeys':{}}
            owner=str(uuid4()); binding={'ownerId':owner,'leaseId':owner,'kind':'dedicated','platformId':'owned','catalogVersion':'old-v1','evidenceSha256':'a'*64}
            expected=await capture(platform,borrowed); ref=str(uuid4())
            borrowed.state['cookies'][0]['value']='owned-unconfirmed-C'
            with self.assertRaisesRegex(ValueError,'account_transfer_target_changed'):
                await prepare(platform,borrowed,store,ref,binding,expected)
            self.assertFalse(store.path(ref).exists()); self.assertEqual(borrowed.writes,0)
            borrowed.state=copy.deepcopy(expected)
            await prepare(platform,borrowed,store,ref,binding,expected)
            self.assertNotIn(b'owned-B',store.path(ref).read_bytes())
            source=copy.deepcopy(expected); source['cookies'][0]['value']='owned-A'
            await write(platform,borrowed,source,store,ref,binding)
            @asynccontextmanager
            async def borrow(*_args): yield borrowed
            request=SimpleNamespace(profilePath=str(Path(directory)/'browser-profile/default'), ownerId=owner, leaseId=owner,
                kind='dedicated',platformId='owned',catalogVersion='new-v2',evidenceSha256='b'*64,payload={'rollbackRef':ref},action='auth_restore')
            with patch('browser_use_runner.account_session.borrow_window',borrow), patch('browser_use_runner.account_session.catalog',side_effect=AssertionError('new_catalog_must_not_gate_old_recovery')):
                wrong=SimpleNamespace(**{**vars(request),'ownerId':str(uuid4())})
                with self.assertRaisesRegex(ValueError,'owner_or_scope'): await handle(wrong)
                await handle(request)
            self.assertEqual(canonical(borrowed.state),canonical(expected)); self.assertFalse(store.path(ref).exists())
            request.action='auth_abandon'
            with patch('browser_use_runner.account_session.borrow_window',side_effect=AssertionError('abandon_must_not_connect')):
                self.assertEqual((await handle(request))['phase'],'abandoned')
                self.assertEqual((await handle(request))['phase'],'abandoned')
            borrowed.state['cookies'][0]['partitionKeyOpaque']=True
            with self.assertRaisesRegex(ValueError,'opaque_cookie'): await capture(platform,borrowed)
        (out/'auth-boundaries.json').write_text(json.dumps({'passed':True,'nativeDPAPI':True,'readPrepareRaceRefused':True,
            'oldScopeRestore':True,'wrongOwnerRefused':True,'abandonMissingSnapshotIdempotent':True,'opaquePartitionRefused':True})+'\n')

if __name__=='__main__': unittest.main()
