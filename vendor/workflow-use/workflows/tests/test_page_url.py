"""Protect real clicked entry evidence without an href or model-generated URL."""
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from browser_use import BrowserSession, Tools
from workflow_use.hybrid.method_read_tool import MethodReadToolParams, register_method_read_tool
from workflow_use.hybrid.read import read_fields


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = (b'<button id="entry" onclick="location.assign(\'/detail/1\')">Open</button>'
                if self.path == '/list' else b'<main>Actual detail</main>')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


@unittest.skipUnless(os.environ.get('BAT_RUN_CONTENT_PROBE') == '1', 'explicit real browser probe required')
class PageUrlTests(unittest.IsolatedAsyncioTestCase):
    async def test_clicked_document_url_reuses_verified_read(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        executable = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
        schema = {'type': 'array', 'maxItems': 5, 'items': {'type': 'object',
            'properties': {'__batRecordEntry': {'type': 'string'}, '__batRecordKey': {'type': 'string'}},
            'required': ['__batRecordEntry', '__batRecordKey'], 'additionalProperties': False}}
        try:
            await browser.start()
            tools = Tools()
            records = register_method_read_tool(tools, output_schema=schema)
            tool = tools.registry.registry.actions['bat_read_fields']
            page = await browser.get_current_page()
            await page.goto(f'http://127.0.0.1:{server.server_port}/list')
            self.assertEqual(await page.get_elements_by_css_selector('a[href]'), [])
            await (await page.get_elements_by_css_selector('#entry'))[0].click()
            for index in (1, 2):
                if index == 2:
                    await page.goto(f'http://127.0.0.1:{server.server_port}/detail/2')
                params = MethodReadToolParams(outputPath=[], container='html', fields={
                    '__batRecordEntry': {'selector': ':scope', 'valueSource': 'page-url'}}) if index == 1 else MethodReadToolParams(readRef='r1')
                result = await tool.function(params=params, browser_session=browser)
                self.assertIsNone(result.error)
                record = records.records[-1]
                output = await read_fields(browser, record.mapping.specification)
                self.assertEqual(output[0]['__batRecordEntry'], await page.get_url())
                self.assertTrue(output[0]['__batRecordEntry'].endswith(f'/detail/{index}'))
                self.assertTrue(output[0]['__batRecordKey'])
                self.assertEqual(record.mapping.specification.fields['__batRecordEntry'].valueSource, 'page-url')
        finally:
            await browser.kill()
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
