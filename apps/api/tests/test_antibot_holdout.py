"""Calibrate an unchanged, pinned independent detector before trusting a negative result."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

import psutil
from browser_use import BrowserProfile
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog

sys.path.insert(0, str(Path(__file__).parent / 'antibot-m0'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from browser import endpoint, close_owned, save
from browser_use_runner.task_browser import TaskBrowser

ROOT = Path.cwd().resolve()
PARENT = ROOT / 'work/antibot-m0'
REVISION = '98b330999e9928a226ca0c8254dddf909d1583bd'
ARTIFACT = PARENT / 'holdout/brotector-98b3309'
DIGESTS = {
    'brotector.js': '1fa214628e8b36faaee9088e00bfba97679c40f4637f4442b633130f38d24a6d',
    'LICENSE': '3527e1b45c07acbef785668b2e517c30620a1e129994ee765c605965f9e38cf7',
    'assets/test.pdf': '7cb171c5e3e89066a2839bbd26722069fb9aecdb63c6f6c6b6fdd13c9519a01f',
}
PAGE = b'''<!doctype html><meta charset="utf-8"><title>Independent local calibration</title>
<body><script src="/brotector.js"></script><script>
let errors = 0;
addEventListener('error', () => errors++);
addEventListener('unhandledrejection', () => errors++);
// PDF style creates an extra target; this holdout covers the Runtime mechanism only.
class RuntimeHoldout extends Brotector { async test_pdfStyle() {} }
const probe = new RuntimeHoldout(() => {}, 100, false);
const deadline = new Promise(resolve => setTimeout(() => resolve('timeout'), 5000));
Promise.race([probe.init_done.then(() => 'ready', () => 'error'), deadline]).then(async state => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  const detections = probe.detections.map(d => ({detection:d.detection, type:d.type || null,
    score:d.score, ...(d.detection === 'runtime.enabled' ? {data:d.data} : {})}));
  await fetch(location.pathname, {method:'POST', body:JSON.stringify({state,errors,detections})});
});
</script>'''


def verify_artifact():
    for name, digest in DIGESTS.items():
        target = ARTIFACT / name
        if not target.exists():
            data = urlopen(f'https://raw.githubusercontent.com/ttlns/brotector/{REVISION}/{name}',
                           timeout=30).read(2_000_001)
            if len(data) > 2_000_000 or hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('holdout_artifact_digest_mismatch')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError('holdout_artifact_digest_mismatch')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('/assets/test.pdf'):
            body, mime = (ARTIFACT / 'assets/test.pdf').read_bytes(), 'application/pdf'
        elif self.path == '/brotector.js':
            body, mime = (ARTIFACT / 'brotector.js').read_bytes(), 'text/javascript'
        elif self.path.startswith('/case/'):
            body, mime = PAGE, 'text/html'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; "
                         "connect-src 'self'; worker-src blob:; frame-src 'self'; style-src 'unsafe-inline'; object-src 'self'")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        size = int(self.headers.get('Content-Length', '0'))
        if not self.path.startswith('/case/') or size > 32_000:
            self.send_error(400)
            return
        self.server.results[self.path] = json.loads(self.rfile.read(size))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *_args):
        pass


async def calibrate(browser, server, directory):
    target = await browser.get_current_target_info()
    session = await browser.get_or_create_cdp_session(target_id=target['targetId'], focus=False)
    rows = []
    for enabled in [False, True]:
        if enabled:
            await session.cdp_client.send.Runtime.enable(session_id=session.session_id)
        for round_number in range(1, 4):
            route = f'/case/{int(enabled)}/{round_number}'
            await session.cdp_client.send.Page.navigate(
                params={'url': f'http://127.0.0.1:{server.server_port}{route}'}, session_id=session.session_id)
            async with asyncio.timeout(15):
                while route not in server.results:
                    await asyncio.sleep(.1)
            result = server.results[route]
            detected = any(d['detection'] == 'runtime.enabled' for d in result['detections'])
            rows.append({'runtimeEnabled': enabled, 'round': round_number, 'detected': detected, **result})
            save(directory, 'samples.json', rows)
    valid = all(r['state'] == 'ready' and r['errors'] == 0 and r['detected'] == r['runtimeEnabled'] for r in rows)
    save(directory, 'calibration.json', {'valid': valid, 'revision': REVISION, 'digests': DIGESTS,
         'scope': 'headless component calibration, not daily product acceptance', 'samples': rows})
    print(json.dumps({'directory': str(directory), 'valid': valid,
                     'observations': [{k: r[k] for k in ['runtimeEnabled', 'round', 'state', 'errors', 'detected']} for r in rows]}))
    if not valid:
        raise ValueError('holdout_calibration_invalid')


async def run():
    if os.environ.get('BAT_HOLDOUT_HEADLESS_TEST') != '1':
        raise ValueError('explicit_headless_calibration_required')
    verify_artifact()
    directory = Path(tempfile.mkdtemp(prefix='holdout-calibration-', dir=PARENT)).resolve()
    profile = directory / 'profile'
    profile.mkdir()
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.results = {}
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    executable = LocalBrowserWatchdog._find_installed_browser_path('chrome')
    owner = subprocess.Popen([str(executable), '--headless=new', '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + str(profile),
        '--no-first-run', '--no-default-browser-check', 'about:blank'],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = psutil.Process(owner.pid).create_time()
    receipt = {'ownerPid': owner.pid, 'ownerStarted': started, 'profile': str(profile),
               'headless': True, 'closed': False, 'purpose': 'independent_detector_calibration'}
    save(directory, 'owner.json', receipt)
    browser = None
    try:
        cdp = await endpoint(profile, owner)
        browser = TaskBrowser(browser_profile=BrowserProfile(cdp_url=cdp, is_local=False,
            keep_alive=True, enable_default_extensions=False), cdp_url=cdp, is_local=False)
        await browser.start()
        await calibrate(browser, server, directory)
    finally:
        try:
            if browser is not None:
                await browser.stop()
        finally:
            receipt['closed'] = close_owned(owner.pid, started, profile)
            save(directory, 'closed.json', receipt)
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
            if not receipt['closed']:
                raise ValueError('holdout_owner_close_unconfirmed')
            owner.wait(timeout=5)
            # WHY：只删除本次 PID/启动时间/精确路径证明拥有的临时 Profile。
            assert profile.resolve().parent == directory and directory.is_relative_to(PARENT)
            assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
            shutil.rmtree(profile)
            save(directory, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__':
    asyncio.run(run())
