"""The main HTML frame marker must not make its own descendants foreign targets."""
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

from browser_use import Browser, BrowserProfile

from workflow_use.hybrid.targets import TargetResolver, _ancestor_has, _current_target, _walk_structural


PAGE = b'''<!doctype html><html><body>
<form id="nav-searchform"><input aria-label="Search"></form>
<div><div class="suggestions">
<div class="suggest-item" role="button" tabindex="0" onclick="this.dataset.selected='true'">First choice</div>
<div class="suggest-item" role="button" tabindex="0" onclick="this.dataset.selected='true'">Second choice</div>
</div></div></body></html>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', str(len(PAGE)))
        self.end_headers()
        self.wfile.write(PAGE)

    def log_message(self, *_args):
        pass


def node(name, backend, parent=None, frame=None, target='tab-1', shadow=None):
    return SimpleNamespace(node_name=name, backend_node_id=backend, parent_node=parent,
        frame_id=frame, target_id=target, shadow_root_type=shadow)


class MainDocumentFrameTests(unittest.TestCase):
    def test_main_html_frame_marker_is_same_document_but_embedded_html_is_not(self):
        document = node('#document', 1)
        html = node('HTML', 2, document, 'main-frame')
        body = node('BODY', 3, html)
        item = node('DIV', 4, body)
        self.assertTrue(_current_target(html, 'tab-1'))
        self.assertTrue(_ancestor_has(item, 2, 'tab-1', None))
        iframe = node('IFRAME', 5, body, 'child-frame')
        embedded_document = node('#document', 6, iframe)
        embedded_html = node('HTML', 7, embedded_document, 'child-frame')
        embedded_item = node('DIV', 8, embedded_html)
        self.assertFalse(_current_target(embedded_html, 'tab-1'))
        self.assertFalse(_ancestor_has(embedded_item, 2, 'tab-1', None))
        self.assertFalse(_current_target(html, 'another-tab'))
        shadow = node('#document-fragment', 9, body, shadow='open')
        self.assertFalse(_ancestor_has(node('DIV', 10, shadow), 2, 'tab-1', None))


@unittest.skipUnless(os.environ.get('BAT_REAL_BROWSER_TEST') == '1', 'explicit real-browser test required')
class RuntimeDocumentIdentityTests(unittest.IsolatedAsyncioTestCase):
    async def test_html_container_resolves_second_nested_div_in_its_own_main_frame(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        browser = None
        try:
            with tempfile.TemporaryDirectory(prefix='bat-target-identity-') as profile:
                browser = Browser(browser_profile=BrowserProfile(headless=True, use_cloud=False, keep_alive=False,
                    user_data_dir=profile, enable_default_extensions=False))
                try:
                    await browser.start()
                    page = await browser.get_current_page()
                    url = f'http://127.0.0.1:{server.server_port}/'
                    await page.goto(url)
                    root, _timing = await page.dom_service.get_dom_tree(target_id=browser.agent_focus_target_id)
                    html = next(item for item in _walk_structural(root) if item.node_name == 'HTML')
                    self.assertIsNotNone(html.frame_id)
                    self.assertTrue(_current_target(html, browser.agent_focus_target_id))
                    target = {'strategy': 'structure', 'scope': {'url': url},
                        'container': {'kind': 'css', 'value': 'html'},
                        'items': {'kind': 'css', 'value': '#nav-searchform ~ div div'},
                        'ordinal': 2, 'withinItem': None}
                    prepared = await TargetResolver(browser).prepare_action_target(target, 'click')
                    expected = await page.get_elements_by_css_selector('.suggest-item')
                    info = await expected[0].get_basic_info()
                    self.assertEqual(prepared.backend_id, info['backendNodeId'])
                    self.assertEqual(prepared.target_id, browser.agent_focus_target_id)
                    self.assertIn(prepared.hit_relation, ('self', 'descendant'))
                    self.assertEqual(await expected[0].evaluate('() => this.dataset.selected || "no"'), 'no')
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
