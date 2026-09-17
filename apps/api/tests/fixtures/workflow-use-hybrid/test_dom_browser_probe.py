"""Opt-in single-Browser acceptance for the DOM target adapter; no model or external site."""
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from browser_use import Browser
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.targets import TARGET_ORDINAL_ARGUMENT


RECORDS = b'''<!doctype html><title>Records</title><main>
<section class="results active"><div class="wrapper">
  <article class="item"><div class="content"><a class="title" href="/detail/alpha">Alpha</a></div></article>
  <article class="item"><div class="content"><a class="title" href="/detail/beta">Beta</a></div></article>
</div></section>
<button id="ready" onclick="setTimeout(() => { document.title='Ready'; document.querySelector('#state').textContent='ready' }, 40)">Load</button>
<output id="state">idle</output>
<section id="choice-list">
  <article class="choice-item" tabindex="0" onclick="document.querySelector('#choice').textContent='root:1'">
    <button class="choice-title" onclick="event.stopPropagation();document.querySelector('#choice').textContent='title:1'">First title</button>
  </article>
  <article class="choice-item" tabindex="0" onclick="document.querySelector('#choice').textContent='root:2'">
    <button class="choice-title" onclick="event.stopPropagation();document.querySelector('#choice').textContent='title:2'">Second title</button>
  </article>
</section><output id="choice">none</output></main>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = RECORDS if self.path.startswith('/records') else (
            f'<!doctype html><title>Detail</title><main data-path="{self.path}">{self.path}</main>'.encode())
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


@unittest.skipUnless(os.environ.get('BAT_REAL_DOM_TARGET_TEST') == '1', 'explicit single-Browser probe required')
class DomBrowserProbe(unittest.IsolatedAsyncioTestCase):
    async def test_structure_scope_runtime_ordinal_and_async_postcondition(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin, browser = f'http://127.0.0.1:{server.server_port}', None
        try:
            with tempfile.TemporaryDirectory(prefix='bat-dom-target-') as profile:
                browser = Browser(headless=True, use_cloud=False, keep_alive=False, user_data_dir=profile,
                                  enable_default_extensions=False,
                                  executable_path=os.environ.get('BAT_UPSTREAM_BROWSER_EXECUTABLE'))
                try:
                    await browser.start()
                    adapter = OrdinaryCapability(browser)
                    actual_act, action_count = adapter.tools.act, 0

                    async def counted_act(*args, **kwargs):
                        nonlocal action_count
                        action_count += 1
                        return await actual_act(*args, **kwargs)

                    adapter.tools.act = counted_act
                    await adapter.execute_checked('navigate', {'url': origin + '/records', 'new_tab': False}, None,
                                                   [{'kind': 'url', 'bindingArgument': 'url'}])
                    target = {'strategy': 'structure', 'scope': {'url': origin + '/records'},
                              'container': {'kind': 'css', 'value': '.results.active'},
                              'items': {'kind': 'css', 'value': '.wrapper > .item'}, 'ordinal': 1,
                              'ordinalBinding': {'source': 'input', 'path': ['itemOrdinal']},
                              'withinItem': {'kind': 'css', 'value': '.content > a.title'}}
                    await adapter.execute_checked('click', {TARGET_ORDINAL_ARGUMENT: 2}, target,
                                                   [{'kind': 'url', 'equals': origin + '/detail/beta'}])
                    await adapter.execute_checked('navigate', {'url': origin + '/records', 'new_tab': False}, None,
                                                   [{'kind': 'url', 'bindingArgument': 'url'}])
                    readiness = [{'kind': 'title', 'equals': 'Ready',
                                  'settle': {'maxMs': 1000, 'maxAttempts': 20, 'intervalMs': 25}}]
                    await adapter.execute_checked('click', {}, {'strategy': 'css', 'value': '#ready'}, readiness)
                    wrong_scope = {'strategy': 'css', 'scope': {'url': origin + '/wrong'}, 'value': '#ready'}
                    with self.assertRaisesRegex(ValueError, 'target_scope_mismatch'):
                        await adapter.execute('click', {}, wrong_scope)
                    base = {'strategy': 'structure', 'scope': {'url': origin + '/records'},
                            'container': {'kind': 'css', 'value': '#choice-list'},
                            'items': {'kind': 'css', 'value': '.choice-item'}, 'ordinal': 1,
                            'ordinalBinding': {'source': 'input', 'path': ['itemOrdinal']}}
                    root_target = {**base, 'withinItem': None}
                    title_target = {**base, 'withinItem': {'kind': 'css', 'value': '.choice-title'}}
                    await adapter.execute('click', {TARGET_ORDINAL_ARGUMENT: 1}, root_target)
                    self.assertEqual(await self._choice(browser), 'root:1')
                    await adapter.execute('click', {TARGET_ORDINAL_ARGUMENT: 2}, title_target)
                    self.assertEqual(await self._choice(browser), 'title:2')
                    actions_before_overflow = action_count
                    with self.assertRaisesRegex(ValueError, 'target_position_unavailable'):
                        await adapter.execute('click', {TARGET_ORDINAL_ARGUMENT: 3}, root_target)
                    self.assertEqual(action_count, actions_before_overflow)
                    self.assertEqual(await self._choice(browser), 'title:2')
                    self.assertEqual(actions_before_overflow, 6)
                finally:
                    await browser.kill()
                    browser = None
        finally:
            if browser is not None:
                await browser.kill()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    async def _choice(self, browser):
        page = await browser.get_current_page()
        self.assertIsNotNone(page)
        elements = await page.get_elements_by_css_selector('#choice')
        self.assertEqual(len(elements), 1)
        return await elements[0].evaluate('() => this.textContent')


if __name__ == '__main__':
    unittest.main()
