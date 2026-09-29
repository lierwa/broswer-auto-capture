"""Delayed real DOM: native click once, existing settle waits for the required link."""
import asyncio
import copy
import json
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from browser_use import Browser
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.read import ReadSpec, read_fields
from workflow_use.hybrid.rendered_field_text import FieldReadError

state = {'ready': False, 'clicks': 0}


class PageHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == '/ready':
            body = json.dumps(state['ready'])
        elif self.path == '/list':
            state['clicks'] += 1
            body = """<html><body><main></main><script>
            const poll = setInterval(async () => { if (await (await fetch('/ready')).json()) {
              clearInterval(poll); const a = document.createElement('a');
              a.rel = 'next'; a.href = '/list?page=2'; a.textContent = 'Next';
              document.querySelector('main').append(a);
            } }, 20);</script></body></html>"""
        else:
            body = '<html><body><a id="open" href="/list">Open list</a></body></html>'
        data = body.encode()
        self.send_response(200); self.send_header('Content-Length', str(len(data)))
        self.send_header('Content-Type', 'application/json' if self.path == '/ready' else 'text/html')
        self.end_headers(); self.wfile.write(data)


async def main():
    import sys
    value = json.load(sys.stdin)
    server = ThreadingHTTPServer(('127.0.0.1', 0), PageHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    with tempfile.TemporaryDirectory(prefix='bat-read-ready-') as profile:
        browser = Browser(headless=True, use_cloud=False, keep_alive=False, user_data_dir=profile,
            enable_default_extensions=False,
            executable_path=LocalBrowserWatchdog._find_installed_browser_path('chrome'))
        adapter = None
        try:
            await browser.start(); adapter = OrdinaryCapability(browser)
            condition = copy.deepcopy(value['condition'])
            condition['scope'] = {'url': base + '/list'}
            spec = ReadSpec.model_validate(condition['read'])
            await adapter.execute('navigate', {'url': base + '/start', 'new_tab': False})
            misses = 0
            async def delayed_read(*args, **kwargs):
                nonlocal misses
                try:
                    return await read_fields(*args, **kwargs)
                except FieldReadError:
                    misses += 1
                    if misses == 2:
                        state['ready'] = True
                    raise
            with patch('workflow_use.hybrid.postconditions.read_fields', new=delayed_read):
                await adapter.execute_checked('click', {}, {'strategy': 'css', 'value': '#open'}, [condition])
            output = await read_fields(browser, spec, scope={'url': base + '/list'},
                                       required_paths=condition['requiredPaths'])
            assert misses >= 2 and state['clicks'] == 1
            assert output[0]['attribute_href'] == base + '/list?page=2'
            print('BAT_PROOF ' + json.dumps({'missingReads': misses, 'clicks': state['clicks'],
                'records': len(output), 'modelCalls': 0}))
        finally:
            if adapter is not None:
                await adapter.close()
            await browser.kill()
            server.shutdown(); server.server_close(); thread.join()


asyncio.run(main())
