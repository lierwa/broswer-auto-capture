"""Real service/browser restart and storage isolation; synthetic local state only."""
import asyncio
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = Path.cwd().resolve(); BASE = ROOT / 'work/antibot-service'
spec = importlib.util.spec_from_file_location('edge', ROOT / 'apps/api/tests/antibot-edge.acceptance.py')
edge = importlib.util.module_from_spec(spec); spec.loader.exec_module(edge)
online = edge.online
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


def wsl(*args):
    result = subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', *args], capture_output=True, check=True)
    return result.stdout.decode().strip()


def arrivals(case):
    host = urlsplit(case['url']).hostname
    scoped = [r for r in edge.rows(BASE / 'logs/access.jsonl') if r.get('RequestHost') == host]
    return {'requests': len(scoped), 'origin': sum(r.get('OriginStatus', 0) > 0 for r in scoped),
        'challengeSubmits': sum(r.get('RequestPath') == '/crowdsec-internal/challenge/submit' for r in scoped)}


async def restart_engine(out, *, base=None, status_command=None):
    unit = 'bat-antibot-engine.service'
    base = base or json.loads((BASE / 'prepared.json').read_text())['base']
    assert wsl('systemctl', '--user', 'show', unit, '--property=WorkingDirectory', '--value') == base
    state = subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', 'systemctl', '--user', 'is-active',
        'bat-antibot-window-test.service'], capture_output=True)
    assert state.stdout.decode().strip() != 'active', 'long-test-owner-active'
    previous = wsl('systemctl', '--user', 'show', unit, '--property=InvocationID', '--value')
    wsl('systemctl', '--user', 'restart', unit)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        result = subprocess.run(status_command or ['node', '--experimental-strip-types', 'tools/antibot-lab/lab.ts', 'status'],
            cwd=ROOT, capture_output=True)
        if result.returncode == 0 and json.loads(result.stdout.decode())['health']['ready']: break
        await asyncio.sleep(.5)
    else: raise AssertionError('restarted-shield-not-ready')
    current = wsl('systemctl', '--user', 'show', unit, '--property=InvocationID', '--value')
    assert previous and current and previous != current
    online.save(out, 'engine-restart.json', {'previous': previous, 'current': current, 'ready': True,
        'activeBucketsPreserved': False, 'scope': 'cookie validation key continuity only'})


async def snapshot(browser, case):
    session = await browser.get_or_create_cdp_session()
    found = await session.cdp_client.send.Network.getCookies(params={'urls': [case['url']]}, session_id=session.session_id)
    return next((c['value'] for c in found['cookies'] if c['name'] == '__crowdsec_challenge'), None)


async def phase(browser, case, out, mode, expected_cookie):
    page = await browser.get_current_page()
    before = arrivals(case); cookie = await snapshot(browser, case)
    if mode == 'same-profile': assert cookie == expected_cookie, 'persistent-cookie-lost'
    else: assert cookie is None, 'new-profile-cookie-leak'
    await online.ready(page, case['url']); await asyncio.sleep(.5)
    state = json.loads(await page.evaluate("() => ({local:localStorage.getItem('bat-owned-marker'), session:sessionStorage.getItem('bat-owned-marker')})"))
    after = arrivals(case)
    if mode == 'same-profile':
        assert state == {'local': 'synthetic-owned', 'session': None}, state
        assert after['challengeSubmits'] == before['challengeSubmits'], 'warm-restart-rechallenged'
    elif mode == 'isolated-profile':
        assert state == {'local': None, 'session': None}, state
        assert after['challengeSubmits'] == before['challengeSubmits'] + 1, 'isolated-cold-not-challenged'
    else:
        assert after['challengeSubmits'] == before['challengeSubmits'] + 1
        await page.evaluate("() => { localStorage.setItem('bat-owned-marker','synthetic-owned'); sessionStorage.setItem('bat-owned-marker','synthetic-session'); return true; }")
        await restart_engine(out)
        cookie = await snapshot(browser, case)
        response = json.loads(await page.evaluate("() => fetch(location.href).then(r=>r.text()).then(t=>({challenge:t.includes('crowdsec-internal/challenge'),business:t.includes('shield/collector.js')}))"))
        assert not response['challenge'] and response['business'], 'service-restart-lost-valid-cookie'
        after_restart = arrivals(case)
        assert after_restart['challengeSubmits'] == after['challengeSubmits']
        online.save(out, 'service-warm.json', {'response': response, 'before': after, 'after': after_restart})
    online.save(out, mode + '.json', {'before': before, 'after': after, 'storage': state, 'cookieBeforePresent': cookie is not None,
        'sameCookieVerifiedInMemory': mode == 'same-profile', 'rawCookieSaved': False})
    return await snapshot(browser, case)


async def main():
    out = Path(tempfile.mkdtemp(prefix='session-restart-', dir=BASE / 'reports')).resolve()
    case = edge.edge_case(); profiles = [out / 'persistent/profile', out / 'isolated/profile']
    online.save(out, 'case.json', case); print(json.dumps({'evidence': str(out)}), flush=True)
    pem = x509.load_pem_x509_certificate((BASE / 'tls/cert.pem').read_bytes())
    pin = base64.b64encode(hashlib.sha256(pem.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).digest()).decode()
    popen = subprocess.Popen
    def launch(args, **kwargs):
        if any('--user-data-dir=' + str(profile) in args for profile in profiles):
            args = [*args, '--ignore-certificate-errors-spki-list=' + pin]
        return popen(args, **kwargs)
    cookie = None
    try:
        for index, mode in enumerate(['cold', 'same-profile', 'isolated-profile']):
            profile = profiles[0 if index < 2 else 1]
            window, browser = edge.ManagedWindow(profile, uuid4()), None
            try:
                with patch('browser_use_runner.managed_window.subprocess.Popen', side_effect=launch):
                    browser = await window.start(resume=False, allowed_domains=['*.localhost'])
                lease = window._load()
                online.save(out, mode + '-owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted, 'profile': str(profile)})
                cookie = await phase(browser, case, out, mode, cookie)
            finally:
                closed = await window.close(browser); online.save(out, mode + '-closed.json', closed)
                assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        online.save(out, 'passed.json', {'serviceRestart': True, 'browserRestart': True, 'storageIsolation': True,
            'fullTlsShield': True, 'modelCalls': 0, 'crossDay': False, 'rawCookieAbsentFromReports': True})
    finally:
        for profile in profiles:
            assert profile.is_relative_to(out) and out.is_relative_to(BASE / 'reports')
            assert not _profile_process_present(profile)
            assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
            if profile.exists(): shutil.rmtree(profile)
        online.save(out, 'profiles-deleted.json', {'permanentlyDeleted': all(not p.exists() for p in profiles)})


if __name__ == '__main__': asyncio.run(main())
