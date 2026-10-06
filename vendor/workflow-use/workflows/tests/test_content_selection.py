"""Selected regions exclude sibling controls while legacy ancestor capture remains readable."""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from browser_use import BrowserSession, Tools
from workflow_use.hybrid.method_read_tool import ContentReadToolParams, register_method_read_tool
from workflow_use.hybrid.page_content import CONTENT_SCHEMA
from workflow_use.hybrid.read import read_fields


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'''<title>Local document</title><main>
        <h1 id="heading">Requested title</h1><button>Sibling toolbar noise</button>
        <section id="body"><p>Requested text <a href="/reference">Reference link</a></p>
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3C/svg%3E"></section>
        <footer>Unselected footer</footer></main>'''
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


@unittest.skipUnless(os.environ.get('BAT_RUN_FOUNDATION_PROBE') == '1', 'explicit headless probe required')
class ContentSelectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_selected_regions_preserve_content_and_images_without_ancestor_siblings(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        executable = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
        try:
            await browser.start()
            page = await browser.get_current_page()
            await page.goto(f'http://127.0.0.1:{server.server_port}/document')
            tools = Tools()
            records = register_method_read_tool(tools, output_schema=CONTENT_SCHEMA, capture_content=True)
            tool = tools.registry.registry.actions['bat_read_fields']
            params = ContentReadToolParams(regions='#heading, #body, #body p')
            result = await tool.function(params=params, browser_session=browser)
            self.assertIsNone(result.error)
            spec = records.records[-1].mapping.specification
            output = json.loads((await read_fields(browser, spec))['content'])
            for field in ('html', 'markdown', 'textPreview'):
                self.assertIn('Requested title', output[field])
                self.assertIn('Requested text', output[field])
                self.assertNotIn('Sibling toolbar noise', output[field])
                self.assertNotIn('Unselected footer', output[field])
                self.assertEqual(output[field].count('Requested text'), 1)
            self.assertEqual(len(output['images']), 1)
            self.assertIn('Reference link', output['markdown'])
            legacy = spec.model_copy(update={'contentRegion': 'common-ancestor'})
            self.assertIn('Sibling toolbar noise', json.loads((await read_fields(browser, legacy))['content'])['html'])
        finally:
            await browser.kill()
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
