"""Real isolated extension + production scoped endpoints + complete product check UI."""
import asyncio, importlib.util, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path.cwd()
OUT = ROOT / os.environ.get('BAT_ACCOUNT_BORROW_OUTPUT', 'work/account-operation-20261007')
os.environ['BAT_ACCOUNT_BORROW_OUTPUT'] = str(OUT)
spec = importlib.util.spec_from_file_location('owned_daily', ROOT / 'apps/api/tests/account-borrow-windows.acceptance.py')
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)

async def product(endpoint_port, _profile, native_port):
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(f'http://127.0.0.1:{native_port}')
        session = await browser.new_browser_cdp_session()
        before = {t['targetId'] for t in (await session.send('Target.getTargets'))['targetInfos'] if t['type'] == 'page'}
        try:
            process = await asyncio.create_subprocess_exec('node', '--import', 'tsx', 'apps/api/tests/account-operation-native.acceptance.ts',
                stdin=asyncio.subprocess.PIPE, cwd=ROOT, env={**os.environ, 'BAT_RUN_ACCOUNT_OPERATION': '1'})
            await process.communicate(json.dumps({'endpointPort': endpoint_port, 'nativePort': native_port, 'output': str(OUT)}).encode())
            assert process.returncode == 0, 'product_check_failed'
            after = {t['targetId'] for t in (await session.send('Target.getTargets'))['targetInfos'] if t['type'] == 'page'}
            proof = {'passed': before == after, 'newPagesRemaining': len(after - before), 'originalPagesPreserved': before <= after}
            (OUT / 'physical-pages.json').write_text(json.dumps(proof))
            assert before == after, proof
        finally:
            await session.detach()

if __name__ == '__main__':
    if os.environ.get('BAT_RUN_ACCOUNT_OPERATION') != '1':
        raise ValueError('owned_headless_gate_required')
    asyncio.run(gate.daily(product_probe=product))
