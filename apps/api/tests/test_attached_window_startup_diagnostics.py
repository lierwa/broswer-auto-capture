"""Attached startup failures retain bounded causes, never SDK messages or private data."""
import io
import json
import tempfile
import unittest
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.diagnostic_channel import DiagnosticChannel


def wrapped_timeout():
    try:
        raise TimeoutError('private CDP message https://private.invalid/ Cookie=private')
    except TimeoutError as cause:
        try:
            raise RuntimeError('private SDK handshake detail') from cause
        except RuntimeError as error:
            return error


class AttachedStartupDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='bat-attached-diagnostic-')
        self.addCleanup(directory.cleanup)
        self.diagnostics = DiagnosticChannel()
        self.diagnostics.channel = io.StringIO()
        self.window = AttachedWindow(Path(directory.name) / 'profile', uuid4(),
                                     'ws://127.0.0.1:12345/devtools/browser/fixture',
                                     diagnostic=self.diagnostics.emit)
        self.window.close = AsyncMock()
        self.browser = SimpleNamespace(id='fixture-session', start=AsyncMock(),
                                       get_or_create_cdp_session=AsyncMock(),
                                       cdp_client=SimpleNamespace(send=SimpleNamespace(
                                           Target=SimpleNamespace(activateTarget=AsyncMock()))))
        self.scope = SimpleNamespace(install=Mock(), require_focus=Mock(return_value='fixture-target'), close=Mock())

    def records(self):
        return list(map(json.loads, self.diagnostics.channel.getvalue().splitlines()))

    async def start(self):
        with patch.object(self.window, '_browser', return_value=self.browser), \
                patch('browser_use_runner.attached_window.AttachedStartupBudget', return_value=nullcontext()), \
                patch('browser_use_runner.attached_window.TargetScope', return_value=self.scope):
            return await self.window.start(resume=False, allowed_domains=['fixture.invalid'])

    async def test_sdk_connect_retains_original_exception_and_bounded_safe_causes(self):
        error = wrapped_timeout()
        self.browser.start.side_effect = error
        with self.assertRaises(RuntimeError) as raised:
            await self.start()
        self.assertIs(raised.exception, error)
        self.window.close.assert_awaited_once_with(self.browser)
        failures = [event for event in self.records() if event['status'] == 'failed']
        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0]['stage'], 'sdk_connect')
        self.assertEqual([cause['errorKind'] for cause in failures[0]['causes']],
                         ['runtime_error', 'timeout_error'])
        self.assertTrue(all(cause['code'] == 'external_error' for cause in failures[0]['causes']))
        self.assertNotIn('private', self.diagnostics.channel.getvalue())
        self.assertNotIn(str(self.window.profile_path), self.diagnostics.channel.getvalue())

    async def test_reserve_failure_is_not_reported_as_sdk_connect_and_does_not_cleanup(self):
        with patch.object(self.window, '_reserve', side_effect=ValueError('hybrid_attached_window_busy')):
            with self.assertRaisesRegex(ValueError, '^hybrid_attached_window_busy$'):
                await self.start()
        event = self.records()[-1]
        self.assertEqual({key: event[key] for key in ('phase', 'status', 'stage')},
                         {'phase': 'attached_startup', 'status': 'failed', 'stage': 'reserve'})
        self.assertEqual(event['causes'][0]['errorKind'], 'value_error')
        self.assertEqual(event['causes'][0]['code'], 'hybrid_attached_window_busy')
        self.assertEqual([location['source'] for location in event['causes'][0]['locations']],
                         ['bat_attached_window'])
        self.browser.start.assert_not_awaited()
        self.window.close.assert_not_awaited()

    async def test_task_focus_failure_has_distinct_stage_after_sdk_connected(self):
        self.browser.get_or_create_cdp_session.side_effect = ValueError('hybrid_attached_window_target_missing')
        with self.assertRaises(ValueError):
            await self.start()
        records = self.records()
        self.assertIn({'phase': 'attached_startup', 'status': 'completed', 'stage': 'sdk_connect'}, records)
        self.assertEqual(records[-1]['stage'], 'task_target_focus')
        self.assertEqual(records[-1]['causes'][0]['code'], 'hybrid_attached_window_target_missing')

    async def test_target_preparation_inside_sdk_connect_has_its_own_fixed_stage(self):
        error = wrapped_timeout()
        self.window._create = AsyncMock(side_effect=error)

        async def sdk_start():
            await self.window._prepare_targets(SimpleNamespace())

        self.browser.start.side_effect = sdk_start
        with self.assertRaises(RuntimeError):
            await self.start()
        stages = [event['stage'] for event in self.records() if event['status'] == 'failed']
        self.assertEqual(stages, ['task_target_prepare', 'sdk_connect'])
        self.window._create.assert_awaited_once()

    async def test_success_records_fixed_stage_completion_without_values(self):
        result = await self.start()
        self.assertIs(result, self.browser)
        self.assertEqual(self.records(), [{'phase': 'attached_startup', 'status': status, 'stage': stage}
            for stage in ('reserve', 'sdk_connect', 'task_target_focus')
            for status in ('started', 'completed')])
        self.window.close.assert_not_awaited()

    async def test_broken_diagnostic_sink_cannot_change_startup_result(self):
        self.window.diagnostic = Mock(side_effect=OSError('private diagnostic sink failure'))
        self.assertIs(await self.start(), self.browser)
        self.window.close.assert_not_awaited()

    async def test_long_or_cyclic_cause_chain_is_bounded_and_unknown_class_name_never_persists(self):
        error = type('private_account_type', (Exception,), {})('private first')
        current = error
        for _ in range(8):
            cause = RuntimeError('private nested')
            current.__cause__ = cause
            current = cause
        current.__cause__ = error
        self.browser.start.side_effect = error
        with self.assertRaises(Exception):
            await self.start()
        causes = self.records()[-1]['causes']
        self.assertEqual(len(causes), 4)
        self.assertEqual(causes[0]['errorKind'], 'other_error')
        self.assertNotIn('private', self.diagnostics.channel.getvalue())

    def test_channel_rejects_unknown_fields_codes_kinds_stages_and_unbounded_chain(self):
        cause = {'errorKind': 'runtime_error', 'code': 'external_error', 'locations': []}
        event = {'phase': 'attached_startup', 'status': 'failed', 'stage': 'sdk_connect', 'causes': [cause]}
        self.diagnostics.emit(event)
        for invalid in ({**event, 'raw': 'private'}, {**event, 'stage': 'private'},
                        {**event, 'causes': [{**cause, 'code': 'private'}]},
                        {**event, 'causes': [{**cause, 'errorKind': 'private'}]},
                        {**event, 'causes': [cause] * 5},
                        {**event, 'causes': [{**cause, 'locations': [{'source': 'private', 'line': 1}]}]},
                        {**event, 'causes': [{**cause, 'locations': [{'source': 'bat_attached_window',
                            'line': 1, 'path': '/private'}]}]},
                        {**event, 'status': 'completed'}):
            self.diagnostics.emit(invalid)
        self.assertEqual(self.records(), [event])

    def test_existing_focus_diagnostics_are_aligned_with_host_fixed_schema(self):
        self.assertTrue(DiagnosticChannel._runtime_check({'kind': 'focused_element', 'attempts': 1}))
        self.assertTrue(DiagnosticChannel._runtime_check({'kind': 'target_state', 'attempts': 1,
                         'expected': {'focused': True}, 'actual': {'focused': False}}))
        self.assertFalse(DiagnosticChannel._runtime_check({'kind': 'target_state', 'attempts': 1,
                          'expected': {'focused': 'private'}, 'actual': {'focused': False}}))


if __name__ == '__main__':
    unittest.main()
