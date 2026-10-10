"""A real unused original challenge expires after real time; restore production settings."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path.cwd().resolve()
BASE = ROOT / 'work/antibot-service'
spec = importlib.util.spec_from_file_location('replay', ROOT / 'apps/api/tests/antibot-replay-restart.acceptance.py')
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


def create_case():
    request = Request('http://127.0.0.1:4188/api/cases', data=b'{"kind":"catalog"}',
        headers={'Origin': 'http://127.0.0.1:4188', 'Content-Type': 'application/json'})
    with urlopen(request, timeout=10) as response: return json.load(response)


async def capture_unused(browser, case, out):
    cdp = await browser.get_or_create_cdp_session()
    pending = asyncio.get_running_loop().create_future()
    intercepted = []
    operations = []

    async def abort(event):
        try:
            await cdp.cdp_client.send.Fetch.failRequest(params={'requestId': event['requestId'], 'errorReason': 'Aborted'},
                                                       session_id=cdp.session_id)
            if not pending.done(): pending.set_result(event['request'].get('postData'))
        except Exception as error:
            if not pending.done(): pending.set_exception(error)

    def pause(event, session_id=None):
        if session_id != cdp.session_id: return
        request = event.get('request', {})
        intercepted.append(request.get('postData'))
        # 原CDP接收循环不能在回调内等待自己的命令响应；异步操作独立调度并在finally收回。
        operations.append(asyncio.create_task(abort(event)))

    cdp.cdp_client.register.Fetch.requestPaused(pause)
    await cdp.cdp_client.send.Fetch.enable(params={'patterns': [
        {'urlPattern': '*/crowdsec-internal/challenge/submit', 'requestStage': 'Request'}]}, session_id=cdp.session_id)
    page = await browser.get_current_page()
    try:
        await page.goto(case['url'])
        body = await asyncio.wait_for(pending, 60)
        ua = await page.evaluate('() => navigator.userAgent')
        assert body and len(intercepted) == 1, 'unused-ticket-capture-invalid'
        replay.save(out, 'capture.json', dict(intercepted=1, forwardedToShield=False, ticketSaved=False))
        return body, ua
    finally:
        await asyncio.gather(*operations, return_exceptions=True)
        await cdp.cdp_client.send.Fetch.disable(session_id=cdp.session_id)


async def exercise(out):
    normal, unused = create_case(), create_case()
    replay.save(out, 'cases.json', dict(normal=normal, unused=unused))
    profile = out / 'profile'
    window, browser = ManagedWindow(profile, uuid4()), None
    ticket, ua = None, None
    try:
        browser = await window.start(resume=False, allowed_domains=['*.localhost'])
        lease = window._load()
        replay.save(out, 'owner.json', dict(pid=lease.browserPid, started=lease.browserStarted, profile=str(profile)))
        page = await browser.get_current_page()
        await replay.restart_test.online.ready(page, normal['url'])
        replay.save(out, 'normal.json', dict(originalChallengeAndBusiness=True, case=normal['id']))
        ticket, ua = await capture_unused(browser, unused, out)
    finally:
        closed = await window.close(browser)
        replay.save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        assert profile.parent == out and out.is_relative_to(BASE / 'reports')
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        replay.save(out, 'profile-deleted.json', dict(permanentlyDeleted=not profile.exists()))
    target = urlsplit(unused['url'])
    before = replay.restart_test.arrivals(unused)
    rows = replay.restart_test.edge.rows(BASE / 'logs/access.jsonl')
    before['businessOrigin'] = sum(row.get('RequestHost') == target.hostname
        and row.get('RequestPath', '').startswith(target.path) and row.get('OriginStatus', 0) > 0 for row in rows)
    replay.save(out, 'before-expiry.json', before)
    # favicon被原静态规则放行并404回源，与challenge提交/业务到达分别计数。
    assert before['challengeSubmits'] == 0 and before['businessOrigin'] == 0, 'ticket-was-already-consumed'
    print(json.dumps(dict(waitingRealSeconds=65, browserClosed=True)), flush=True)
    started = time.monotonic()
    await asyncio.sleep(65)
    expired = replay.session_test.request(target.netloc, '/crowdsec-internal/challenge/submit', ua, body=ticket)
    report = dict(normalNewTicketAccepted=True, expiredUnusedTicket=expired,
                  elapsedSeconds=time.monotonic() - started, before=before,
                  keyRotationSeconds=30, liveEpochs=2, originalConfigRestoredInFinally=True,
                  productionLongWindowMeasured=False, modelCalls=0)
    replay.save(out, 'result.json', report)
    assert expired['protocolStatus'] == 'failed' and not expired['hasCookie'], 'expired-ticket-accepted'


async def main():
    out = Path(tempfile.mkdtemp(prefix='ticket-expiry-', dir=BASE / 'reports')).resolve()
    print(json.dumps(dict(evidence=str(out))), flush=True)
    config = BASE / 'config/appsec-configs/bat-lab-signing.yaml'
    original = config.read_bytes()
    candidate = json.loads(original)
    candidate['challenge'].update(key_rotation_interval='30s', max_live_epochs=2)
    assert candidate['challenge'].get('spent_set_db'), 'persistent-spent-store-required'
    try:
        # 先核所有权/没有长测，写入只属于当前盾的暂时配置。
        base = json.loads((BASE / 'prepared.json').read_text())['base']
        assert replay.restart_test.wsl('systemctl', '--user', 'show', 'bat-antibot-engine.service',
            '--property=WorkingDirectory', '--value') == base
        state = replay.restart_test.subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', 'systemctl', '--user',
            'is-active', 'bat-antibot-window-test.service'], capture_output=True)
        assert state.stdout.decode().strip() != 'active'
        config.write_text(json.dumps(candidate))
        phase = out / 'short-config'; phase.mkdir()
        await replay.restart_test.restart_engine(phase)
        await exercise(out)
    finally:
        config.write_bytes(original)
        restored = out / 'restored-config'; restored.mkdir()
        await replay.restart_test.restart_engine(restored)
        assert config.read_bytes() == original
        replay.save(out, 'restored.json', dict(originalSha256=hashlib.sha256(original).hexdigest(),
                                             restoredExactly=True, ready=True))


if __name__ == '__main__': asyncio.run(main())
