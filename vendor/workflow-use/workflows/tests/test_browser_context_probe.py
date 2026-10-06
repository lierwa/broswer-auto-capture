"""真实原生派发/采集/编译/复跑；保护新 tab 返回和无 AX 固定控件，零模型、只访问本地页。"""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

from browser_use import BrowserSession, Tools
from workflow_use.hybrid.action_dispatch import ActionDispatchAudit, bind_tools_act
from workflow_use.hybrid.author import AuthorInput, natural_compilation_request
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.native_event_capture import NativeEventCapture
from workflow_use.hybrid.natural_prefix import compile_natural_prefix
from workflow_use.hybrid.observation_scope import SourceObservationScope
from workflow_use.hybrid.read import ReadSpec, read_fields
from workflow_use.hybrid.page_content import CONTENT_SCHEMA
from workflow_use.hybrid.registry import ActionRegistry
from test_author_source_boundary import source_fixture


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/list':
            self.send_response(302)
            self.send_header('Location', '/list?view=actual')
            self.end_headers()
            return
        body = ("<style>span{display:inline-block;padding:30px;cursor:pointer}</style>"
                "<div><span class='choice' onclick='document.body.dataset.sorted=1'>Newest</span>"
                "<span class='choice' onclick=\"window.open('/detail/one','_blank')\">Entry One</span>"
                "<span class='choice' onclick=\"window.open('/detail/two','_blank')\">Entry Two</span></div>"
                if self.path.startswith('/list?') else f"<section id='details'><h1>{self.path}</h1>"
                "<dl><dt>Configuration</dt><dd>Observed whole region</dd></dl></section>")
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *_args):
        pass


def store(kind, value):
    checksum = digest(value)
    return EvidenceRef(ref='local-probe:' + kind + ':' + checksum, digest=checksum)


async def recorded_source(browser, base, author_value):
    tools = Tools()
    registry = ActionRegistry.from_tools(tools)
    capture = NativeEventCapture(browser)
    audit = ActionDispatchAudit(capture)
    restore = bind_tools_act(tools, audit)
    collector = EvidenceCollector(browser, registry, put_evidence=store, redact_action=lambda value: value,
        input_value=author_value.input, input_schema=author_value.inputSchema,
        requirement_text=author_value.requirementText, dispatch_audit=audit, entry_urls=[base + '/list'])
    history = SimpleNamespace(history=[], is_done=lambda: False, is_successful=lambda: False)
    agent = SimpleNamespace(history=history)
    callbacks = SimpleNamespace(agent=agent, abort=lambda _stage, error: (_ for _ in ()).throw(error),
                                record_before_action_detail=lambda *_args: None)
    scope = SourceObservationScope(browser, collector, callbacks)
    scope.start()
    action_model = tools.registry.create_action_model()
    original_tab = None
    original_url = None
    try:
        for index, instruction in enumerate(('navigate', 'Newest', 'Entry One', 'switch', 'Entry Two', 'switch', 'navigate')):
            summary = await browser.get_browser_state_summary()
            if instruction == 'navigate':
                raw = {'navigate': {'url': original_url or base + '/list', 'new_tab': False}}
            elif instruction == 'switch':
                raw = {'switch': {'tab_id': original_tab[-4:]}}
            else:
                indices = [key for key, node in summary.dom_state.selector_map.items()
                           if node.tag_name.lower() == 'span' and node.get_all_children_text() == instruction]
                if len(indices) != 1:
                    raise AssertionError('native_control_not_unique')
                raw = {'click': {'index': indices[0]}}
            action = action_model.model_validate(raw)
            model_output = SimpleNamespace(action=[action])
            await collector.before_action(summary, model_output, index + 1)
            result = await tools.act(action, browser_session=browser)
            if result.error:
                raise AssertionError('native_action_failed')
            history.history.append(SimpleNamespace(model_output=model_output, result=[result],
                                                   metadata=SimpleNamespace(step_number=index + 1)))
            await collector.after_step(agent)
            if index == 0:
                original_tab = str(browser.agent_focus_target_id)
                original_url = await (await browser.get_current_page()).get_url()
        trace, issues = collector.snapshot(history, history_ref='local-probe', redaction_manifest=store('redaction', {}))
        if issues:
            raise AssertionError([issue.reason for issue in issues])
        request = natural_compilation_request(author_value, trace, registry)
        compilation = compile_natural_prefix(request, registry)
        if compilation.gaps:
            raise AssertionError([issue['reason'] for issue in compilation.gaps])
        return request, compilation
    finally:
        restore()
        scope.close()
        await capture.close()


async def replay_source(browser, compilation):
    capability = OrdinaryCapability(browser)
    outputs, details = {}, []
    for segment in compilation.segments:
        args = {}
        for decision in segment['bindings']:
            binding = decision['binding']
            value = binding['value'] if binding['source'] == 'constant' else outputs[binding['nodeId']]
            for key in binding.get('path', []):
                value = value[key]
            args[decision['argumentPath']] = value
        await capability.execute_checked(segment['operation']['actionName'], args, segment['target'], segment['postconditions'])
        page = await browser.get_current_page()
        outputs[segment['id'][2:]] = {'url': await page.get_url(), 'tabId': str(browser.agent_focus_target_id)}
        if '/detail/' in await page.get_url():
            specification = ReadSpec(container='#details', fields={'content': {
                'selector': ':scope', 'attribute': None, 'valueType': 'string', 'contentSource': 'page-content'}},
                maxItems=1, maxInputBytes=128000, outputSchema=CONTENT_SCHEMA)
            output = await read_fields(browser, specification)
            if 'Observed whole region' not in output['content']:
                raise AssertionError('region_content_missing')
            details.append(await page.get_url())
    return outputs, details


@unittest.skipUnless(os.environ.get('BAT_RUN_CONTENT_PROBE') == '1', 'explicit local browser probe required')
class BrowserContextProbeTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_source_replays_in_new_session_and_returns_to_same_list(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
        raw, _, _ = source_fixture()
        raw.update(task='Sort by Newest. Open Entry One and Entry Two, returning to the list each time.',
            requirementText='Sort by Newest. Open Entry One and Entry Two, returning to the list each time.',
            input=None, inputSchema={'type': 'null'}, outputSchema={'type': 'null'}, entryUrls=[base + '/list'],
            resultSpec={'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'})
        author_value = AuthorInput.model_validate(raw)
        executable = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
        try:
            await browser.start()
            request, compilation = await recorded_source(browser, base, author_value)
            source_tab = request.trace.observations[1].tabId
            await browser.kill()
            browser = BrowserSession(headless=True, executable_path=str(executable), enable_default_extensions=False)
            await browser.start()
            outputs, details = await replay_source(browser, compilation)
            self.assertEqual(details, [base + '/detail/one', base + '/detail/two'])
            self.assertNotEqual(outputs['a-0001']['tabId'], source_tab)
            self.assertEqual(outputs['a-0007']['tabId'], outputs['a-0001']['tabId'])
            self.assertEqual(outputs['a-0007']['url'], base + '/list?view=actual')
            if os.environ.get('BAT_CONTEXT_PROBE_OUTPUT'):
                Path(os.environ['BAT_CONTEXT_PROBE_OUTPUT']).write_text(json.dumps({
                    'request': request.model_dump(mode='json', by_alias=True),
                    'compilation': compilation.model_dump(mode='json')}, ensure_ascii=False), encoding='utf-8')
        finally:
            await browser.kill()
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
