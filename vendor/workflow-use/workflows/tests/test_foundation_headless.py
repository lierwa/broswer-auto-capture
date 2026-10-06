"""Local native DOM probes for entry lifetimes and compiled quantity input bindings."""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

from browser_use import BrowserSession, Tools
from browser_use.tools.views import SwitchTabAction
from workflow_use.hybrid.element_entry import ENTRY_SCHEMA, live_entry, resolve_entry_element
from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.entry_lifetime import capture_entry_lifetime, entry_document_survives
from workflow_use.hybrid.observation_scope import live_document_sample
from workflow_use.hybrid.method_read_evidence import verified_method_read
from workflow_use.hybrid.method_read_tool import EntryReadToolParams, register_method_read_tool
from workflow_use.hybrid.natural_facts import binding_facts
from workflow_use.hybrid.natural_reads import compile_verified_read
from workflow_use.hybrid.read import ReadSpec, read_fields


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'''<title>Foundation fixture</title><main>
        <div id="log"></div><section id="buttons">
        <button onclick="document.querySelector('#log').textContent+='one;'">First</button>
        <button onclick="document.querySelector('#log').textContent+='two;'">Second</button></section>
        <section id="popups"><button onclick="window.open('/detail/1','_blank')">First popup</button>
        <button onclick="window.open('/detail/2','_blank')">Second popup</button></section>
        <button id="replace-and-open" onclick="window.open('/detail/5','_blank');document.documentElement.replaceWith(document.createElement('html'))">Open and replace</button>
        <section id="mixed"><a href="/detail/3">Link</a><button onclick="location.href='/detail/4'">Button</button></section>
        <section id="sources"><a href="/detail/1">One</a><a href="/detail/2">Two</a><a href="/detail/3">Three</a></section>
        </main>'''
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def fact(kind, value, identifier):
    return SimpleNamespace(id=identifier, kind=kind, value=value,
        sourceRefs=[EvidenceRef(ref=identifier, digest=digest({'kind': kind, 'value': value}))])


