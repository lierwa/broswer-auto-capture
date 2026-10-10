"""Protect the acceptance-only deletion boundary, never a personal browser profile."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('owned_cleanup', Path(__file__).parent / 'helpers/owned-profile-cleanup.py')
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class OwnedProfileCleanupTests(unittest.TestCase):
    def test_closed_owned_profile_only_and_report_preserved(self):
        with tempfile.TemporaryDirectory(prefix='product-cleanup-', dir='work/antibot-service') as raw:
            directory = Path(raw).resolve(); profile = directory / 'browser-profile/runs/owned/default'
            profile.mkdir(parents=True); (profile / 'test-content').write_text('owned')
            (directory / 'manifest.json').write_text(json.dumps({'root': str(Path.cwd()), 'browser': 'dedicated-visible'}))
            (directory / 'closed.json').write_text(json.dumps({'hostClosed': True}))
            (directory / 'proof.json').write_text('preserved')
            with patch.object(cleanup, '_profile_process_present', return_value=True):
                with self.assertRaisesRegex(ValueError, 'process_alive'): cleanup.cleanup_antibot(directory, '')
            self.assertTrue(profile.exists())
            with patch.object(cleanup, '_profile_process_present', side_effect=ValueError('unverifiable')):
                with self.assertRaisesRegex(ValueError, 'unverifiable'): cleanup.cleanup_antibot(directory, '')
            self.assertTrue(profile.exists())
            (directory / 'closed.json').write_text(json.dumps({'hostClosed': False}))
            with self.assertRaisesRegex(ValueError, 'owner_not_closed'): cleanup.cleanup_antibot(directory, '')
            (directory / 'closed.json').write_text(json.dumps({'hostClosed': True}))
            with patch.object(cleanup, '_profile_process_present', return_value=False): cleanup.cleanup_antibot(directory, '')
            self.assertFalse((directory / 'browser-profile').exists())
            self.assertEqual((directory / 'proof.json').read_text(), 'preserved')
            self.assertTrue(json.loads((directory / 'profile-cleanup.json').read_text())['permanentlyDeleted'])

    def test_unrelated_directory_and_receipt_prefix_refused(self):
        with self.assertRaisesRegex(ValueError, 'test_scope_required'):
            cleanup.cleanup_antibot(Path.cwd() / 'data', '')
        with self.assertRaisesRegex(ValueError, 'prefix_invalid'):
            cleanup.cleanup_antibot(Path.cwd() / 'work/antibot-service/product-unused', '../')


if __name__ == '__main__': unittest.main()
