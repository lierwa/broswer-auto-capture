"""Protect the native Mouse boundary: no coordinate coercion, foreign target, or repeated click."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.actor.page import Page

from workflow_use.hybrid.physical_input import dispatch_physical_click


def fixture(*, x=40.5, y=90.25, focus='owned', page_target='owned', fail=None):
    events = []
    failure = RuntimeError('controlled_cdp_failure')

    async def dispatch(params, session_id):
        events.append((dict(params), session_id))
        if fail == params['type'] and sum(p['type'] == fail for p, _ in events) == 1:
            raise failure

    client = SimpleNamespace(send=SimpleNamespace(
        Input=SimpleNamespace(dispatchMouseEvent=dispatch),
        Target=SimpleNamespace(getTargetInfo=AsyncMock(return_value={'targetInfo': {'targetId': page_target}}))))
    browser = SimpleNamespace(cdp_client=client, agent_focus_target_id=focus)
    session = SimpleNamespace(cdp_client=client, session_id='owned-session')
    page = Page(browser, target_id='owned', session_id=session.session_id)
    browser.get_current_page = AsyncMock(return_value=page)
    browser.get_or_create_cdp_session = AsyncMock(return_value=session)
    prepared = SimpleNamespace(coordinate_scope='top', center_x=x, center_y=y,
        viewport_width=800, viewport_height=600, target_id='owned', frame_id='frame',
        document_id='document')
    return browser, prepared, events, failure


class PhysicalInputReuseTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_native_mouse_preserves_values_and_single_dispatch(self):
        for x, y in [(40, 90), (40.5, 90.25)]:
            with self.subTest(point=(x, y)):
                browser, prepared, events, _ = fixture(x=x, y=y)
                result = await dispatch_physical_click(browser, prepared)
                self.assertEqual([p['type'] for p, _ in events],
                                 ['mouseMoved', 'mousePressed', 'mouseReleased'])
                self.assertEqual({(p['x'], p['y'], session) for p, session in events},
                                 {(x, y, 'owned-session')})
                self.assertEqual(result.metadata['batPhysicalInput']['point'], {'x': x, 'y': y})
                browser.get_or_create_cdp_session.assert_awaited_once_with(target_id='owned', focus=False)

    async def test_changed_focus_or_page_refuses_before_mouse_dispatch(self):
        for values in [{'focus': 'other'}, {'page_target': 'other'}]:
            with self.subTest(values=values):
                browser, prepared, events, _ = fixture(**values)
                with self.assertRaisesRegex(ValueError, '^physical_input_target_changed$'):
                    await dispatch_physical_click(browser, prepared)
                self.assertEqual(events, [])
                browser.get_or_create_cdp_session.assert_not_awaited()

    async def test_native_failure_preserved_and_release_does_not_repeat_click(self):
        for failed_type in ['mousePressed', 'mouseReleased']:
            with self.subTest(failed_type=failed_type):
                browser, prepared, events, failure = fixture(fail=failed_type)
                with self.assertRaises(RuntimeError) as caught:
                    await dispatch_physical_click(browser, prepared)
                self.assertIs(caught.exception, failure)
                self.assertEqual(sum(p['type'] == 'mousePressed' for p, _ in events), 1)
                self.assertEqual(events[-1][0], {'type': 'mouseReleased', 'x': 40.5, 'y': 90.25,
                                                'button': 'left', 'clickCount': 1})


if __name__ == '__main__':
    unittest.main()