@unittest.skipUnless(os.environ.get('BAT_RUN_FOUNDATION_PROBE') == '1', 'explicit headless probe required')
class FoundationHeadlessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        executable = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        self.browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
        try:
            await self.browser.start()
            self.page = await self.browser.get_current_page()
            self.url = f'http://127.0.0.1:{self.server.server_port}/list'
            await self.page.goto(self.url)
        except BaseException:
            await self.asyncTearDown()
            raise

    async def asyncTearDown(self):
        try:
            await self.browser.kill()
        finally:
            self.server.shutdown()
            self.server.server_close()

    async def entries(self, selector):
        elements = await self.page.get_elements_by_css_selector(selector)
        return [await live_entry(self.browser, element, selector, ordinal, include_navigation=True)
                for ordinal, element in enumerate(elements, 1)]

    async def test_buttons_popups_and_mixed_entries_retain_strict_source_identity(self):
        buttons = await self.entries('#buttons button')
        for entry in buttons:
            await (await resolve_entry_element(self.browser, entry)).click()
        self.assertEqual(await self.page.evaluate("() => document.querySelector('#log').textContent"), 'one;two;')
        source = (await self.page.get_target_info())['targetId']
        popups = await self.entries('#popups button')
        tools = Tools()
        switch = tools.registry.registry.actions['switch']
        for entry in popups:
            await (await resolve_entry_element(self.browser, entry)).click()
            switched = await switch.function(params=SwitchTabAction(tab_id=source[-4:]), browser_session=self.browser)
            self.assertIsNone(switched.error)
        self.assertEqual(len(await self.browser.get_tabs()), 3)
        for entry in popups:
            await resolve_entry_element(self.browser, entry)
        mixed = await self.entries('#mixed > *')
        self.assertIn('navigationUrl', mixed[0])
        self.assertNotIn('navigationUrl', mixed[1])
        await self.page.goto(mixed[0]['navigationUrl'])
        with self.assertRaisesRegex(ValueError, 'entry_source_page_changed'):
            await resolve_entry_element(self.browser, mixed[1])
        await self.page.goto(self.url)
        with self.assertRaisesRegex(ValueError, 'entry_source_page_changed'):
            await resolve_entry_element(self.browser, buttons[0])

    async def test_native_read_compiles_amount_binding_and_replays_changed_and_empty_inputs(self):
        input_schema = {'type': 'object', 'properties': {'amount': {'type': 'integer', 'minimum': 1, 'maximum': 3},
            'label': {'type': 'string'}}, 'required': ['amount', 'label'], 'additionalProperties': False}
        item = {'type': 'object', 'properties': {**input_schema['properties'], '__batRecordEntry': ENTRY_SCHEMA,
            '__batRecordKey': {'type': 'string'}}, 'required': ['amount', 'label', '__batRecordEntry', '__batRecordKey'],
            'additionalProperties': False}
        schema = {'type': 'array', 'items': item, 'maxItems': 3}
        tools = Tools()
        records = register_method_read_tool(tools, output_schema=schema)
        records.input_value, records.input_schema = {'amount': 2, 'label': 'original'}, input_schema
        params = EntryReadToolParams(container='#sources a', take=2)
        result = await tools.registry.registry.actions['bat_read_fields'].function(params=params, browser_session=self.browser)
        self.assertIsNone(result.error)
        result_ref = EvidenceRef(ref='result', digest=digest(result.model_dump(mode='json')))
        observed = verified_method_read(records=records, start=0, arguments=params.model_dump(mode='json'),
            results=[result], result_ref=result_ref, action_ref='a-0001')
        target = (await self.page.get_target_info())['targetId']
        bindings = binding_facts('a-0001', 'bat_read_fields', params.model_dump(mode='json'),
            records.input_value, input_schema, 'Read the requested amount')
        pre = SimpleNamespace(id='o1', url=self.url, tabId=target, sourceRefs=[],
            facts=[fact('url_digest', digest(self.url), 'u1'),
                *[fact('natural_binding', value.model_dump(mode='json'), f'b{i}') for i, value in enumerate(bindings)]])
        post = SimpleNamespace(id='o2', url=self.url, tabId=target, sourceRefs=[],
            facts=[fact('url_digest', digest(self.url), 'u2'), fact('verified_natural_read', observed.model_dump(mode='json'), 'read')])
        action = SimpleNamespace(id='a-0001', name='bat_read_fields', args=params.model_dump(mode='json'),
            resultRef=result_ref, preObservationRef=pre.id, postObservationRef=post.id)
        request = SimpleNamespace(runtimeInputSchema=input_schema, plan=SimpleNamespace(outputSchemaDigest=digest(schema)),
            trace=SimpleNamespace(actions=[action], observations=[pre, post]))
        segment, _, gaps = compile_verified_read(request, action, pre, post, schema, [])
        self.assertEqual(gaps, [])
        self.assertEqual(segment['bindings'][0]['binding'], {'source': 'input', 'path': ['amount']})
        self.assertEqual(segment['outputs'][0]['schema']['maxItems'], 3)
        self.assertEqual(observed.specification.take, 2)
        spec = ReadSpec.model_validate(segment['operation']['specification'])
        for amount in (1, 3):
            output = await read_fields(self.browser, spec.model_copy(update={'take': amount}),
                inherited={'amount': amount, 'label': 'changed'})
            self.assertEqual(len(output), amount)
            self.assertTrue(all(row['amount'] == amount and row['label'] == 'changed' for row in output))
        await self.page.evaluate("() => document.querySelector('#sources').replaceChildren()")
        self.assertEqual(await read_fields(self.browser, spec, inherited={'amount': 2, 'label': 'empty'}), [])

    async def test_popup_source_capture_does_not_focus_and_detects_replaced_source(self):
        source = (await self.page.get_target_info())['targetId']
        sample = await live_document_sample(self.browser)
        pre = SimpleNamespace(id='o1', tabId=source, url=self.url, facts=[
            fact('input_entry_target', {}, 'entry'), fact('document_identity', {
                'targetId': source, 'documentDigest': sample['documentDigest']}, 'document')])
        pre.facts[1].sourceRefs = [EvidenceRef(ref='document', digest=digest(pre.facts[1].value))]
        collector = SimpleNamespace(browser=self.browser, observations=[pre], pending={'pre': pre.id},
            value_fact=lambda kind, value: fact(kind, value, kind))
        await (await self.page.get_elements_by_css_selector('#popups button'))[0].click()
        popup = next(tab.target_id for tab in await self.browser.get_tabs() if tab.target_id != source)
        switch = Tools().registry.registry.actions['switch']
        await switch.function(params=SwitchTabAction(tab_id=popup[-4:]), browser_session=self.browser)
        source_sample = await live_document_sample(self.browser, source)
        self.assertEqual(source_sample['documentDigest'], sample['documentDigest'])
        after = SimpleNamespace(tabId=popup, facts=[])
        await capture_entry_lifetime(collector, after)
        self.assertEqual([item.value for item in after.facts], [{
            'targetId': source, 'documentDigest': sample['documentDigest'], 'urlDigest': digest(self.url)}])
        self.assertEqual(self.browser.agent_focus_target_id, popup)
        self.assertTrue(entry_document_survives(pre, after))
        await switch.function(params=SwitchTabAction(tab_id=source[-4:]), browser_session=self.browser)
        await (await self.page.get_elements_by_css_selector('#replace-and-open'))[0].click()
        await switch.function(params=SwitchTabAction(tab_id=popup[-4:]), browser_session=self.browser)
        replaced = SimpleNamespace(tabId=popup, facts=[])
        await capture_entry_lifetime(collector, replaced)
        self.assertFalse(entry_document_survives(pre, replaced))
        self.assertEqual(self.browser.agent_focus_target_id, popup)


if __name__ == '__main__':
    unittest.main()
