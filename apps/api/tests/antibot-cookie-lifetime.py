"""Explicit 12-hour local cookie check; worker owns only an in-memory synthetic cookie."""
import asyncio
import http.client
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import UUID, uuid4
import psutil

ROOT = Path.cwd().resolve()
PARENT = ROOT / 'work/antibot-service/reports'
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


def worker():
    item = json.loads(sys.stdin.read(16384))
    out = Path(item['out']).resolve()
    target = urlsplit(item['url'])
    assert out.parent == PARENT and out.name.startswith('cookie-lifetime-') and out.is_dir()
    assert target.scheme == 'http' and target.port == 4187 and target.hostname.endswith('.localhost')
    assert str(UUID(target.hostname.removesuffix('.localhost'))) == target.hostname.removesuffix('.localhost')
    assert target.path == '/case/' + target.hostname.removesuffix('.localhost')
    assert 43000 < item['expires'] - time.time() <= 43300
    process = psutil.Process()
    proof = {'status': 'running', 'pid': process.pid, 'created': process.create_time(),
        'executable': process.exe(), 'expiresAtUnix': item['expires'], 'startedAtUnix': time.time(),
        'purpose': 'real-12-hour-local-cookie-expiry', 'attempts': [], 'secretPersistence': False,
        'browserCreatedByWorker': False, 'modelCalls': 0}
    save(out, 'worker.json', proof)
    try:
        for name, when, expected in [('initial', time.time(), False),
                ('before-expiry', item['expires'] - 10, False), ('after-expiry', item['expires'] + 2, True)]:
            while time.time() < when: time.sleep(min(60, when - time.time()))
            assert name != 'before-expiry' or time.time() < item['expires'] - 1, 'pre-expiry-window-missed'
            client = http.client.HTTPConnection('127.0.0.1', 4187, timeout=10)
            try:
                at = time.time()
                client.request('GET', target.path, headers={'Host': target.netloc,
                    'User-Agent': item['ua'], 'Cookie': '__crowdsec_challenge=' + item['cookie']})
                response = client.getresponse()
                challenge = b'crowdsec-internal/challenge' in response.read()
                proof['attempts'].append({'stage': name, 'atUnix': at, 'status': response.status,
                    'challenged': challenge, 'hasNewCookie': bool(response.getheader('Set-Cookie'))})
                save(out, 'worker.json', proof)
                assert response.status == 200 and challenge == expected, 'real-cookie-lifetime-mismatch'
                assert not response.getheader('Set-Cookie'), 'cookie-renewed-during-measurement'
            finally:
                client.close()
        proof['status'] = 'passed'
    except Exception as error:
        proof.update(status='failed', errorType=type(error).__name__, error=str(error))
    finally:
        proof['finishedAtUnix'] = time.time()
        save(out, 'worker.json', proof)
    return 0 if proof['status'] == 'passed' else 1


async def capture():
    out = Path(tempfile.mkdtemp(prefix='cookie-lifetime-', dir=PARENT)).resolve()
    profile = out / 'profile'
    window, browser = ManagedWindow(profile, uuid4()), None
    req = Request('http://127.0.0.1:4188/api/cases', data=b'{"kind":"catalog"}',
        headers={'Origin': 'http://127.0.0.1:4188', 'Content-Type': 'application/json'})
    with urlopen(req, timeout=10) as response: case = json.load(response)
    save(out, 'case.json', case)
    print(json.dumps({'evidence': str(out)}), flush=True)
    try:
        browser = await window.start(resume=False, allowed_domains=['*.localhost'])
        lease = window._load()
        save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted,
            'profile': lease.profilePath, 'purpose': 'cookie-lifetime-capture'})
        page = await browser.get_current_page()
        await page.goto(case['url'])
        session = await browser.get_or_create_cdp_session()
        cookies = []
        for _ in range(120):
            found = await session.cdp_client.send.Network.getCookies(params={'urls': [case['url']]}, session_id=session.session_id)
            cookies = [c for c in found['cookies'] if c['name'] == '__crowdsec_challenge']
            if cookies: break
            await asyncio.sleep(.5)
        assert cookies, 'normal-challenge-cookie-missing'
        payload = {'out': str(out), 'url': case['url'], 'ua': await page.evaluate('() => navigator.userAgent'),
            'cookie': cookies[0]['value'], 'expires': cookies[0]['expires']}
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker'], cwd=ROOT,
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        child.stdin.write(json.dumps(payload).encode()); child.stdin.close()
        for _ in range(50):
            if (out / 'worker.json').exists(): break
            assert child.poll() is None, 'lifetime-worker-failed-before-ready'
            await asyncio.sleep(.1)
        assert (out / 'worker.json').exists(), 'lifetime-worker-ready-timeout'
        receipt = json.loads((out / 'worker.json').read_text())
        print(json.dumps({'launcherPid': child.pid, 'workerPid': receipt['pid'],
            'expiresAtUnix': cookies[0]['expires']}), flush=True)
    finally:
        closed = await window.close(browser); save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        assert profile.resolve().parent == out and out.is_relative_to(PARENT)
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__':
    if sys.argv[1:] == ['--worker']: sys.exit(worker())
    if sys.argv[1:] != ['--start-12-hour-check']: raise ValueError('explicit-real-time-check-required')
    asyncio.run(capture())
