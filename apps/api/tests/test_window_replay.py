import json
import tempfile
import unittest
import asyncio
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use_runner.attached_window import AttachedLease, AttachedWindow
from browser_use_runner.managed_window import WindowLease, ManagedWindow
from browser_use_runner.window_lease_archive import archive_lease, archived_path, owner_path


class RetainedReplay(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.profile = Path(self.temporary.name).resolve() / 'profile'
        self.owner = uuid4()
        self.endpoint = 'ws://127.0.0.1:9222/devtools/browser/owned-test'

    def tearDown(self):
        self.temporary.cleanup()

    def attached(self, **changes):
        lease = AttachedLease(ownerId=self.owner, leaseId=self.owner, profilePath=str(self.profile),
            cdpUrl=self.endpoint, status='handoff', targetId='old-target', ownedTargets=['old-target'])
        lease = lease.model_copy(update=changes)
        base = AttachedWindow.lease_path(self.profile)
        base.write_text(lease.model_dump_json(), encoding='utf8')
        return base, lease

    def test_inspected_missing_account_targets_release_the_native_reservation(self):
        base, lease = self.attached()
        client = SimpleNamespace(send=SimpleNamespace(Target=SimpleNamespace(getTargets=AsyncMock(return_value={
            'targetInfos': [{'targetId': 'private', 'type': 'page'}]}))))
        @asynccontextmanager
        async def connected(_endpoint):
            yield client
        with patch('browser_use_runner.attached_window._client', connected):
            result = asyncio.run(AttachedWindow(self.profile, self.owner).inspect(self.owner))
        self.assertFalse(result['active'])
        self.assertEqual(json.loads(base.read_text())['status'], 'ended')
        # WHY：普通新 owner 即可复跑；不删除旧收据、不触碰另一标签，不依赖宿主强清锁。
        current = AttachedWindow(self.profile, uuid4(), self.endpoint)._reserve()
        self.assertNotEqual(current.ownerId, lease.ownerId)
        self.assertEqual(AttachedWindow(self.profile, self.owner)._load().status, 'ended')

    def test_verified_empty_startup_lease_is_ended_before_next_reservation(self):
        base, _lease = self.attached(status='starting', targetId=None, ownedTargets=[])
        result = asyncio.run(AttachedWindow(self.profile, self.owner).verify_closed(self.owner))
        self.assertFalse(result['active'])
        self.assertEqual(json.loads(base.read_text())['status'], 'ended')
        AttachedWindow(self.profile, uuid4(), self.endpoint)._reserve()

    def test_inspect_does_not_release_a_concurrently_changed_owner_receipt(self):
        base, lease = self.attached()
        window = AttachedWindow(self.profile, self.owner)
        async def changed():
            window._save(lease.model_copy(update={'ownedTargets': ['changed-target']}))
            return {'targetInfos': []}
        client = SimpleNamespace(send=SimpleNamespace(Target=SimpleNamespace(getTargets=changed)))
        @asynccontextmanager
        async def connected(_endpoint):
            yield client
        with patch('browser_use_runner.attached_window._client', connected):
            with self.assertRaisesRegex(ValueError, 'lease_changed'):
                asyncio.run(window.inspect(self.owner))
        self.assertEqual(json.loads(base.read_text())['status'], 'handoff')
        self.assertEqual(json.loads(base.read_text())['ownedTargets'], ['changed-target'])

    def test_archive_retries_copy_before_unlink_without_overwriting_other_receipts(self):
        base, lease = self.attached()
        archive = archived_path(base, self.owner); archive.parent.mkdir(parents=True)
        archive.write_text(lease.model_dump_json(), encoding='utf8')  # crash after durable copy
        archive_lease(base, lease)
        self.assertFalse(base.exists()); self.assertEqual(owner_path(base, self.owner), archive)
        base.write_text(lease.model_dump_json(), encoding='utf8')
        archive.write_text(lease.model_copy(update={'targetId': 'different'}).model_dump_json(), encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'archive_changed'):
            archive_lease(base, lease)
        self.assertTrue(base.exists())

    def test_daily_replay_requires_confirmed_owner_profile_not_ephemeral_relay(self):
        base, lease = self.attached()
        unknown = AttachedWindow(self.profile, uuid4(), self.endpoint)
        with self.assertRaisesRegex(ValueError, 'busy'): unknown._reserve()
        endpoint = self.endpoint.replace('owned-test', 'different')
        unknown_relay = AttachedWindow(self.profile, uuid4(), endpoint)
        with self.assertRaisesRegex(ValueError, 'busy'): unknown_relay._reserve()
        next_window = AttachedWindow(self.profile, uuid4(), endpoint, released_owners=[self.owner])
        current = next_window._reserve()
        self.assertNotEqual(current.ownerId, lease.ownerId)
        self.assertEqual(current.ownedTargets, [])
        self.assertEqual(current.cdpUrl, endpoint)
        self.assertTrue(AttachedWindow.has_lease(self.profile, self.owner))
        self.assertEqual(AttachedWindow(self.profile, self.owner)._load().targetId, 'old-target')
        self.assertEqual(AttachedWindow(self.profile, self.owner)._load().cdpUrl, self.endpoint)
        with self.assertRaisesRegex(ValueError, 'endpoint_changed'):
            AttachedWindow(self.profile, self.owner, endpoint)._load()

    def test_managed_rollover_retains_old_owner_and_only_borrows_process(self):
        base = self.profile.parent / 'managed-window-lease.json'
        lease = WindowLease(ownerId=self.owner, leaseId=self.owner, creatorPid=1, profilePath=str(self.profile),
            status='handoff', targetId='old-target', browserPid=42, cdpPort=9222, browserId='owned-test')
        base.write_text(lease.model_dump_json(), encoding='utf8')
        next_window = ManagedWindow(self.profile, uuid4(), released_owners=[self.owner])
        with patch('browser_use_runner.managed_window._owner_process', return_value=object()), patch.object(next_window, '_verify', return_value=(True, None)):
            new = next_window._reserve()
        self.assertTrue(new.retainedProcess); self.assertEqual(new.browserPid, 42)
        self.assertIsNone(new.targetId); self.assertEqual(new.ownedTargets, [])
        old = ManagedWindow(self.profile, self.owner)
        self.assertTrue(old._load().retainedProcess)
        self.assertEqual(old._load().ownedTargets, ['old-target'])
        with self.assertRaisesRegex(ValueError, 'scoped_end_required'): old.end(self.owner)
        self.assertTrue(ManagedWindow.has_lease(self.profile, self.owner))

    def test_unknown_or_incompatible_managed_owner_is_not_archived(self):
        base = self.profile.parent / 'managed-window-lease.json'
        lease = WindowLease(ownerId=self.owner, leaseId=self.owner, creatorPid=1, profilePath=str(self.profile), status='handoff')
        base.write_text(lease.model_dump_json(), encoding='utf8')
        unknown = ManagedWindow(self.profile, uuid4())
        with self.assertRaisesRegex(ValueError, 'busy'): unknown._reserve()
        incompatible = ManagedWindow(self.profile, uuid4(), headless=True, released_owners=[self.owner])
        with patch('browser_use_runner.managed_window._owner_process', return_value=object()), patch.object(incompatible, '_verify', return_value=(True, None)):
            with self.assertRaisesRegex(ValueError, 'visibility_conflict'): incompatible._reserve()
        self.assertEqual(json.loads(base.read_text())['ownerId'], str(self.owner))

    def test_archive_publish_failure_leaves_complete_current_and_no_partial_archive(self):
        base, lease = self.attached()
        with patch('browser_use_runner.window_lease_archive.os.link', side_effect=OSError('interrupted')):
            with self.assertRaises(OSError): archive_lease(base, lease)
        self.assertEqual(json.loads(base.read_text())['ownerId'], str(self.owner))
        self.assertFalse(archived_path(base, self.owner).exists())
        archive_lease(base, lease)
        self.assertTrue(archived_path(base, self.owner).exists())

    def test_legacy_completed_receipt_can_be_archived_with_new_default_field(self):
        base, lease = self.attached()
        legacy = json.loads(base.read_text()); del legacy['targetCreationPending']
        base.write_text(json.dumps(legacy), encoding='utf8')
        # Interrupted old publish: complete legacy archive exists, current not yet unlinked.
        archive = archived_path(base, self.owner); archive.parent.mkdir(parents=True)
        archive.write_text(json.dumps(legacy), encoding='utf8')
        current = AttachedWindow(self.profile, uuid4(),
            self.endpoint.replace('owned-test', 'new-relay'), released_owners=[self.owner])._reserve()
        self.assertEqual(current.ownedTargets, [])
        self.assertEqual(AttachedWindow(self.profile, self.owner)._load(), lease)

    def test_managed_archive_before_replace_keeps_current_process_receipt(self):
        base = self.profile.parent / 'managed-window-lease.json'
        lease = WindowLease(ownerId=self.owner, leaseId=self.owner, creatorPid=1, profilePath=str(self.profile),
            status='handoff', targetId='old-target', browserPid=42, cdpPort=9222, browserId='owned-test')
        base.write_text(lease.model_dump_json(), encoding='utf8')
        window = ManagedWindow(self.profile, uuid4(), released_owners=[self.owner])
        original = window._save
        def fail_new(value):
            if value.ownerId != self.owner: raise OSError('interrupted_replace')
            original(value)
        with patch('browser_use_runner.managed_window._owner_process', return_value=object()), patch.object(window, '_verify', return_value=(True, None)), patch.object(window, '_save', side_effect=fail_new):
            with self.assertRaises(OSError): window._reserve()
        self.assertEqual(json.loads(base.read_text())['browserPid'], 42)
        retry = ManagedWindow(self.profile, uuid4(), released_owners=[self.owner])
        with patch('browser_use_runner.managed_window._owner_process', return_value=object()), patch.object(retry, '_verify', return_value=(True, None)):
            current = retry._reserve()
        self.assertTrue(current.retainedProcess); self.assertEqual(current.browserPid, 42)

    def test_unknown_daily_target_creation_survives_restart_and_refuses_cleanup(self):
        base, lease = self.attached(status='starting', targetId=None, ownedTargets=[], targetCreationPending=True)
        window = AttachedWindow(self.profile, self.owner, self.endpoint)
        with self.assertRaisesRegex(ValueError, 'create_unconfirmed'):
            asyncio.run(window.verify_closed(self.owner))
        with self.assertRaisesRegex(ValueError, 'create_unconfirmed'):
            asyncio.run(window._end_connected(window._load(), None))
        next_window = AttachedWindow(self.profile, uuid4(), self.endpoint, released_owners=[self.owner])
        with self.assertRaisesRegex(ValueError, 'create_unconfirmed'): next_window._reserve()
        self.assertEqual(json.loads(base.read_text())['targetCreationPending'], True)
        legacy = json.loads(base.read_text()); del legacy['targetCreationPending']
        base.write_text(json.dumps(legacy), encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'create_unconfirmed'):
            asyncio.run(AttachedWindow(self.profile, self.owner).verify_closed(self.owner))


if __name__ == '__main__': unittest.main()
