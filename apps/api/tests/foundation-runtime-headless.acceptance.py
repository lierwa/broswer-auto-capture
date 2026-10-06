"""Own one headless Playwright browser while the normal runner attaches and resumes."""
import asyncio
import os
import tempfile
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    if os.environ.get('BAT_RUN_FOUNDATION_PROBE') != '1':
        raise ValueError('explicit_headless_probe_required')
    with tempfile.TemporaryDirectory(prefix='bat-foundation-runtime-') as directory:
        profile = Path(directory) / 'chrome'
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch_persistent_context(str(profile), headless=True,
                executable_path=str(Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'),
                args=['--remote-debugging-port=0'])
            try:
                port, endpoint = (profile / 'DevToolsActivePort').read_text().splitlines()[:2]
                protected = browser.pages[0]
                await protected.set_content('<title>Untouched fixture tab</title>')
                process = await asyncio.create_subprocess_exec('node', '--import', 'tsx',
                    'apps/api/tests/foundation-runtime-headless.acceptance.ts',
                    env={**os.environ, 'BAT_FOUNDATION_HEADLESS_ENDPOINT': f'ws://127.0.0.1:{port}{endpoint}'})
                try:
                    result = await asyncio.wait_for(process.wait(), 180)
                except TimeoutError:
                    process.kill()
                    await process.wait()
                    raise
                assert await protected.evaluate('6 * 7') == 42, 'unowned_fixture_tab_changed'
                if result:
                    raise RuntimeError(f'foundation_runtime_failed:{result}')
            finally:
                await browser.close()


asyncio.run(main())
