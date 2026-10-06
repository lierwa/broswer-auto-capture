"""Cold-start single-window regression; real original extension and owned Chrome only."""
import asyncio, importlib.util, json, sys
from pathlib import Path
from uuid import uuid4
ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
from browser_use_runner.managed_window import ManagedWindow
from browser_use_runner.attached_window import AttachedWindow, _client
from browser_use_runner.window_lease_archive import owner_path
from playwright.async_api import async_playwright

OUT = ROOT / 'work/browser-connection-repair-20261004' / (sys.argv[1] if len(sys.argv) > 1 else 'first')
OUT.mkdir(parents=True, exist_ok=True)
proof = {'passed': False, 'personalProfileTouched': False, 'modelCalls': 0}

async def daily():
    spec = importlib.util.spec_from_file_location('owned_gate', ROOT / 'apps/api/tests/account-borrow-windows.acceptance.py')
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    gate.OUTPUT = OUT / 'daily'
    gate.OUTPUT.mkdir()
    async def probe(window, profile, _client_unused):
        lease = window._load()
        port = int((profile / 'DevToolsActivePort').read_text().splitlines()[0])
        async with async_playwright() as pw:
            chrome = await pw.chromium.connect_over_cdp(f'http://127.0.0.1:{port}')
            session = await chrome.new_browser_cdp_session()
            infos = (await session.send('Target.getTargets'))['targetInfos']
            pages = [p for p in infos if p['type'] == 'page']
            blanks = [p for p in pages if p['url'] == 'about:blank' and p['targetId'] not in lease.ownedTargets]
            proof['daily'] = {'ownedPages': len(lease.ownedTargets), 'unownedBlankPages': len(blanks)}
            # The fixture intentionally owns one original blank and one extension popup.
            assert len(blanks) == 1, 'extension connection created an extra blank page'
            await session.detach()
        assert (await window.inspect(window.owner_id))['active']
        first_targets = set(lease.ownedTargets)
        await window.end(window.owner_id)
        following = AttachedWindow(window.profile_path, uuid4(), window.cdp_url)
        try:
            browser = await following.start(resume=False, allowed_domains=None)
            # The helper's original object must resolve its archived receipt after reuse.
            window.path = owner_path(window.base_path, window.owner_id)
            await following.handoff(browser)
            next_lease = following._load()
            async with async_playwright() as pw:
                chrome = await pw.chromium.connect_over_cdp(f'http://127.0.0.1:{port}')
                session = await chrome.new_browser_cdp_session()
                infos = (await session.send('Target.getTargets'))['targetInfos']
                pages = [p for p in infos if p['type'] == 'page']
                blanks = [p for p in pages if p['url'] == 'about:blank' and p['targetId'] not in next_lease.ownedTargets]
                assert len(blanks) == 1, 'replay created an extra bootstrap page'
                assert not first_targets & {p['targetId'] for p in pages}, 'ended targets survived'
                assert len(next_lease.ownedTargets) == 1
                assert next_lease.ownerId != lease.ownerId
                proof['daily']['consecutiveRuns'] = 2
                proof['daily']['replayOwnedPages'] = len(next_lease.ownedTargets)
                proof['daily']['replayUnownedBlankPages'] = len(blanks)
                await session.detach()
        finally:
            await following.end(following.owner_id)
    await gate.daily(probe)

async def dedicated():
    window = ManagedWindow(OUT / 'dedicated/default', uuid4())
    browser = None
    try:
        browser = await window.start(resume=False, allowed_domains=None)
        await window.handoff(browser)
        lease = window._load()
        endpoint = f'ws://127.0.0.1:{lease.cdpPort}/devtools/browser/{lease.browserId}'
        async with _client(endpoint) as client:
            infos = (await client.send.Target.getTargets())['targetInfos']
        pages = [p for p in infos if p['type'] == 'page']
        proof['dedicated'] = {'pageCount': len(pages), 'ownedPages': len(lease.ownedTargets)}
        assert {p['targetId'] for p in pages} == set(lease.ownedTargets), 'dedicated launch created an extra startup page'
    finally:
        await window.close(browser)
        if window.path.exists():
            await window.end_gracefully(window.owner_id, allow_controlled=True)

async def main():
    gates = [('daily', daily)] if len(sys.argv) > 2 and sys.argv[2] == 'daily' else [('daily', daily), ('dedicated', dedicated)]
    for name, run in gates:
        try:
            await run()
            proof[name]['passed'] = True
        except Exception as error:
            proof.setdefault(name, {})['failure'] = str(error)[:250]
    proof['passed'] = all(proof.get(k, {}).get('passed') for k, _run in gates)
    (OUT / 'result.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof), flush=True)
    if not proof['passed']:
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
