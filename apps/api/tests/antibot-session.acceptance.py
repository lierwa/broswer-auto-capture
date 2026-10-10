"""Actual local challenge/cookie/replay boundaries; secrets stay in memory."""
import asyncio
import hashlib
import http.client
import json
from pathlib import Path
import shutil
import sys
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


def request(host, path, ua, *, cookie=None, body=None):
    client = http.client.HTTPConnection('127.0.0.1', 4187, timeout=10)
    headers = {'Host': host, 'User-Agent': ua}
    if cookie is not None: headers['Cookie'] = '__crowdsec_challenge=' + cookie
    if body is not None: headers['Content-Type'] = 'application/x-www-form-urlencoded'
    try:
        client.request('POST' if body is not None else 'GET', path, body=body, headers=headers)
        response = client.getresponse()
        content = response.read().decode('utf-8')
        return {'status': response.status, 'challenge': 'crowdsec-internal/challenge' in content,
            'protocolStatus': json.loads(content).get('status') if content.startswith('{') else None,
            'hasCookie': bool(response.getheader('Set-Cookie'))}
    finally:
        client.close()


async def boundaries(browser, case, out):
    session = await browser.get_or_create_cdp_session()
    submitted = []

    def capture(event, session_id=None):
        req = event.get('request', {})
        if (session_id == session.session_id and req.get('method') == 'POST'
                and urlsplit(req.get('url', '')).path == '/crowdsec-internal/challenge/submit'):
            submitted.append(req.get('postData'))

    session.cdp_client.register.Network.requestWillBeSent(capture)
    await session.cdp_client.send.Network.enable(params={'maxPostDataSize': 262144}, session_id=session.session_id)
    page = await browser.get_current_page()
    await page.goto(case['url'])
    deadline, cookies = time.monotonic() + 60, []
    while time.monotonic() < deadline:
        found = await session.cdp_client.send.Network.getCookies(params={'urls': [case['url']]}, session_id=session.session_id)
        cookies = [c for c in found['cookies'] if c['name'] == '__crowdsec_challenge']
        if cookies: break
        await asyncio.sleep(.5)
    save(out, 'capture-status.json', {'submitCount': len(submitted), 'hasCookie': bool(cookies),
        'bodiesAvailable': [isinstance(body, str) and bool(body) for body in submitted]})
    assert len(submitted) == 1 and submitted[0] and cookies, 'normal-challenge-or-capture-failed'
    ua = await page.evaluate('() => navigator.userAgent')
    target = urlsplit(case['url'])
    proof = {'cookie': {k: cookies[0].get(k) for k in ['httpOnly', 'secure', 'sameSite', 'session']},
        'scope': 'owned local HTTP; no raw cookie, ticket or fingerprint persisted', 'results': {}}
    proof['results']['warm'] = request(target.netloc, target.path + '?probe=warm', ua, cookie=cookies[0]['value'])
    proof['results']['missing'] = request(target.netloc, target.path + '?probe=missing', ua)
    proof['results']['changed-ua'] = request(target.netloc, target.path + '?probe=changed-ua', ua + ' Changed', cookie=cookies[0]['value'])
    proof['results']['corrupt'] = request(target.netloc, target.path + '?probe=corrupt', ua, cookie=cookies[0]['value'] + 'x')
    proof['results']['replay'] = request(target.netloc, '/crowdsec-internal/challenge/submit', ua, body=submitted[0])
    proof['sameSubmitBodySha256'] = hashlib.sha256(submitted[0].encode()).hexdigest()
    save(out, 'result.json', proof)
    assert proof['cookie']['httpOnly'] and proof['cookie']['sameSite'] == 'Lax'
    assert proof['results']['warm']['status'] == 200 and not proof['results']['warm']['challenge']
    assert all(proof['results'][key]['challenge'] for key in ['missing', 'changed-ua', 'corrupt'])
    assert proof['results']['replay']['protocolStatus'] == 'failed' and not proof['results']['replay']['hasCookie']
    await asyncio.sleep(.5)
    rows = [json.loads(line) for line in (ROOT / 'work/antibot-service/logs/access.jsonl').read_text().splitlines()]
    scoped = [row for row in rows if row.get('RequestHost') == target.hostname]
    save(out, 'gateway.json', scoped)
    origin = [row for row in scoped if row.get('OriginStatus', 0) > 0]
    assert len(origin) == 2, f'expected-browser-normal-and-warm-only:{len(origin)}'
    save(out, 'passed.json', {'normalAndWarmOriginArrivals': len(origin), 'threeCookieNegatives': True,
        'sameBodyReplayDenied': True, 'realCookieTTLUnmeasured': True, 'engineRestarted': False})


async def main():
    parent = ROOT / 'work/antibot-service/reports'
    out = Path(tempfile.mkdtemp(prefix='session-', dir=parent)).resolve()
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
            'profile': lease.profilePath, 'purpose': 'owned-real-session-protocol', 'modelCalls': 0})
        await boundaries(browser, case, out)
    finally:
        closed = await window.close(browser); save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed', closed
        assert profile.resolve().parent == out and out.is_relative_to(parent)
        assert not _profile_process_present(profile)
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__': asyncio.run(main())
