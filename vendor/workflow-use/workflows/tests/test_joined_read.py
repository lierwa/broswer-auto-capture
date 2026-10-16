"""Protect label/icon association, current values, and exclusion of neighboring raw data."""
import asyncio
import os
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

from browser_use import BrowserSession, Tools
from test_rendered_animation import Handler
from workflow_use.hybrid.method_read_tool import register_method_read_tool
from workflow_use.hybrid.read import read_fields
from workflow_use.hybrid.author_action_helpers import normalize_author_action

SCHEMA = {'type': 'array', 'items': {'type': 'string'}}
FIXTURE = """() => {
  this.innerHTML = '<a id="logo"><strong hidden>Example</strong></a>'
    + '<meta name="application-name" content="Example">'
    + '<section class="row"><h3>One</h3><svg><use xlink:href="#status_ok"></use></svg>'
    + '<span>DO_NOT_COLLECT</span></section>'
    + '<section class="row"><h3>Two</h3><svg><use xlink:href="#status_error"></use></svg>'
    + '<span>PRIVATE_VALUE</span></section>';
  return true;
}"""


@unittest.skipUnless(os.environ.get('BAT_RUN_JOINED_PROBE') == '1', 'explicit local browser probe required')
class JoinedReadTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_tool_reads_current_parts_and_rejects_empty_text_sample(self):
        executable = ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if sys.platform == 'darwin'
                      else str(Path(os.environ.get('ProgramFiles', 'C:/Program Files'))
                               / 'Google/Chrome/Application/chrome.exe'))
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with tempfile.TemporaryDirectory(prefix='bat-joined-read-') as profile:
            Path(profile, 'Default').mkdir()
            browser = BrowserSession(headless=True, executable_path=executable, user_data_dir=profile,
                                     enable_default_extensions=False)
            try:
                await browser.start()
                page = await browser.get_current_page()
                await page.goto(f'http://127.0.0.1:{server.server_port}/')
                element = (await page.get_elements_by_css_selector('#report'))[0]
                await element.evaluate(FIXTURE)
                tools = Tools()
                native = tools.registry.registry.actions['find_elements']
                preview = await native.function(params=native.param_model.model_validate({
                    'selector': '#logo', 'include_text': True}), browser_session=browser)
                self.assertIsNone(preview.error, preview.error)
                self.assertIn('Example', preview.extracted_content)
                names = register_method_read_tool(tools, output_schema={'type': 'string'})
                action = tools.registry.registry.actions['bat_read_fields']
                empty = action.param_model.model_validate({'container': '#report', 'fields': {'value': {'selector': '#logo'}}})
                result = await action.function(params=empty, browser_session=browser)
                self.assertIn('read_sample_text_empty_unproven', result.error)
                self.assertEqual(names.records, [])
                metadata = action.param_model.model_validate({'container': '#report', 'fields': {
                    'value': {'selector': 'meta[name="application-name"]', 'attribute': 'content'}}})
                result = await action.function(params=metadata, browser_session=browser)
                self.assertIsNone(result.error, result.error)
                self.assertEqual(names.records[0].sample.output, {'value': 'Example'})
                records = register_method_read_tool(tools, output_schema=SCHEMA)
                action = tools.registry.registry.actions['bat_read_fields']
                params = action.param_model.model_validate({'container': '#report', 'fields': {'value': {
                    'selector': '.row', 'parts': [{'selector': 'h3'}, {'selector': 'svg use', 'attribute': 'xlink:href'}]}}})
                result = await action.function(params=params, browser_session=browser)
                self.assertIsNone(result.error, result.error)
                spec = records.records[0].mapping.specification
                self.assertEqual(await read_fields(browser, spec), {'value': ['One\n#status_ok', 'Two\n#status_error']})
                await element.evaluate("""() => { this.insertAdjacentHTML('beforeend',
                    '<article class="other"><h3>Three</h3><svg><use xlink:href="#status_ok"></use></svg>'
                    + '<span>OTHER_PRIVATE_VALUE</span></article>'); return true; }""")
                rows = action.param_model.model_validate({'container': '.row, .other', 'fields': {'value': {
                    'selector': ':scope', 'parts': [{'selector': 'h3'}, {'selector': 'svg use', 'attribute': 'xlink:href'}]}}})
                normalize_author_action(SimpleNamespace(bat_read_fields=rows), records)
                self.assertEqual(rows.container, ':root')
                result = await action.function(params=rows, browser_session=browser)
                self.assertIsNone(result.error, result.error)
                row_spec = records.records[-1].mapping.specification
                self.assertEqual(records.records[-1].sample.coverage.total, 3)
                self.assertEqual(await read_fields(browser, row_spec),
                    {'value': ['One\n#status_ok', 'Two\n#status_error', 'Three\n#status_ok']})
                await element.evaluate("() => { this.querySelector('use').setAttribute('xlink:href', '#status_error'); return true; }")
                self.assertEqual(await read_fields(browser, spec), {'value': ['One\n#status_error', 'Two\n#status_error']})
                self.assertEqual(await read_fields(browser, row_spec),
                    {'value': ['One\n#status_error', 'Two\n#status_error', 'Three\n#status_ok']})
                await element.evaluate("() => { this.querySelector('use').remove(); return true; }")
                with self.assertRaisesRegex(ValueError, 'read_part_cardinality_invalid'):
                    await asyncio.wait_for(read_fields(browser, spec), timeout=5)
            finally:
                await browser.kill()
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
