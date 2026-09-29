"""Real native scroll changes position, not the existing pagination link's value."""
import asyncio
import copy
import json
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import AsyncMock, patch

from browser_use import Browser
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.postconditions import PostconditionNotMet
from workflow_use.hybrid.read import ReadSpec, read_fields


class PageHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        body = b'<html><body><div style="height:4000px">List</div><a aria-label="Page 2" href="/page2">2</a></body></html>'
        self.send_response(200); self.send_header('Content-Length', str(len(body)))
        self.send_header('Content-Type', 'text/html'); self.end_headers(); self.wfile.write(body)


async def main():
    value = json.load(sys.stdin)
    server = ThreadingHTTPServer(('127.0.0.1', 0), PageHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    url = f'http://127.0.0.1:{server.server_port}/list'
    with tempfile.TemporaryDirectory(prefix='bat-scroll-ready-') as profile:
        browser = Browser(headless=True, use_cloud=False, keep_alive=False, user_data_dir=profile,
            enable_default_extensions=False,
            executable_path=LocalBrowserWatchdog._find_installed_browser_path('chrome'))
        adapter = None
        try:
            await browser.start(); adapter = OrdinaryCapability(browser)
            for mode in ('old', 'fixed'):
                case_url = url + '?case=' + mode
                await adapter.execute('navigate', {'url': case_url, 'new_tab': False})
                conditions = copy.deepcopy(value[mode])
                for condition in conditions:
                    condition['settle'] = {'maxMs': 1500, 'maxAttempts': 6, 'intervalMs': 100}
                    if condition['kind'] == 'read_fields':
                        condition['scope'] = {'url': case_url}
                read = next(c['read'] for c in conditions if c['kind'] == 'read_fields')
                before = await read_fields(browser, ReadSpec.model_validate(read))
                assert len(before) == 1
                with patch.object(adapter, 'execute', new=AsyncMock(wraps=adapter.execute)) as dispatch:
                    try:
                        await adapter.execute_checked('scroll', value['args'], None, conditions)
                        assert mode == 'fixed', 'old_transition_accepted_unchanged_link'
                    except PostconditionNotMet as error:
                        assert mode == 'old' and 'read_fields_projection_not_ready' in str(error), str(error)
                    assert dispatch.await_count == 1
                assert await read_fields(browser, ReadSpec.model_validate(read)) == before
                print('BAT_PROOF ' + json.dumps({'mode': mode, 'dispatches': 1,
                    'linkUnchanged': True, 'modelCalls': 0}))
        finally:
            if adapter is not None:
                await adapter.close()
            await browser.kill()
            server.shutdown(); server.server_close(); thread.join()


asyncio.run(main())
