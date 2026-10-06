"""Only the original handed-off target supplies account source metadata."""
import asyncio
import tempfile
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from browser_use_runner.managed_window import ManagedWindow, WindowLease
from browser_use_runner.attached_window import AttachedWindow, AttachedLease


class AccountWindowPageTests(unittest.TestCase):
    def test_dedicated_page_requires_matching_owner_and_original_target(self):
        with tempfile.TemporaryDirectory() as directory:
            owner = uuid4()
            window = ManagedWindow(Path(directory) / 'profile', owner)
            window._save(WindowLease(ownerId=owner, leaseId=owner, profilePath=str(window.profile_path),
                creatorPid=1, status='handoff', cdpPort=1, targetId='owned'))
            with patch.object(window, '_verify', return_value=(True, None)), \
                    patch('browser_use_runner.managed_window._cdp_json', return_value=[
                        {'id': 'unrelated', 'type': 'page', 'url': 'https://private.test/'},
                        {'id': 'owned', 'type': 'page', 'url': 'https://account.test/'}]):
                self.assertEqual(window.page(owner)['page'], {'url': 'https://account.test/'})
                with self.assertRaisesRegex(ValueError, 'owner_mismatch'):
                    window.page(uuid4())
                self.assertTrue(ManagedWindow.has_lease(window.profile_path, owner))
                self.assertFalse(ManagedWindow.has_lease(window.profile_path, uuid4()))

    def test_daily_page_never_uses_other_tabs_or_unowned_target(self):
        with tempfile.TemporaryDirectory() as directory:
            owner = uuid4()
            window = AttachedWindow(Path(directory) / 'profile', owner)
            lease = AttachedLease(ownerId=owner, leaseId=owner, profilePath=str(window.profile_path),
                cdpUrl='ws://127.0.0.1:1/devtools/browser/test', status='handoff', targetId='owned', ownedTargets=['owned'])
            window._save(lease)
            client = SimpleNamespace(send=SimpleNamespace(Target=SimpleNamespace(getTargets=AsyncMock(return_value={
                'targetInfos': [{'targetId': 'private', 'type': 'page', 'url': 'https://private.test/'},
                                {'targetId': 'owned', 'type': 'page', 'url': 'https://account.test/'}]}))))

            @asynccontextmanager
            async def connected(_endpoint):
                yield client

            with patch('browser_use_runner.attached_window._client', connected):
                self.assertEqual(asyncio.run(window.page(owner))['page'], {'url': 'https://account.test/'})
                lease.ownedTargets = []; window._save(lease)
                with self.assertRaisesRegex(ValueError, 'target_missing'):
                    asyncio.run(window.page(owner))
