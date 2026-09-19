"""Opt-in real Chromium evidence for dialog, DOM interception, and scroll outcomes.

Product Alignment:
- natural-language task: replay an ordinary browser action when a dialog, overlay, or scroll lock may interfere.
- reusable chain boundary: one model-free browser action and browser-observed dispatch/outcome facts.
- runtime inputs: a stable target or a bounded page scroll request.
- dynamic task outputs: native-dialog state, actual DOM event target, and measured scroll state.
- generic platform capability used: browser-use Browser/Tools plus B-A-T action preparation/event capture.
- replay model calls: 0.
- site/task-specific code added: no.

Reuse Assessment:
- capability: actual pointer dispatch, JavaScript-dialog handling, and wheel scrolling.
- existing implementation in repository: browser-use 0.13.8 Browser/Tools, NativeEventCapture, TargetResolver.
- selected implementation: exercise those surfaces against real local pages in one Browser session.
- B-A-T-owned adapter and remaining gap: assert only observable browser facts; do not infer popup semantics.
- license/runtime/platform fit: existing pinned Python/Chromium environment; no new dependency or browser owner.
- browser/runtime/state ownership conflicts: one Browser and one OrdinaryCapability, both closed in finally.
- replay model calls: 0.
- rejected candidates and evidence: mocks cannot establish CDP dialog, event.target, or wheel/scroll behavior.
- focused validation: BAT_REAL_BROWSER_TEST=1 runs this file directly.
"""
import asyncio
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from browser_use import Browser

from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.target_preparation import inspect_action_target, verify_event_target


