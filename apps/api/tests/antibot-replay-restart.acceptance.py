"""Protect the single-use challenge invariant across a real owned engine restart."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path.cwd().resolve()
BASE = Path(os.environ.get('BAT_ANTIBOT_DATA', ROOT / 'work/antibot-service')).resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'apps/api/tests' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


session_test = module('session_control', 'antibot-session.acceptance.py')
restart_test = module('restart_control', 'antibot-session-restart.acceptance.py')
restart_test.BASE = BASE


async def check(browser, case, out):
    cdp = await browser.get_or_create_cdp_session()
    bodies = []

    def capture(event, session_id=None):
        request = event.get('request', {})
        if (session_id == cdp.session_id and request.get('method') == 'POST'
                and urlsplit(request.get('url', '')).path == '/crowdsec-internal/challenge/submit'):
            bodies.append(request.get('postData'))

    cdp.cdp_client.register.Network.requestWillBeSent(capture)
    await cdp.cdp_client.send.Network.enable(params={'maxPostDataSize': 262144}, session_id=cdp.session_id)
    page = await browser.get_current_page()
    await page.goto(case['url'])
    deadline = time.monotonic() + 60
    cookie = None
    while time.monotonic() < deadline:
        result = await cdp.cdp_client.send.Network.getCookies(params={'urls': [case['url']]}, session_id=cdp.session_id)
        cookie = next((c['value'] for c in result['cookies'] if c['name'] == '__crowdsec_challenge'), None)
        if cookie: break
        await asyncio.sleep(.5)
    assert cookie and len(bodies) == 1 and bodies[0], 'normal-challenge-or-capture-invalid'
    ua = await page.evaluate('() => navigator.userAgent')
    target = urlsplit(case['url'])
    submit = '/crowdsec-internal/challenge/submit'
    before = session_test.request(target.netloc, submit, ua, body=bodies[0])
    assert before['protocolStatus'] == 'failed' and not before['hasCookie'], before
    install = os.environ.get('BAT_SHIELD_LINUX_INSTALL')
    await restart_test.restart_engine(out, **(dict(base=install + '/data',
        status_command=['node', 'tools/antibot-lab/windows-host.ts', install, 'status']) if install else {}))
    after = session_test.request(target.netloc, submit, ua, body=bodies[0])
    second = session_test.request(target.netloc, submit, ua, body=bodies[0])
    warm = session_test.request(target.netloc, target.path + '?restart-control=warm', ua, cookie=cookie)
    report = dict(before=before, after=after, secondAfter=second, warmCookie=warm,
                  sameTicketInMemory=True, rawTicketOrCookieSaved=False, modelCalls=0,
                  scope='original full HTTP challenge; real engine restart; no modified rules',
                  replaySafeAcrossRestart=after['protocolStatus'] == 'failed' and not after['hasCookie'])
    save(out, 'result.json', report)
    assert warm['status'] == 200 and not warm['challenge'], 'warm-cookie-control-invalid'
    assert report['replaySafeAcrossRestart'], 'used-challenge-accepted-after-engine-restart'


async def main():
    out = Path(tempfile.mkdtemp(prefix='replay-restart-', dir=BASE / 'reports')).resolve()
    os.environ['BAT_ACCESS_STATE_DIR'] = str(out / 'access-state')
    request = Request('http://127.0.0.1:4188/api/cases', data=b'{"kind":"catalog"}',
        headers={'Origin': 'http://127.0.0.1:4188', 'Content-Type': 'application/json'})
    with urlopen(request, timeout=10) as response: case = json.load(response)
    save(out, 'case.json', case)
    print(json.dumps({'evidence': str(out)}), flush=True)
    profile = out / 'profile'
    window, browser = ManagedWindow(profile, uuid4()), None
    try:
        browser = await window.start(resume=False, allowed_domains=['*.localhost'])
        lease = window._load()
        save(out, 'owner.json', dict(pid=lease.browserPid, started=lease.browserStarted,
                                   profile=str(profile), purpose='local-nonce-restart'))
        await check(browser, case, out)
    finally:
        closed = await window.close(browser)
        save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        assert profile.parent == out and out.is_relative_to(BASE / 'reports')
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'profile-deleted.json', dict(permanentlyDeleted=not profile.exists()))


if __name__ == '__main__': asyncio.run(main())
