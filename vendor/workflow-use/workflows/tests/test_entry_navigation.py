"""Protect durable observed link inputs without weakening legacy live element identity."""
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from browser_use import BrowserSession, Tools
from browser_use.tools.views import NavigateAction
from workflow_use.hybrid.element_entry import (
    ENTRY_SCHEMA, LEGACY_ENTRY_SCHEMA, ElementEntry, entry_field, entry_inputs, live_entry, resolve_entry_element)
from workflow_use.hybrid.entry_record_scope import record_roots
from workflow_use.hybrid.entry_selection import capture_entry_indices, select_entry_container
from workflow_use.hybrid.method_read_tool import expand_method_read_params, MethodReadToolParams
from workflow_use.hybrid.read import read_fields
from test_record_entry_scope import snapshot, ENTRY


def output_schema(entry_schema):
    return {'type': 'array', 'items': {'type': 'object', 'properties': {
        '__batRecordEntry': entry_schema, '__batRecordKey': {'type': 'string'}},
        'required': ['__batRecordEntry', '__batRecordKey'], 'additionalProperties': False}}


class EntryNavigationContractTests(unittest.TestCase):
    def test_old_entry_shape_and_old_schema_remain_valid(self):
        self.assertEqual(ElementEntry.model_validate(ENTRY).model_dump(mode='json'), ENTRY)
        for schema in (LEGACY_ENTRY_SCHEMA, ENTRY_SCHEMA):
            self.assertEqual(entry_field(output_schema(schema)), '__batRecordEntry')
            self.assertEqual(list(entry_inputs(ENTRY, schema))[0][1].model_dump(mode='json'), ENTRY)
            expand_method_read_params(MethodReadToolParams(container='a', take=2), output_schema(schema))

    def test_only_selected_links_keep_their_own_scope(self):
        seen, _, cards, leaves = snapshot()
        links = [seen.dom_state.selector_map[index] for index in (9, 10)]
        for link in links:
            link.attributes['href'] = '/detail'
        self.assertEqual(record_roots(links), (links, [0, 0]))
        # 选中的是非链接控件时，不凭同一行含有链接猜测实际动作。
        self.assertEqual(record_roots(leaves), (cards, [1, 1]))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = '''<title>Entry fixture</title><base href="/details/">
        <main><article><a class="entry" href="one">First entry</a></article>
        <article><a class="entry" href="two">Second entry</a></article></main>
        <button id="control">Action</button><a id="download" href="file" download>Save</a>
        <a id="script" href="javascript:void(0)">Script</a>'''.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@unittest.skipUnless(os.environ.get('BAT_RUN_ENTRY_PROBE') == '1', 'explicit real browser probe required')
class EntryNavigationBrowserTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_observed_links_survive_same_tab_navigation_and_legacy_stays_strict(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        executable = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
        try:
            await browser.start()
            page = await browser.get_current_page()
            await page.goto(f'http://127.0.0.1:{server.server_port}/list')
            links = await page.get_elements_by_css_selector('.entry')
            backends = [(await link.get_basic_info())['backendNodeId'] for link in links]
            summary = await browser.get_browser_state_summary(include_screenshot=False, cached=False)
            indices = [next(index for index, node in summary.dom_state.selector_map.items()
                if node.backend_node_id == backend) for backend in backends]
            target = (await page.get_target_info())['targetId']
            selection = await select_entry_container(browser, indices,
                observation=capture_entry_indices(summary, indices, target))
            self.assertEqual(selection.backendNodeIds, backends)
            mapping = expand_method_read_params(MethodReadToolParams(container=selection.container, take=2),
                                                output_schema(ENTRY_SCHEMA))
            records = await read_fields(browser, mapping.specification)
            legacy = expand_method_read_params(MethodReadToolParams(container=selection.container, take=2),
                                               output_schema(LEGACY_ENTRY_SCHEMA))
            self.assertNotIn('navigationUrl', (await read_fields(browser, legacy.specification))[0]['__batRecordEntry'])
            for selector in ('#control', '#download', '#script', 'article'):
                element = (await page.get_elements_by_css_selector(selector))[0]
                self.assertNotIn('navigationUrl', await live_entry(browser, element, selector, 1, include_navigation=True))
            navigate = Tools().registry.registry.actions['navigate']
            for record, suffix in zip(records, ('one', 'two'), strict=True):
                entry = record['__batRecordEntry']
                self.assertEqual(entry['navigationUrl'], f'http://127.0.0.1:{server.server_port}/details/{suffix}')
                result = await navigate.function(params=NavigateAction(url=entry['navigationUrl'], new_tab=False),
                                                 browser_session=browser)
                self.assertIsNone(result.error)
                current = await browser.get_current_page()
                self.assertEqual((await current.get_target_info())['targetId'], target)
                self.assertEqual(await current.get_url(), entry['navigationUrl'])
                with self.assertRaisesRegex(ValueError, 'entry_source_page_changed'):
                    await resolve_entry_element(browser, entry)
            await page.goto(f'http://127.0.0.1:{server.server_port}/list')
            replayed = await read_fields(browser, mapping.specification)
            self.assertEqual([item['__batRecordKey'] for item in records], [item['__batRecordKey'] for item in replayed])
        finally:
            await browser.kill()
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
