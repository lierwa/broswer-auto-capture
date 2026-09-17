"""Opt-in real local Chromium acceptance. One temporary Browser; no model or external website."""
import asyncio
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from browser_use import Browser
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.read import ReadSpec, read_fields

PAGE = b'''<!doctype html><title>Local fixture</title>
<a class="entry" href="/first"><span class="name">First</span></a>
<a class="entry" href="/second"><span class="name">Second</span></a>
<input id="value" aria-label="Value"><button id="save" onclick="document.title='Saved'">Save</button>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(PAGE)

    def log_message(self, *_):
        pass


@unittest.skipUnless(os.environ.get('BAT_REAL_BROWSER_TEST') == '1', 'explicit real-browser test required')
class BrowserAcceptance(unittest.IsolatedAsyncioTestCase):
    async def test_parameterized_navigation_positional_click_read_and_form(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        browser = None
        try:
            with tempfile.TemporaryDirectory(prefix='bat-hybrid-browser-') as profile:
                browser = Browser(headless=True, use_cloud=False, keep_alive=False, user_data_dir=profile,
                                  enable_default_extensions=False,
                                  executable_path=os.environ.get('BAT_UPSTREAM_BROWSER_EXECUTABLE'))
                try:
                    await browser.start()
                    adapter = OrdinaryCapability(browser)
                    for suffix in ('/alpha', '/beta'):
                        await adapter.execute_checked('navigate', {'url': origin + suffix, 'new_tab': False}, None,
                                                       [{'kind': 'url', 'bindingArgument': 'url'}])
                    await adapter.execute_checked('click', {}, {'strategy': 'ordinal', 'container': '.entry', 'ordinal': 2},
                                                   [{'kind': 'url', 'equals': origin + '/second'}])
                    schema = {'type': 'array', 'maxItems': 2, 'items': {'type': 'object',
                              'properties': {'name': {'type': 'string', 'maxLength': 20}},
                              'required': ['name'], 'additionalProperties': False}}
                    specification = ReadSpec(container='.entry', fields={'name': {'selector': '.name'}},
                                             maxItems=2, maxInputBytes=4000, outputSchema=schema)
                    self.assertEqual(await read_fields(browser, specification), [{'name': 'First'}, {'name': 'Second'}])
                    await adapter.execute_checked('input', {'text': 'Changed input'}, {'strategy': 'css', 'value': '#value'},
                                                   [{'kind': 'target_value', 'bindingArgument': 'text'}])
                    await adapter.execute_checked('click', {}, {'strategy': 'css', 'value': '#save'},
                                                   [{'kind': 'title', 'equals': 'Saved'}])
                    page = await browser.get_current_page()
                    self.assertEqual(await page.get_title(), 'Saved')
                finally:
                    await browser.kill()
                    browser = None
        finally:
            if browser is not None:
                await browser.kill()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
