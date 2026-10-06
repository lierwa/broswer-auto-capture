"""Native CDP recovery in a temporary headless profile; no personal Chrome or secrets."""
import asyncio
import json
import tempfile
from pathlib import Path
from uuid import uuid4
from playwright.async_api import async_playwright
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from browser_use_runner.attached_window import AttachedWindow, _client

OUT = Path.cwd() / 'work/replay-closure-20261004'
proof = {'passed': False, 'headless': True, 'personalProfileTouched': False, 'modelCalls': 0}

async def relay(endpoint):
    async def bridge(socket):
        async with connect(endpoint, max_size=None) as upstream:
            async def pump(source, target):
                async for message in source: await target.send(message)
            tasks = [asyncio.create_task(pump(socket, upstream)), asyncio.create_task(pump(upstream, socket))]
            try: await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for task in tasks: task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    return await serve(bridge, '127.0.0.1', 0, max_size=None)

async def main():
    with tempfile.TemporaryDirectory(prefix='bat-headless-recovery-') as directory:
        root = Path(directory)
        async with async_playwright() as pw:
            browser = await pw.chromium.launch_persistent_context(str(root / 'chrome'),
                executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True,
                args=['--remote-debugging-port=0'])
            servers = []
            try:
                protected = browser.pages[0]
                await protected.set_content('<title>Owned protected tab</title>')
                port, path = (root / 'chrome/DevToolsActivePort').read_text().splitlines()[:2]
                actual = f'ws://127.0.0.1:{port}{path}'
                first = await relay(actual); servers.append(first)
                binding = f'/devtools/browser/{uuid4().hex}'
                endpoint = f'ws://127.0.0.1:{first.sockets[0].getsockname()[1]}{binding}'
                owner = uuid4(); profile = root / 'bat/profile'
                window = AttachedWindow(profile, owner, endpoint)
                lease = window._reserve()
                async with _client(endpoint) as client: await window._create(lease, client)
                lease.status = 'handoff'; window._save(lease)
                first.close(); await first.wait_closed()
                second = await relay(actual); servers.append(second)
                rebound = f'ws://127.0.0.1:{second.sockets[0].getsockname()[1]}{binding}'
                resumed = AttachedWindow(profile, owner, rebound)
                verified = await resumed.verify_closed(owner)
                assert verified['active'] and verified['reason'] == 'hybrid_attached_window_handoff_verified'
                assert resumed._load(owner).cdpUrl == rebound
                proof['relayRestartSameIdentity'] = True
                before = resumed.path.read_bytes()
                missing = AttachedWindow(profile, uuid4())
                assert not (await missing.verify_closed(missing.owner_id))['active']
                assert resumed.path.read_bytes() == before
                proof['missingOwnerLeavesOtherLeaseUntouched'] = True
                other = rebound.rsplit('/', 1)[0] + '/' + uuid4().hex
                try: AttachedWindow(profile, owner, other)._load(owner)
                except ValueError as error: assert str(error) == 'hybrid_attached_window_endpoint_changed'
                else: raise AssertionError('different_profile_endpoint_accepted')
                assert resumed.path.read_bytes() == before
                proof['differentIdentityRejected'] = True
                pending = resumed._load(owner); pending.targetCreationPending = True; resumed._save(pending)
                try: await resumed.verify_closed(owner)
                except ValueError as error: assert str(error) == 'hybrid_attached_window_create_unconfirmed'
                else: raise AssertionError('unknown_created_target_accepted')
                pending.targetCreationPending = False; resumed._save(pending)
                proof['unknownTargetCreationRejected'] = True
                await resumed.end(owner)
                assert not (await resumed.verify_closed(owner))['active']
                assert await protected.evaluate('6 * 7') == 42
                proof['onlyOwnedTargetClosed'] = True
                proof['passed'] = True
            finally:
                for server in servers: server.close(); await server.wait_closed()
                await browser.close()

OUT.mkdir(parents=True, exist_ok=True)
try: asyncio.run(main())
finally:
    (OUT / 'native-recovery-proof.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
    print(json.dumps(proof))
