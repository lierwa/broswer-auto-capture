"""Real DOM change, owned region and original media must survive the ordinary read adapter."""
import asyncio
import base64
import json
import hashlib
import os
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from browser_use import BrowserSession, Tools

from workflow_use.hybrid.method_read_tool import ContentReadToolParams, register_method_read_tool
from workflow_use.hybrid.method_read_evidence import verified_method_read
from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.page_content import CONTENT_SCHEMA, REGION_CONTENT, capture_region, assert_content_document, image_content
from workflow_use.hybrid.read import read_fields
from workflow_use.hybrid.target_preparation import inspect_action_target, assert_action_target
from workflow_use.hybrid.entry_selection import capture_entry_indices, select_entry_container
from workflow_use.hybrid.element_entry import ENTRY_SCHEMA, resolve_entry_element, entry_related_backends, entry_target_fact, live_entry
from workflow_use.hybrid.entry_descendant import capture_entry_descendants
from workflow_use.hybrid.natural_target_compile import natural_target
from workflow_use.hybrid.method_read_tool import expand_method_read_params, MethodReadToolParams

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=') + b'\0' * 8_000_000


class DataContentTests(unittest.IsolatedAsyncioTestCase):
    async def test_browser_accepted_unpadded_image_retains_original_bytes(self):
        # 不变量：省略填充/含标准 ASCII 空白的内嵌原图与有填充版本产生同样字节，不需要网络或模型。
        for source in (b'image-one', b'image-two-x', b'x'):
            encoded = base64.b64encode(source).decode().rstrip('=')
            for body in (encoded, encoded[:3] + '%0A' + encoded[3:]):
                raw, media = await image_content(None, {}, 'data:image/png;base64,' + body)
                self.assertEqual(raw, source)
                self.assertEqual(media, 'image/png')
        raw, media = await image_content(None, {}, 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E')
        self.assertEqual(raw, b'<svg></svg>')
        self.assertEqual(media, 'image/svg+xml')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/css.png':
            body, media = PNG[:68], 'image/png'
        elif self.path == '/image.png':
            body, media = PNG, 'image/png'
        else:
            index = self.path.rsplit('/', 1)[-1]
            body = f'''<title>Document {index}</title><p>Outside scope</p>
            <div style="width:120px;line-height:80px"><a href="#"><span id="multiline">Firstword Secondword</span></a></div>
            <div id="unicode-preview">{'A' * 1499}🚀</div>
            <section id="entry-list"><article><button class="marker">Gallery</button><a href="#one">Open one</a></article>
            <article><button class="marker">Gallery</button><a href="#two">Open two</a></article></section>
            <section id="content"><style>.css-noise-marker{{color:red}}
            #background-host::before{{content:'';display:none;background-image:url('/hidden-pseudo.png')}}
            #background-host::after{{content:'';visibility:hidden;background-image:url('/hidden-after.png')}}</style>
            <div id="background-host" style="width:20px;height:20px"></div><table><tr><th>Capacity</th><td>{index}</td></tr></table>
            <iframe style="display:none"></iframe><canvas id="opaque-surface" style="display:none"></canvas>
            <img src="/image.png"><img src="data:image/png;base64,{base64.b64encode(PNG[:68]).decode()}">
            <div style="display:none;background-image:url('/hidden.png')"></div>
            <div style="background-image:url('/css.png');width:20px;height:20px"></div></section><button id="expand"
            onclick="document.querySelector('#content').insertAdjacentHTML('beforeend','<p>Expanded {index}</p>')">Expand</button>'''.encode()
            media = 'text/html; charset=utf-8'
        self.send_response(200)
        self.send_header('Content-Type', media)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@unittest.skipUnless(os.environ.get('BAT_RUN_CONTENT_PROBE') == '1', 'explicit real browser probe required')
class PageContentTests(unittest.IsolatedAsyncioTestCase):
    async def test_multiple_related_regions_and_two_replay_inputs(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        executable = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
        spool = tempfile.TemporaryDirectory(prefix='bat-regions-proof-')
        owner = UUID('ac2da294-055d-45ca-920f-82e761721117')
        try:
            await browser.start()
            browser._bat_content_store = (Path(spool.name), owner)
            tools = Tools()
            records = register_method_read_tool(tools, output_schema=CONTENT_SCHEMA, capture_content=True)
            tool = tools.registry.registry.actions['bat_read_fields']
            page = await browser.get_current_page()
            self.assertEqual(ContentReadToolParams().model_dump(), {'regions': 'body', 'regionMode': 'selected-regions'})
            for index in (1, 2):
                await page.goto(f'http://127.0.0.1:{server.server_port}/detail/{index}')
                await (await page.get_elements_by_css_selector('#expand'))[0].click()
                for _ in range(50):
                    if await page.evaluate("() => [...document.querySelectorAll('#content img')].every(i=>i.complete&&i.naturalWidth>0)") == 'true':
                        break
                    await asyncio.sleep(.05)
                params = ContentReadToolParams(regions='#content') if index == 1 else ContentReadToolParams(readRef='r1')
                result = await tool.function(params=params, browser_session=browser)
                self.assertIsNone(result.error)
                record = records.records[-1]
                proof = verified_method_read(records=records, start=index - 1, arguments=params.model_dump(),
                    results=[result], result_ref=EvidenceRef(ref='result', digest=digest(result.model_dump(mode='json'))),
                    action_ref=f'a-{index}')
                self.assertEqual(proof.specification.contentRegion, 'selected-regions')
                output = await read_fields(browser, record.mapping.specification)
                receipt = json.loads(output['content'])
                body = json.loads((Path(spool.name) / 'content-receipts' / str(owner) / (receipt['digest'] + '.json')).read_bytes())
                self.assertIn(f'Expanded {index}', body['html'])
                self.assertIn('Capacity', body['html'])
                self.assertNotIn('Outside scope', body['html'])
                self.assertGreater(len(body['images']), 1)
                self.assertTrue(body['coverage']['complete'])
                self.assertEqual(records.records[-1].sample.coverage.total, 1)
        finally:
            await browser.kill()
            spool.cleanup()
            server.shutdown(); server.server_close()

    async def test_source_binding_rejects_descendant_moved_after_snapshot(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        executable = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
        try:
            await browser.start()
            page = await browser.get_current_page()
            await page.goto(f'http://127.0.0.1:{server.server_port}/detail/1')
            root = (await page.get_elements_by_css_selector('#entry-list article'))[0]
            await root.evaluate("() => this.style.display='contents'")
            link = (await page.get_elements_by_css_selector('#entry-list a'))[0]
            entry = await live_entry(browser, root, '#entry-list article', 1)
            backend = (await link.get_basic_info())['backendNodeId']
            summary = await browser.get_browser_state_summary(include_screenshot=False, cached=False)
            index = next(index for index, node in summary.dom_state.selector_map.items() if node.backend_node_id == backend)
            target_id = (await page.get_target_info())['targetId']
            schema = {'type': 'object', 'properties': {'entry': ENTRY_SCHEMA}, 'required': ['entry']}
            selected = capture_entry_descendants(summary, index, target_id, {'entry': entry}, schema)
            related = entry_related_backends(summary, index, target_id)
            async def current_fact():
                return await entry_target_fact(browser, SimpleNamespace(backend=backend), {'entry': entry}, schema,
                                               'a-1', related, selected)
            self.assertEqual((await current_fact())['withinEntry'], ':scope > a')
            await link.evaluate("() => document.querySelectorAll('#entry-list article')[1].append(this)")
            missing = await current_fact()
            self.assertEqual(missing['factKind'], 'input_entry_mismatch')
            await root.evaluate("() => this.insertAdjacentHTML('beforeend','<a href=\"#replacement\">Replacement</a>')")
            replaced = await current_fact()
            self.assertEqual(replaced['factKind'], 'input_entry_mismatch')
            action = SimpleNamespace(name='click', id='a-1')
            pre = SimpleNamespace(facts=[SimpleNamespace(kind=replaced['factKind'])])
            target, _, gaps = natural_target(action, pre, 'Open an entry', schema)
            self.assertIsNone(target)
            self.assertEqual([gap.reason for gap in gaps], ['input_entry_target_unproven'])
        finally:
            await browser.stop()
            server.shutdown()
            server.server_close()

    async def test_current_region_receipt_and_two_replay_inputs(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        executable = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
        spool = tempfile.TemporaryDirectory(prefix='bat-content-proof-')
        owner = UUID('ac2da294-055d-45ca-920f-82e761721117')
        try:
            await browser.start()
            browser._bat_content_store = (Path(spool.name), owner)
            tools = Tools()
            records = register_method_read_tool(tools, output_schema=CONTENT_SCHEMA, capture_content=True)
            tool = tools.registry.registry.actions['bat_read_fields']
            page = await browser.get_current_page()
            for index in (1, 2):
                await page.goto(f'http://127.0.0.1:{server.server_port}/detail/{index}')
                target = (await page.get_elements_by_css_selector('#multiline'))[0]
                state = await inspect_action_target(target)
                assert_action_target(state, 'click')
                self.assertIn(state['hitRelation'], ('self', 'descendant', 'composed'))
                await target.evaluate("() => { const cover = document.createElement('div'); "
                    "cover.style.cssText='position:fixed;inset:0;z-index:2147483647'; "
                    "document.body.append(cover); this._batFixtureCover=cover; }")
                try:
                    with self.assertRaisesRegex(ValueError, 'target_hit_blocked'):
                        assert_action_target(await inspect_action_target(target), 'click')
                finally:
                    await target.evaluate('() => this._batFixtureCover.remove()')
                preview_element = (await page.get_elements_by_css_selector('#unicode-preview'))[0]
                preview = json.loads(await preview_element.evaluate(REGION_CONTENT))['textPreview']
                self.assertEqual(preview, 'A' * 1499)
                preview.encode('utf-8')
                await (await page.get_elements_by_css_selector('#expand'))[0].click()
                result = await tool.function(params=ContentReadToolParams(container='#content'), browser_session=browser)
                self.assertIsNone(result.error)
                record = records.records[-1]
                reference = EvidenceRef(ref='evidence/action-result', digest=digest(result.model_dump(mode='json')))
                proof = verified_method_read(records=records, start=index - 1, arguments={'container': '#content'},
                    results=[result], result_ref=reference, action_ref=f'a-{index:04d}')
                self.assertEqual(proof.specification.fields['content'].contentSource, 'page-content')
                self.assertNotIn('base64', result.extracted_content)
                replay = await read_fields(browser, record.mapping.specification)
                receipt = json.loads(replay['content'])
                self.assertLess(len(replay['content']), 3000)
                self.assertEqual(receipt['ownerId'], str(owner))
                self.assertIn('Capacity', receipt['textPreview'])
                self.assertNotIn('css-noise-marker', receipt['textPreview'])
                raw = (Path(spool.name) / 'content-receipts' / str(owner) / (receipt['digest'] + '.json')).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), receipt['digest'])
                self.assertEqual(len(raw), receipt['byteLength'])
                self.assertGreater(len(raw), 8_000_000)
                content = json.loads(raw)
                self.assertIn(f'Expanded {index}', content['html'])
                self.assertIn(f'<td>{index}</td>', content['html'])
                self.assertNotIn('Outside scope', content['html'])
                self.assertEqual(base64.b64decode(content['images'][0]['body']), PNG)
                self.assertEqual(base64.b64decode(content['images'][1]['body']), PNG[:68])
                self.assertTrue(content['images'][1]['url'].startswith('data:image/png;base64,'))
                self.assertEqual(base64.b64decode(content['images'][2]['body']), PNG[:68])
                self.assertNotIn('/hidden.png', json.dumps(content['images']))
                self.assertNotIn('/hidden-pseudo.png', json.dumps(content['images']))
                self.assertNotIn('/hidden-after.png', json.dumps(content['images']))
                self.assertTrue(content['backgrounds'])
                self.assertTrue(content['coverage']['complete'])
                self.assertEqual(content['url'], await page.get_url())
                opaque = (await page.get_elements_by_css_selector('#opaque-surface'))[0]
                await opaque.evaluate("() => this.style.cssText='position:absolute;top:100000px;width:10px;height:10px'")
                with self.assertRaisesRegex(ValueError, 'content_scope_requires_supported_observation'):
                    await capture_region(browser, (await page.get_elements_by_css_selector('#content'))[0])
                await opaque.evaluate("() => this.style.display='none'")
            await assert_record_scope(browser, page)
            element = (await page.get_elements_by_css_selector('#content'))[0]
            async def reload_then_verify(session, before):
                await page.goto(await page.get_url())
                await assert_content_document(session, before)
            with patch('workflow_use.hybrid.page_content.assert_content_document', reload_then_verify):
                with self.assertRaisesRegex(ValueError, 'content_page_identity_changed'):
                    await capture_region(browser, element)
        finally:
            await browser.stop()
            server.shutdown()
            server.server_close()
            spool.cleanup()


async def assert_record_scope(browser, page):
    markers = await page.get_elements_by_css_selector('.marker')
    marker_ids = [(await marker.get_basic_info())['backendNodeId'] for marker in markers]
    summary = await browser.get_browser_state_summary(include_screenshot=False, cached=False)
    indices = [next(index for index, node in summary.dom_state.selector_map.items()
        if node.backend_node_id == backend) for backend in marker_ids]
    target = (await page.get_target_info())['targetId']
    selection = await select_entry_container(browser, indices,
        observation=capture_entry_indices(summary, indices, target))
    schema = {'type': 'array', 'items': {'type': 'object', 'properties': {
        '__batRecordEntry': ENTRY_SCHEMA, '__batRecordKey': {'type': 'string'}},
        'required': ['__batRecordEntry', '__batRecordKey'], 'additionalProperties': False}}
    mapping = expand_method_read_params(MethodReadToolParams(container=selection.container, take=2), schema)
    records = await read_fields(browser, mapping.specification)
    links = await page.get_elements_by_css_selector('#entry-list a')
    first_root = await resolve_entry_element(browser, records[0]['__batRecordEntry'])
    await first_root.evaluate('() => this.parentElement.append(this)')
    for record, link in zip(records, links, strict=True):
        actual = await resolve_entry_element(browser, record['__batRecordEntry'], ':scope > a')
        assert (await actual.get_basic_info())['backendNodeId'] == (await link.get_basic_info())['backendNodeId']
    root = await resolve_entry_element(browser, records[0]['__batRecordEntry'])
    await root.evaluate("() => this.insertAdjacentHTML('beforeend','<a href=\"#extra\">Extra</a>')")
    with unittest.TestCase().assertRaisesRegex(ValueError, 'entry_descendant_missing_or_ambiguous'):
        await resolve_entry_element(browser, records[0]['__batRecordEntry'], ':scope > a')


if __name__ == '__main__':
    unittest.main()
