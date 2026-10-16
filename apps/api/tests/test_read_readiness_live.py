"""A later required read waits independently of an earlier immediately readable field."""
import asyncio
import os
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

from browser_use import BrowserSession
from browser_use_runner.hybrid_commands import ReadCommand
from browser_use_runner.read_readiness import wait_required_paths
from workflow_use.hybrid.postconditions import PostconditionNotMet
from workflow_use.hybrid.read import read_fields
from test_rendered_animation import Handler


@unittest.skipUnless(os.environ.get('BAT_RUN_READINESS_PROBE') == '1', 'explicit local browser probe required')
class ReadReadinessLiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_late_result_accepts_both_terminal_outcomes_without_replaying_actions(self):
        executable = ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if sys.platform == 'darwin'
                      else str(Path(os.environ.get('ProgramFiles', 'C:/Program Files'))
                               / 'Google/Chrome/Application/chrome.exe'))
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with tempfile.TemporaryDirectory(prefix='bat-read-ready-') as profile:
            Path(profile, 'Default').mkdir()
            browser = BrowserSession(headless=True, executable_path=executable, user_data_dir=profile,
                                     enable_default_extensions=False)
            try:
                await browser.start()
                page = await browser.get_current_page()
                await page.goto(f'http://127.0.0.1:{server.server_port}/')
                root = (await page.get_elements_by_css_selector('#report'))[0]
                command = ReadCommand(name='browser.read-fields', version=2, specification={
                    'container': '#value:not([data-state="processing"])',
                    'fields': {'value': {'selector': ':scope'}}, 'maxItems': 1, 'maxInputBytes': 10000,
                    'outputSchema': {'type': 'object', 'properties': {'value': {'type': 'string'}},
                                     'required': ['value'], 'additionalProperties': False}})
                for state in ('success', 'error'):
                    await root.evaluate('''(state) => {
                        this.innerHTML = '<span id="value" data-state="processing">Pending</span>';
                        setTimeout(() => { const n = this.querySelector('#value');
                            n.dataset.state = state; n.textContent = state; }, 1800);
                        return true;
                    }''', state)
                    with self.assertRaisesRegex(ValueError, 'read_single_object_required'):
                        await read_fields(browser, command.specification)
                    await asyncio.wait_for(wait_required_paths(browser, command, None), timeout=5)
                    self.assertEqual(await read_fields(browser, command.specification), {'value': state})
                # WHY：等待能力不能把绑定样本结果的错误方法悄悄改成成功；错误选择器仍应有界失败。
                command.specification.container = '#value[data-state="success"]'
                policy = SimpleNamespace(maxMs=800, maxAttempts=3, intervalMs=100)
                with patch('browser_use_runner.read_readiness.settle_policy', return_value=policy):
                    with self.assertRaises(PostconditionNotMet):
                        await wait_required_paths(browser, command, None)
            finally:
                await browser.kill()
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