PAGE = r'''<!doctype html>
<meta charset="utf-8"><title>Interference fixture</title>
<style>
  body { margin: 0; font: 16px sans-serif; }
  button { width: 220px; height: 48px; }
  #underlay { position: fixed; left: 40px; top: 90px; }
  #overlay { position: fixed; left: 120px; top: 90px; width: 60px; height: 48px;
    z-index: 20; background: rgba(30, 30, 30, .85); color: white; }
  .spacer { height: 2400px; }
</style>
<button id="native" onclick="this.textContent = confirm('native-confirm') ? 'accepted' : 'dismissed'">Native confirm</button>
<output id="native-result">pending</output>
<button id="underlay" onclick="window.__underlayClicks++">Underlying target</button>
<div id="overlay" role="dialog" aria-modal="true">DOM overlay</div>
<div class="spacer"></div>
<script>
  window.__underlayClicks = 0;
  window.__events = [];
  window.__scrollEvents = 0;
  window.__wheelEvents = 0;
  window.__preventedWheelEvents = 0;
  document.addEventListener('click', event => window.__events.push({
    target: event.target.id || event.target.localName,
    x: event.clientX,
    y: event.clientY,
    trusted: event.isTrusted,
  }), true);
  addEventListener('scroll', () => window.__scrollEvents++, true);
  addEventListener('wheel', event => {
    window.__wheelEvents++;
    if (location.pathname === '/scroll/event-locked') {
      event.preventDefault();
      window.__preventedWheelEvents++;
    }
  }, {capture: true, passive: false});
  if (!location.pathname.startsWith('/overlay')) document.querySelector('#overlay').remove();
  if (location.pathname === '/overlay/full') {
    Object.assign(document.querySelector('#overlay').style, {
      left: '20px', top: '60px', width: 'calc(100vw - 40px)', height: '120px'
    });
  }
  if (location.pathname.startsWith('/scroll/')) {
    document.querySelector('#underlay').remove();
  }
  if (location.pathname === '/scroll/short') document.querySelector('.spacer').style.height = '10px';
  if (location.pathname === '/scroll/css-locked') {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
</script>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(PAGE.encode('utf-8'))

    def log_message(self, *_):
        pass


async def page_json(page, expression):
    return json.loads(await page.evaluate(expression))


async def scroll_state(page):
    return await page_json(page, r'''() => ({
      y: scrollY,
      maxY: Math.max(0, document.scrollingElement.scrollHeight - innerHeight),
      rootOverflow: getComputedStyle(document.documentElement).overflowY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      scrollEvents: window.__scrollEvents,
      wheelEvents: window.__wheelEvents,
      preventedWheelEvents: window.__preventedWheelEvents,
    })''')


@unittest.skipUnless(os.environ.get('BAT_REAL_BROWSER_TEST') == '1', 'explicit real-browser test required')
class InterferenceBrowserAcceptance(unittest.IsolatedAsyncioTestCase):
    async def test_real_dialog_dom_hit_and_scroll_outcomes(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        browser = None
        try:
            with tempfile.TemporaryDirectory(prefix='bat-interference-browser-') as profile:
                browser = Browser(
                    headless=True, use_cloud=False, keep_alive=False, user_data_dir=profile,
                    enable_default_extensions=False,
                    executable_path=os.environ.get('BAT_UPSTREAM_BROWSER_EXECUTABLE'))
                try:
                    await browser.start()
                    adapter = OrdinaryCapability(browser)
                    await self._native_dialog(adapter, browser, origin)
                    await self._dom_overlay(adapter, browser, origin)
                    await self._scroll_outcomes(adapter, browser, origin)
                    await adapter.close()
                finally:
                    await browser.kill()
                    browser = None
        finally:
            if browser is not None:
                await browser.kill()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    async def _navigate(self, adapter, url):
        await adapter.execute_checked(
            'navigate', {'url': url, 'new_tab': False}, None,
            [{'kind': 'url', 'bindingArgument': 'url'}])

    async def _native_dialog(self, adapter, browser, origin):
        await self._navigate(adapter, origin + '/native')
        async with asyncio.timeout(15):
            await adapter.execute_checked(
                'click', {}, {'strategy': 'css', 'value': '#native'},
                [{'kind': 'target_text', 'changed': True,
                  'settle': {'maxMs': 5000, 'maxAttempts': 20, 'intervalMs': 100}}])
        page = await browser.get_current_page()
        native_result = await page.evaluate("() => document.querySelector('#native').textContent")
        self.assertIn(native_result, ('accepted', 'dismissed'))
        summary = await browser.get_browser_state_summary()
        messages = [str(value) for value in (getattr(summary, 'closed_popup_messages', None) or [])]
        matching = [message for message in messages if 'native-confirm' in message]
        self.assertEqual(len(matching), 1, messages)

    async def _dom_overlay(self, adapter, browser, origin):
        target = {'strategy': 'css', 'value': '#underlay'}
        await self._navigate(adapter, origin + '/overlay/full')
        page, mapping, target_id = await adapter.targets._snapshot(None)
        with self.assertRaisesRegex(ValueError, '^missing_stable_target$'):
            await adapter.targets._resolve_index(target, page, mapping, target_id)

        before_summary = await browser.get_browser_state_summary()
        native_messages = list(getattr(before_summary, 'closed_popup_messages', None) or [])
        await self._navigate(adapter, origin + '/overlay')
        element = await adapter.targets.resolve_element(target)
        state = await inspect_action_target(element)
        self.assertEqual(state['hitRelation'], 'outside')

        page, mapping, target_id = await adapter.targets._snapshot(None)
        index = await adapter.targets._resolve_index(target, page, mapping, target_id)
        await adapter.event_capture.arm('click', element=element)
        action = adapter.registry.validate_action('click', {'index': index})
        result = await adapter.tools.act(action, browser_session=browser, page_extraction_llm=None)
        capture = await adapter.event_capture.complete()
        self.assertFalse(result.error)
        relations = [event['graph']['intentRelation'] for event in capture['events']]
        observed = await page_json(page, '() => ({events:window.__events, underlayClicks:window.__underlayClicks})')
        self.assertEqual(verify_event_target(capture), 1)
        self.assertEqual(relations, ['self'])
        self.assertEqual(observed['underlayClicks'], 1)
        self.assertEqual(observed['events'][-1], {
            'target': 'underlay', 'x': 0, 'y': 0, 'trusted': False})

        center = await page_json(element, '''() => {
          const rect = this.getBoundingClientRect();
          return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
        }''')
        await adapter.event_capture.arm('click', element=element)
        session = await browser.get_or_create_cdp_session()
        common = {'x': center['x'], 'y': center['y'], 'button': 'left', 'clickCount': 1}
        await session.cdp_client.send.Input.dispatchMouseEvent(
            params={'type': 'mousePressed', **common}, session_id=session.session_id)
        await session.cdp_client.send.Input.dispatchMouseEvent(
            params={'type': 'mouseReleased', **common}, session_id=session.session_id)
        physical_capture = await adapter.event_capture.complete()
        with self.assertRaisesRegex(RuntimeError, '^ordinary_event_target_mismatch$'):
            verify_event_target(physical_capture)
        physical = await page_json(page, '() => ({events:window.__events, underlayClicks:window.__underlayClicks})')
        self.assertEqual(physical['underlayClicks'], 1)
        self.assertEqual(physical['events'][-1]['target'], 'overlay')
        self.assertTrue(physical['events'][-1]['trusted'])
        after_summary = await browser.get_browser_state_summary()
        self.assertEqual(list(getattr(after_summary, 'closed_popup_messages', None) or []), native_messages)

    async def _scroll_outcomes(self, adapter, browser, origin):
        await self._navigate(adapter, origin + '/scroll/normal')
        page = await browser.get_current_page()
        normal_before = await scroll_state(page)
        normal_result = await adapter.execute('scroll', {'down': True, 'pages': 1.0})
        normal_after = await scroll_state(page)
        self.assertFalse(normal_result.error)
        self.assertGreater(normal_after['y'], normal_before['y'])
        self.assertGreater(normal_after['scrollEvents'], normal_before['scrollEvents'])
        self.assertEqual(normal_result.metadata['batScrollDispatch']['reason'], 'moved')

        await self._navigate(adapter, origin + '/scroll/short')
        page = await browser.get_current_page()
        short_before = await scroll_state(page)
        short_result = await adapter.execute('scroll', {'down': True, 'pages': 1.0})
        short_after = await scroll_state(page)
        self.assertFalse(short_result.error)
        self.assertEqual(short_before['maxY'], 0)
        self.assertEqual(short_after['y'], short_before['y'])
        self.assertEqual(short_result.metadata['batScrollDispatch']['reason'], 'no_scroll_range')

        await self._navigate(adapter, origin + '/scroll/boundary')
        page = await browser.get_current_page()
        await page.evaluate('() => scrollTo(0, document.scrollingElement.scrollHeight)')
        boundary_before = await scroll_state(page)
        boundary_result = await adapter.execute('scroll', {'down': True, 'pages': 1.0})
        boundary_after = await scroll_state(page)
        self.assertFalse(boundary_result.error)
        self.assertGreater(boundary_before['maxY'], 0)
        self.assertEqual(boundary_before['y'], boundary_before['maxY'])
        self.assertEqual(boundary_after['y'], boundary_before['y'])
        self.assertEqual(boundary_result.metadata['batScrollDispatch']['reason'], 'at_boundary')

        await self._navigate(adapter, origin + '/scroll/css-locked')
        page = await browser.get_current_page()
        css_before = await scroll_state(page)
        css_result = await adapter.execute('scroll', {'down': True, 'pages': 1.0})
        css_after = await scroll_state(page)
        self.assertFalse(css_result.error)
        self.assertGreater(css_before['maxY'], 0)
        self.assertEqual(css_after['y'], css_before['y'])
        self.assertGreater(css_after['wheelEvents'], css_before['wheelEvents'])
        self.assertEqual(css_after['preventedWheelEvents'], css_before['preventedWheelEvents'])
        self.assertEqual(css_after['rootOverflow'], 'hidden')
        self.assertEqual(css_result.metadata['batScrollDispatch']['reason'], 'css_overflow_locked')

        await self._navigate(adapter, origin + '/scroll/event-locked')
        page = await browser.get_current_page()
        event_before = await scroll_state(page)
        with self.assertRaisesRegex(RuntimeError, '^ordinary_scroll_event_cancelled$'):
            await adapter.execute_checked(
                'scroll', {'down': True, 'pages': 1.0}, None,
                [{'kind': 'scroll_position', 'changed': True,
                  'settle': {'maxMs': 500, 'maxAttempts': 3, 'intervalMs': 100}}])
        event_after = await scroll_state(page)
        self.assertEqual(event_after['y'], event_before['y'])
        self.assertGreater(event_after['wheelEvents'], event_before['wheelEvents'])
        self.assertGreater(event_after['preventedWheelEvents'], event_before['preventedWheelEvents'])
        self.assertNotEqual(event_after['rootOverflow'], 'hidden')


if __name__ == '__main__':
    unittest.main()
