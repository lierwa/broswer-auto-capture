"""Related iframe sessions retain SDK features without owning foreign pages or shared workers."""
from types import SimpleNamespace
import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from browser_use_runner.target_scope import TargetScope


class RelatedFramesTests(unittest.TestCase):
    def fixture(self):
        scope = TargetScope(SimpleNamespace(), ['page-a'], lambda _: self.fail('iframe persisted as top-level page'))
        callbacks, accepted = {}, []
        target = SimpleNamespace(attachedToTarget=lambda cb: callbacks.update(attached=cb),
                                 detachedFromTarget=lambda cb: callbacks.update(detached=cb))
        scope._scope_frames(SimpleNamespace(register=SimpleNamespace(Target=target)))
        target.attachedToTarget(lambda event, sid=None: accepted.append(event['sessionId']) if scope.accepts(event['targetInfo']) else None)
        target.detachedFromTarget(lambda event, sid=None: None)
        def attach(sid, node, kind, parent=None, **extra):
            callbacks['attached']({'sessionId': sid, 'targetInfo': {'targetId': node, 'type': kind, **extra}}, parent)
        return scope, callbacks, accepted, attach

    def test_owned_nested_frames_pass_without_becoming_top_level_leases(self):
        scope, callbacks, accepted, attach = self.fixture()
        attach('page-session', 'page-a', 'page')
        attach('frame-session', 'frame-a', 'iframe', 'page-session')
        attach('nested-session', 'frame-b', 'iframe', 'frame-session')
        self.assertEqual(accepted, ['page-session', 'frame-session', 'nested-session'])
        self.assertEqual(scope.owned, {'page-a'})
        self.assertTrue(scope.accepts({'type': 'iframe', 'targetId': 'frame-b'}))
        callbacks['detached']({'sessionId': 'frame-session'}, 'page-session')
        self.assertFalse(scope.accepts({'type': 'iframe', 'targetId': 'frame-a'}))
        self.assertFalse(scope.accepts({'type': 'iframe', 'targetId': 'frame-b'}))
        self.assertEqual(set(scope.related_sessions), {'page-session'})

    def test_foreign_root_frames_and_shared_workers_cannot_claim_ownership(self):
        scope, callbacks, accepted, attach = self.fixture()
        attach('owned', 'page-a', 'page')
        attach('other', 'personal-page', 'page')
        attach('foreign', 'personal-frame', 'iframe', 'other', parentFrameId='page-a')
        attach('root-frame', 'root-frame', 'iframe', openerId='page-a', parentFrameId='page-a')
        attach('shared', 'shared-sw', 'service_worker', 'owned')
        attach('worker-frame', 'nested-under-shared', 'iframe', 'shared')
        self.assertEqual(accepted, ['owned'])
        self.assertEqual(set(scope.related_sessions), {'owned'})
        callbacks['detached']({'sessionId': 'owned'})
        self.assertEqual(scope.related_sessions, {})

    def test_dialogs_only_pass_for_active_owned_frame_sessions(self):
        scope, callbacks, _, attach = self.fixture()
        attach('owned', 'page-a', 'page')
        attach('child', 'frame-a', 'iframe', 'owned')
        registered, handled = {}, []
        page = SimpleNamespace(javascriptDialogOpening=lambda cb: registered.update(dialog=cb))
        manager = SimpleNamespace(get_target_id_from_session_id=lambda sid: {'owned': 'page-a', 'child': 'frame-a'}.get(sid))
        scope._scope_dialogs(SimpleNamespace(register=SimpleNamespace(Page=page)), manager)
        page.javascriptDialogOpening(lambda event, sid: handled.append(sid))
        async def run():
            await registered['dialog']({}, 'child')
            await registered['dialog']({}, 'foreign')
            callbacks['detached']({'sessionId': 'child'})
            await registered['dialog']({}, 'child')
        asyncio.run(run())
        self.assertEqual(handled, ['child'])

    def test_only_owned_frames_wait_for_admission(self):
        scope, _, _, attach = self.fixture()
        attach('owned', 'page-a', 'page')
        native = AsyncMock()
        target = SimpleNamespace(setAutoAttach=native)
        scope._scope_frame_start(SimpleNamespace(send=SimpleNamespace(Target=target)))
        async def run():
            with patch.object(scope, '_frame_admission_required', return_value=True):
                for sid in ['owned', 'foreign', None]:
                    await target.setAutoAttach(params={'autoAttach': True, 'flatten': True}, session_id=sid)
            with patch.object(scope, '_frame_admission_required', return_value=False):
                await target.setAutoAttach(params={'autoAttach': True}, session_id='owned')
        asyncio.run(run())
        calls = native.call_args_list
        self.assertEqual(calls[0].kwargs['params']['filter'], [{'type': 'iframe'}, {'type': 'worker'}, {'exclude': True}])
        self.assertTrue(calls[0].kwargs['params']['waitForDebuggerOnStart'])
        self.assertTrue(all('waitForDebuggerOnStart' not in call.kwargs['params'] for call in calls[1:]))

    def test_owned_dedicated_worker_resumes_then_detaches_without_sdk_or_page_ownership(self):
        scope, _, _, attach = self.fixture()
        attach('owned', 'page-a', 'page')
        with patch.object(scope, '_frame_admission_required', return_value=True):
            attach('worker', 'worker-a', 'worker', 'owned')
        calls = []
        async def resume(**kwargs): calls.append(('resume', kwargs['session_id']))
        async def detach(**kwargs): calls.append(('detach', kwargs['params']['sessionId']))
        scope.browser._cdp_client_root = SimpleNamespace(send=SimpleNamespace(
            Runtime=SimpleNamespace(runIfWaitingForDebugger=resume), Target=SimpleNamespace(detachFromTarget=detach)))
        original = AsyncMock()
        event = {'sessionId': 'worker', 'targetInfo': {'type': 'worker', 'targetId': 'worker-a'}, 'waitingForDebugger': True}
        asyncio.run(scope._attach_owned(None, original, event))
        self.assertEqual(calls, [('resume', 'worker'), ('detach', 'worker')])
        original.assert_not_awaited()
        self.assertEqual(scope.owned, {'page-a'})
        self.assertEqual(set(scope.related_sessions), {'owned'})
        self.assertFalse(scope.worker_passthrough)

    def test_foreign_and_shared_workers_are_never_resumed_or_detached(self):
        scope, _, _, attach = self.fixture()
        attach('owned', 'page-a', 'page')
        original = AsyncMock()
        async def run():
            for sid, kind, parent in [('foreign', 'worker', 'foreign-page'),
                                      ('shared', 'shared_worker', 'owned'), ('sw', 'service_worker', 'owned')]:
                attach(sid, sid, kind, parent)
                await scope._attach_owned(None, original, {'sessionId': sid,
                    'targetInfo': {'type': kind, 'targetId': sid}, 'waitingForDebugger': True})
        asyncio.run(run())
        original.assert_not_awaited()
        self.assertFalse(scope.worker_passthrough)

    def test_parent_detach_revokes_pending_worker_passthrough(self):
        scope, callbacks, _, attach = self.fixture()
        attach('owned', 'page-a', 'page')
        with patch.object(scope, '_frame_admission_required', return_value=True):
            attach('worker', 'worker-a', 'worker', 'owned')
        callbacks['detached']({'sessionId': 'owned'})
        original = AsyncMock()
        asyncio.run(scope._attach_owned(None, original, {'sessionId': 'worker',
            'targetInfo': {'type': 'worker', 'targetId': 'worker-a'}, 'waitingForDebugger': True}))
        original.assert_not_awaited()
        self.assertFalse(scope.worker_passthrough)

    def test_admission_failure_never_resumes_the_paused_frame(self):
        scope, _, _, attach = self.fixture()
        attach('owned', 'page-a', 'page'); attach('child', 'frame-a', 'iframe', 'owned')
        resume, gate = AsyncMock(), SimpleNamespace(failure=None)
        scope.browser._cdp_client_root = SimpleNamespace(send=SimpleNamespace(
            Runtime=SimpleNamespace(runIfWaitingForDebugger=resume), Fetch=SimpleNamespace(_bat_access=gate)))
        manager = SimpleNamespace(get_all_sessions_for_target=lambda _: [SimpleNamespace(session_id='child')])
        original = AsyncMock()
        event = {'sessionId': 'child', 'targetInfo': {'type': 'iframe', 'targetId': 'frame-a'}, 'waitingForDebugger': True}
        async def run():
            with patch.object(scope, '_frame_admission_required', return_value=True), \
                    patch('browser_use_runner.target_scope.attach_access', AsyncMock(side_effect=RuntimeError('broken-state'))):
                with self.assertRaisesRegex(RuntimeError, 'broken-state'):
                    await scope._attach_owned(manager, original, event)
        asyncio.run(run())
        self.assertFalse(original.call_args.args[0]['waitingForDebugger'])
        resume.assert_not_awaited()
        self.assertEqual(gate.failure, 'capture_access_state_unavailable')


if __name__ == '__main__': unittest.main()
