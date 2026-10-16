"""Real DOM regression: terminal state must not deliver outgoing transition text."""
import asyncio
import os
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from browser_use import BrowserSession
from workflow_use.hybrid.read import ReadField, project_fields
from workflow_use.hybrid.rendered_field_text import FieldReadError


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(b'<main id="report"><p id="value">Ready</p></main>')

    def log_message(self, *_args):
        pass


START_TRANSITION = """(kind) => {
  this.innerHTML = '<p id="value" data-state="done"><span id="old">Waiting </span><span>Result</span></p>';
  const old = this.querySelector('#old');
  const animation = old.animate([{opacity: 1}, {opacity: 0}],
    {duration: 800, iterations: kind === 'infinite' ? Infinity : 1});
  animation.onfinish = () => old.remove();
  if (kind === 'paused') animation.pause();
  if (kind === 'cancelled') setTimeout(() => {
    animation.cancel();
    this.innerHTML = '<p id="value">Replacement</p>';
  }, 400);
  return this.querySelector('#value').innerText;
}"""


@unittest.skipUnless(os.environ.get('BAT_RUN_ANIMATION_PROBE') == '1', 'explicit local browser probe required')
class RenderedAnimationTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_projection_waits_reselects_and_bounds_transitions(self):
        executable = ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if sys.platform == 'darwin'
                      else str(Path(os.environ.get('ProgramFiles', 'C:/Program Files'))
                               / 'Google/Chrome/Application/chrome.exe'))
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        # WHY：仅本测试拥有的临时 Profile；关闭子进程后再删除，不接触个人 Chrome。
        with tempfile.TemporaryDirectory(prefix='bat-read-animation-') as profile:
            browser = BrowserSession(headless=True, executable_path=executable, user_data_dir=profile,
                                     enable_default_extensions=False)
            try:
                await browser.start()
                page = await browser.get_current_page()
                await page.goto(f'http://127.0.0.1:{server.server_port}/')
                element = (await page.get_elements_by_css_selector('#report'))[0]
                fields = {'value': ReadField(selector='#value')}
                initial = await element.evaluate(START_TRANSITION, 'finite')
                self.assertEqual(initial, 'Waiting Result')
                self.assertEqual(await project_fields(browser, element, fields, {}), {'value': ['Result']})
                await element.evaluate(START_TRANSITION, 'cancelled')
                self.assertEqual(await project_fields(browser, element, fields, {}), {'value': ['Replacement']})
                await element.evaluate(START_TRANSITION, 'infinite')
                began = time.monotonic()
                await asyncio.wait_for(project_fields(browser, element, fields, {}), timeout=2)
                self.assertLess(time.monotonic() - began, 2)
                await element.evaluate(START_TRANSITION, 'paused')
                attribute = {'state': ReadField(selector='#value', attribute='data-state')}
                self.assertEqual(await project_fields(browser, element, attribute, {}), {'state': ['done']})
                with self.assertRaisesRegex(FieldReadError, 'read_animation_timeout'):
                    await asyncio.wait_for(project_fields(browser, element, fields, {}), timeout=5)
            finally:
                await browser.kill()
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
