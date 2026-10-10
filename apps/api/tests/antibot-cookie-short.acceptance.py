"""Bounded wall-clock expiry over the real gateway; restore default config in finally."""
import asyncio
import hashlib
import http.client
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path.cwd().resolve(); BASE = ROOT / 'work/antibot-service'
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


def wsl(*args):
    return subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', *args], check=True, capture_output=True).stdout.decode().strip()


def restart(base):
    unit = 'bat-antibot-engine.service'
    assert wsl('systemctl', '--user', 'show', unit, '--property=WorkingDirectory', '--value') == base
    assert wsl('systemctl', '--user', 'show', 'bat-antibot-window-test.service', '--property=ActiveState', '--value') != 'active'
    wsl('systemctl', '--user', 'restart', unit)
    end = time.monotonic() + 45
    while time.monotonic() < end:
        try:
            with socket.create_connection(('127.0.0.1', 7422), timeout=1): pass
            return wsl('systemctl', '--user', 'show', unit, '--property=InvocationID', '--value')
        except OSError: time.sleep(.25)
    raise AssertionError('appsec-not-ready')


async def capture(out):
    profile = out / 'profile'; window, browser = ManagedWindow(profile, uuid4()), None
    req = Request('http://127.0.0.1:4188/api/cases', data=b'{"kind":"catalog"}',
        headers={'Origin': 'http://127.0.0.1:4188', 'Content-Type': 'application/json'})
    with urlopen(req, timeout=10) as response: case = json.load(response)
    save(out, 'case.json', case)
    try:
        browser = await window.start(resume=False, allowed_domains=['*.localhost'])
        lease = window._load()
        save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted, 'profile': str(profile)})
        page = await browser.get_current_page(); await page.goto(case['url'])
        session = await browser.get_or_create_cdp_session()
        for _ in range(120):
            found = await session.cdp_client.send.Network.getCookies(params={'urls': [case['url']]}, session_id=session.session_id)
            cookies = [c for c in found['cookies'] if c['name'] == '__crowdsec_challenge']
            if cookies: break
            await asyncio.sleep(.25)
        assert cookies, 'native-cookie-missing'
        return {'url': case['url'], 'cookie': cookies[0]['value'], 'expires': cookies[0]['expires'],
            'ua': await page.evaluate('() => navigator.userAgent')}
    finally:
        closed = await window.close(browser); save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        assert profile.parent == out and out.is_relative_to(BASE / 'reports')
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


def probe(item, stage):
    target = urlsplit(item['url']); client = http.client.HTTPConnection('127.0.0.1', 4187, timeout=10)
    try:
        at = time.time()
        client.request('GET', target.path, headers={'Host': target.netloc, 'User-Agent': item['ua'],
            'Cookie': '__crowdsec_challenge=' + item['cookie']})
        response = client.getresponse()
        return {'stage': stage, 'at': at, 'status': response.status,
            'challenged': b'crowdsec-internal/challenge' in response.read(), 'renewed': bool(response.getheader('Set-Cookie'))}
    finally: client.close()


async def main():
    out = Path(tempfile.mkdtemp(prefix='cookie-short-', dir=BASE / 'reports')).resolve()
    base = json.loads((BASE / 'prepared.json').read_text())['base']
    config = BASE / 'config/appsec-configs/bat-lab-signing.yaml'
    original = config.read_bytes(); changed = json.loads(original)
    assert 'cookie_ttl' not in changed['challenge'], 'unexpected-prior-cookie-policy'
    changed['challenge']['cookie_ttl'] = '20s'; temporary = json.dumps(changed).encode()
    print(json.dumps({'evidence': str(out)}), flush=True)
    proof = {'defaultTtlUnchanged': False, 'shortTtlSeconds': 20, 'real12HoursTested': False, 'attempts': []}
    try:
        config.write_bytes(temporary); proof['testInvocation'] = restart(base)
        item = await capture(out)
        assert 10 < item['expires'] - time.time() <= 21, 'short-ttl-not-loaded-or-capture-too-slow'
        for stage, when, challenged in [('initial', time.time(), False),
                ('before-expiry', item['expires'] - 3, False), ('after-expiry', item['expires'] + 2, True)]:
            await asyncio.sleep(max(0, when - time.time()))
            row = probe(item, stage); proof['attempts'].append(row); save(out, 'observed.json', proof)
            assert row['status'] == 200 and row['challenged'] == challenged and not row['renewed'], 'expiry-mismatch'
        proof['passed'] = True
    finally:
        assert config.read_bytes() == temporary, 'configuration-changed-by-another-owner'
        config.write_bytes(original); proof['restoredInvocation'] = restart(base)
        proof['defaultTtlUnchanged'] = config.read_bytes() == original
        proof['restoredConfigSha256'] = hashlib.sha256(original).hexdigest()
        save(out, 'finished.json', proof)


if __name__ == '__main__': asyncio.run(main())
