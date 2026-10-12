"""A hidden-page frame barrier must never dispatch after timeout or identity loss."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.capability import OrdinaryCapability


class KeyboardFrameTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self, visibility='hidden'):
        page = SimpleNamespace(evaluate=AsyncMock(return_value=visibility))
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=page),
                                  take_screenshot=AsyncMock(return_value=b'private-image'))
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.browser = browser
        capability.targets = SimpleNamespace(assert_scope=AsyncMock(return_value='owned-target'))
        prepared = SimpleNamespace(target_id='owned-target', document_id='document-1')
        return capability, browser, prepared

    async def test_visible_keyboard_and_dom_actions_do_not_capture(self):
        capability, browser, prepared = self.fixture('visible')
        await capability._prepare_native_frame('input', prepared)
        await capability._prepare_native_frame('send_keys', None)
        await capability._prepare_native_frame('click', prepared)
        browser.take_screenshot.assert_not_awaited()

    async def test_hidden_keyboard_uses_one_nonpersistent_native_capture(self):
        capability, browser, prepared = self.fixture()
        with patch('workflow_use.hybrid.capability.current_document_id', AsyncMock(return_value='document-1')):
            await capability._prepare_native_frame('input', prepared)
        browser.take_screenshot.assert_awaited_once_with(full_page=False)
        self.assertEqual(capability.targets.assert_scope.await_count, 2)

    async def test_changed_document_is_rejected(self):
        capability, browser, prepared = self.fixture()
        with patch('workflow_use.hybrid.capability.current_document_id',
                   AsyncMock(side_effect=['document-1', 'document-2'])):
            with self.assertRaisesRegex(ValueError, 'target_document_changed'):
                await capability._prepare_native_frame('input', prepared)
        browser.take_screenshot.assert_awaited_once()

    async def test_target_switch_is_rejected(self):
        capability, browser, prepared = self.fixture()
        capability.targets.assert_scope.side_effect = ['owned-target', ValueError('target_scope_mismatch')]
        with patch('workflow_use.hybrid.capability.current_document_id', AsyncMock(return_value='document-1')):
            with self.assertRaisesRegex(ValueError, 'target_scope_mismatch'):
                await capability._prepare_native_frame('input', prepared)

    async def test_capture_timeout_propagates_without_retry(self):
        capability, browser, prepared = self.fixture()
        browser.take_screenshot.side_effect = TimeoutError('native capture timeout')
        with patch('workflow_use.hybrid.capability.current_document_id', AsyncMock(return_value='document-1')):
            with self.assertRaises(TimeoutError):
                await capability._prepare_native_frame('input', prepared)
        browser.take_screenshot.assert_awaited_once()

    async def test_scroll_events_finish_only_after_native_frame(self):
        capability, browser, _ = self.fixture()
        order = []
        async def dispatch():
            order.append('dispatch')
            return SimpleNamespace(error=None)
        async def frame(**_):
            order.append('frame')
            return b'private-image'
        async def complete():
            order.append('complete')
            return {'status': 'captured', 'events': [], 'limitations': []}
        capability.event_capture = SimpleNamespace(arm=AsyncMock(), complete=complete)
        browser.take_screenshot.side_effect = frame
        with patch('workflow_use.hybrid.capability.current_document_id', AsyncMock(return_value='document-1')):
            await capability._dispatch_captured('scroll', dispatch)
        self.assertEqual(order, ['dispatch', 'frame', 'complete'])

    async def test_scroll_capture_is_closed_when_frame_fails(self):
        capability, browser, _ = self.fixture()
        dispatch = AsyncMock(return_value=SimpleNamespace(error=None))
        capability.event_capture = SimpleNamespace(arm=AsyncMock(), complete=AsyncMock(
            return_value={'status': 'missing', 'events': [], 'limitations': []}))
        browser.take_screenshot.side_effect = TimeoutError('native capture timeout')
        with patch('workflow_use.hybrid.capability.current_document_id', AsyncMock(return_value='document-1')):
            with self.assertRaises(TimeoutError):
                await capability._dispatch_captured('scroll', dispatch)
        dispatch.assert_awaited_once()
        capability.event_capture.complete.assert_awaited_once()


if __name__ == '__main__':
    unittest.main()
