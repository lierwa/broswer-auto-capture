import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from browser_use_runner.attached_window import AttachedWindow


class ParallelWindowLeases(unittest.IsolatedAsyncioTestCase):
    # WHY：保护旧现场与新运行独立；不能以“连接不上”猜测旧窗口已关闭。
    async def test_receipts_do_not_block_other_owners_and_prior_boot_ends_without_cdp(self):
        with tempfile.TemporaryDirectory(prefix='bat-parallel-leases-') as directory:
            profile = Path(directory) / 'default'
            a = AttachedWindow(profile, uuid4(), 'ws://127.0.0.1:12345/devtools/browser/fixture')
            b = AttachedWindow(profile, uuid4(), 'ws://127.0.0.1:12345/devtools/browser/fixture')
            old = a._reserve(); old.status = 'handoff'; old.targetId = 'a'; old.ownedTargets = ['a']; a._save(old)
            b._reserve()
            self.assertNotEqual(a.path, b.path)
            self.assertEqual(a._load(a.owner_id).status, 'handoff')
            with patch('browser_use_runner.window_lease_archive.psutil.boot_time', return_value=a.path.stat().st_mtime + 1):
                result = await a.verify_closed(a.owner_id)
            self.assertFalse(result['active']); self.assertEqual(a._load(a.owner_id).status, 'ended')
            self.assertEqual(b._load(b.owner_id).status, 'starting')

    async def test_closed_target_ends_only_its_original_receipt(self):
        with tempfile.TemporaryDirectory(prefix='bat-parallel-close-') as directory:
            profile = Path(directory) / 'default'
            a = AttachedWindow(profile, uuid4(), 'ws://127.0.0.1:12345/devtools/browser/fixture')
            lease = a._reserve(); lease.status = 'handoff'; lease.ownedTargets = ['a']; lease.targetId = 'a'; a._save(lease)
            b = AttachedWindow(profile, uuid4(), a.cdp_url); b._reserve()
            with patch('browser_use_runner.attached_window.browser_exited', return_value=False), patch(
                    'browser_use_runner.attached_window._client') as client:
                client.return_value.__aenter__ = AsyncMock(return_value=object())
                a._existing = AsyncMock(return_value=set())
                state = await a.inspect(a.owner_id)
            self.assertFalse(state['active']); self.assertEqual(b._load(b.owner_id).status, 'starting')


if __name__ == '__main__':
    unittest.main()
