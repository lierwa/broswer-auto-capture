"""Temp ownership must outlive Runner handoff and fail closed during cleanup."""
import asyncio
import json
import os
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from browser_use_runner.managed_temp import create_browser_temp, cleanup_browser_temp
from browser_use_runner.managed_window import ManagedWindow


class ManagedTempTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='bat-temp-policy-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve()
        environment = patch.dict(os.environ, {'BAT_BROWSER_TEMP_ROOT': str(self.root)})
        environment.start(); self.addCleanup(environment.stop)
        self.window = ManagedWindow(self.root/'deep'/'profile', uuid4())
        self.lease = self.window._reserve()

    def allocate(self):
        return create_browser_temp(self.window, self.lease)

    def test_handoff_receipt_retains_temp_across_new_controller(self):
        path = self.allocate()
        self.lease.status = 'handoff'; self.window._save(self.lease)
        self.window.transferred = True
        self.assertEqual(asyncio.run(self.window.close(None))['status'], 'not_required')
        restored = ManagedWindow(self.window.profile_path, self.window.owner_id)
        self.assertEqual(restored._load().browserTempPath, str(path))
        self.assertTrue(path.is_dir())
        with patch('browser_use_runner.managed_window._owner_process', return_value=None), \
                patch('browser_use_runner.managed_window._profile_process_present', return_value=False):
            restored.end(restored.owner_id)
        self.assertFalse(path.exists())
        self.assertFalse(restored.path.exists())

    def test_live_profile_or_deletion_error_keeps_receipt_for_retry(self):
        path = self.allocate()
        self.lease.status = 'running'; self.window._save(self.lease)
        with patch('browser_use_runner.managed_window._owner_process', return_value=None), \
                patch('browser_use_runner.managed_window._profile_process_present', return_value=True):
            self.assertEqual(asyncio.run(self.window.close(None))['status'], 'unconfirmed')
        self.assertTrue(path.exists()); self.assertTrue(self.window.path.exists())
        with patch('browser_use_runner.managed_window._owner_process', return_value=None), \
                patch('browser_use_runner.managed_window._profile_process_present', return_value=False), \
                patch('browser_use_runner.managed_temp.shutil.rmtree', side_effect=PermissionError('busy')):
            self.assertEqual(asyncio.run(self.window.close(None))['status'], 'unconfirmed')
        self.assertTrue(path.exists()); self.assertTrue(self.window.path.exists())
        with patch('browser_use_runner.managed_window._owner_process', return_value=None), \
                patch('browser_use_runner.managed_window._profile_process_present', return_value=False):
            self.assertEqual(asyncio.run(self.window.close(None))['status'], 'confirmed')
        self.assertFalse(path.exists())

    def test_foreign_profile_marker_and_outside_root_are_not_removed(self):
        path = self.allocate()
        (path/'.bat-owner.json').write_text(json.dumps({'version': 1, 'profile': 'foreign'}))
        with self.assertRaisesRegex(ValueError, 'owner_invalid'): cleanup_browser_temp(self.lease)
        self.assertTrue(path.exists())
        self.lease.browserTempPath = str(self.root/'deep'/'bat-chrome-foreign')
        with self.assertRaisesRegex(ValueError, 'owner_invalid'): cleanup_browser_temp(self.lease)
        self.assertTrue(self.window.path.exists())

    def test_launch_failure_cleans_allocated_temp_without_profile_removal(self):
        path = self.allocate()
        self.window.profile_path.mkdir()
        self.window.end(self.window.owner_id, allow_controlled=True)
        self.assertFalse(path.exists()); self.assertTrue(self.window.profile_path.exists())

    def test_failed_receipt_does_not_leave_unowned_temp(self):
        before = set(self.root.iterdir())
        with patch.object(self.window, '_save', side_effect=OSError('receipt_failed')):
            with self.assertRaises(OSError): self.allocate()
        self.assertEqual(set(self.root.iterdir()), before)

    def test_cleanup_retry_after_delete_and_legacy_lease_are_safe(self):
        self.allocate()
        cleanup_browser_temp(self.lease)
        cleanup_browser_temp(self.lease)
        self.lease.browserTempPath = None
        cleanup_browser_temp(self.lease)

    def test_child_link_refused_without_following_or_deleting_target(self):
        path = self.allocate()
        foreign = self.root/'foreign'; foreign.mkdir()
        (foreign/'keep.txt').write_text('preserve')
        try: (path/'linked').symlink_to(foreign, target_is_directory=True)
        except OSError as error:
            if getattr(error, 'winerror', None) != 1314: raise
            # Windows无符号链接权限时，以本测试内的真实junction保护同一不变量。
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(path/'linked'), str(foreign)],
                check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        with self.assertRaisesRegex(ValueError, 'link_refused'): cleanup_browser_temp(self.lease)
        self.assertEqual((foreign/'keep.txt').read_text(), 'preserve')
        self.assertTrue(self.window.path.exists())


if __name__ == '__main__': unittest.main()
