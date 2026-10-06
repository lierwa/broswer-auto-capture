"""New borrow compatibility gate only; owned Profiles, no popup/settings replay."""
import asyncio, base64, hashlib, importlib.util, json, os, sys
from pathlib import Path
from uuid import uuid4

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
from browser_use_runner.managed_window import ManagedWindow
from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.account_borrow import borrow_window
from playwright.async_api import async_playwright
import psutil

OUTPUT = ROOT / os.environ.get('BAT_ACCOUNT_BORROW_OUTPUT', 'work/account-rebuild-20261003/borrow-windows')
OUTPUT.mkdir(parents=True, exist_ok=True)
proof = {'modelCalls': 0, 'personalProfileTouched': False, 'steps': []}


async def dedicated():
    owner = str(uuid4())
    profile = OUTPUT / 'dedicated/default'
    window = ManagedWindow(profile, owner)
    browser = None
    try:
        browser = await window.start(resume=False, allowed_domains=None)
        await window.handoff(browser)
        async with borrow_window(profile, owner, owner, 'dedicated') as borrowed:
            await borrowed.page.goto('http://example.com', timeout=15000)
            await borrowed.put_cookies([{'name': 'bat_owned_probe', 'value': 'synthetic',
                                         'domain': 'example.com', 'path': '/'}])
            cookies = await borrowed.cookies(['http://example.com'])
            assert any(c['name'] == 'bat_owned_probe' for c in cookies)
            assert not any(c['name'] == 'bat_owned_probe' for c in await borrowed.cookies(['http://example.org']))
        assert window.inspect(owner)['active']
        proof['steps'].append('dedicated original owner + Playwright scoped cookie borrow + disconnect leaves Chrome alive')
    finally:
        window.end(owner, allow_controlled=True)


async def daily(probe=None, product_probe=None):
    owner = str(uuid4())
    profile = OUTPUT / 'daily'
    profile.mkdir(exist_ok=True)
    (profile / 'Default').mkdir(exist_ok=True)
    extension = ROOT / 'work/daily-chrome-extension/extension'
    manifest = json.loads((extension / 'manifest.json').read_text())
    digest = hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32]
    extension_id = ''.join(chr(97 + int(c, 16)) for c in digest)
    binary = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    relay_error = (OUTPUT / 'relay-stderr.log').open('ab')
    relay = await asyncio.create_subprocess_exec('node', '--import', 'tsx',
        'apps/api/tests/fixtures/account-borrow-relay.ts', cwd=ROOT,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=relay_error,
        env={**os.environ, 'BAT_TEST_PROFILE': str(profile), 'BAT_TEST_EXECUTABLE': binary})
    process, client, window = None, None, None
    try:
        proof['dailyStage'] = 'fixture_start'
        ready = json.loads(await asyncio.wait_for(relay.stdout.readline(), 20))
        proof['dailyStage'] = 'chrome_launch'
        (profile / 'DevToolsActivePort').unlink(missing_ok=True)
        process = await asyncio.create_subprocess_exec(binary, f'--user-data-dir={profile}',
            '--headless=new', '--remote-debugging-port=0', '--no-first-run',
            '--no-default-browser-check', '--enable-unsafe-extension-debugging', 'about:blank',
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        port_file = profile / 'DevToolsActivePort'
        async with asyncio.timeout(20):
            while not port_file.exists():
                await asyncio.sleep(0.1)
        port = int(port_file.read_text().splitlines()[0])
        proof['dailyStage'] = 'native_connect'
        async with async_playwright() as pw:
            client = await pw.chromium.connect_over_cdp(f'http://127.0.0.1:{port}')
            cdp = await client.new_browser_cdp_session()
            proof['dailyStage'] = 'extension_load'
            loaded = await cdp.send('Extensions.loadUnpacked', {'path': str(extension)})
            assert loaded['id'] == extension_id
            proof['dailyStage'] = 'owned_extension_approval'
            relay.stdin.write((json.dumps({'op': 'pair', 'ownerId': owner}) + '\n').encode())
            await relay.stdin.drain()
            pending = json.loads(await asyncio.wait_for(relay.stdout.readline(), 20))
            page = await client.contexts[0].new_page()
            await page.goto(f'chrome-extension://{extension_id}/status.html')
            await page.evaluate('request => chrome.runtime.sendMessage({type:"bat.receiveRequest",request})', pending['popupRequest'])
            await page.evaluate('() => chrome.runtime.sendMessage({type:"bat.setConnectionEnabled",enabled:true})')
            paired = json.loads(await asyncio.wait_for(relay.stdout.readline(), 35))
            assert paired.get('paired'), paired
            await cdp.detach()
        if product_probe:
            await product_probe(ready['endpointPort'], profile, port)
            return
        proof['dailyStage'] = 'original_owner_start'
        window = AttachedWindow(OUTPUT / 'daily-owner/default', owner, paired['cdpUrl'])
        browser = await window.start(resume=False, allowed_domains=None)
        await window.handoff(browser)
        proof['dailyStage'] = 'playwright_borrow'
        if probe:
            await probe(window, profile, client)
            return
        async with borrow_window(OUTPUT / 'daily-owner/default', owner, owner, 'daily') as borrowed:
            await borrowed.page.goto('http://example.com', timeout=15000)
            await borrowed.put_cookies([{'name': 'bat_owned_daily', 'value': 'synthetic',
                                         'domain': 'example.com', 'path': '/'}])
            assert any(c['name'] == 'bat_owned_daily' for c in await borrowed.cookies(['http://example.com']))
            assert not any(c['name'] == 'bat_owned_daily' for c in await borrowed.cookies(['http://example.org']))
        assert (await window.inspect(owner))['active']
        proof['steps'].append('daily real extension + original owner + Playwright scoped borrow + Chrome survives')
    finally:
        if window:
            await window.end(window.owner_id)
        relay.stdin.close()
        await asyncio.wait_for(relay.wait(), 10)
        relay_error.close()
        if process and process.returncode is None:
            process.terminate()
            await asyncio.wait_for(process.wait(), 10)
        # WHY：Chrome launcher可能交接给同Profile进程；fixture精确Profile/PID时间证明后清理。
        owners = [p for p in psutil.process_iter(['cmdline'])
                  if f'--user-data-dir={profile}' in (p.info['cmdline'] or [])]
        found = {owner.pid: owner for owner in owners}
        for owner in owners:
            try:
                found.update({child.pid: child for child in owner.children(recursive=True)})
            except psutil.NoSuchProcess:
                pass
        processes = list(found.values())
        for owned in reversed(processes):
            try:
                owned.terminate()
            except psutil.NoSuchProcess:
                pass
        await asyncio.to_thread(psutil.wait_procs, processes, timeout=5)


async def main():
    gates = [('daily', daily)] if os.environ.get('BAT_BORROW_SCOPE') == 'daily' else [('dedicated', dedicated), ('daily', daily)]
    for name, gate in gates:
        try:
            await gate()
            proof[name] = {'passed': True}
        except Exception as exc:
            proof[name] = {'passed': False, 'errorType': type(exc).__name__, 'error': str(exc)[:600]}
            print(name, proof[name], flush=True)
    proof['passed'] = all(proof[k]['passed'] for k, _gate in gates)
    result_name = 'retry-daily.json' if len(gates) == 1 else 'result.json'
    (OUTPUT / result_name).write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof), flush=True)
    if not proof['passed']:
        raise SystemExit(1)

if __name__ == '__main__':
    if os.environ.get('BAT_RUN_ACCOUNT_BORROW') != '1':
        raise ValueError('explicit_owned_windows_gate_required')
    asyncio.run(main())
