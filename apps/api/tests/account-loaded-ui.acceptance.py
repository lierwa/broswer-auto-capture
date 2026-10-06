"""Read-only UI on the loaded service, using an ephemeral headless Chrome, no login checks."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path.cwd() / os.environ.get('BAT_ACCOUNT_EVIDENCE_DIR', 'work/browser-account-ui-sharing-20261004/loaded-ui')
OUT.mkdir(parents=True, exist_ok=True)
proof = {'passed': False, 'headless': True, 'accountCommands': 0, 'browserSelectionWrites': 0}

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        try:
            page = await browser.new_page(viewport={'width':1280, 'height':800})
            def record(request):
                if request.method != 'GET' and '/api/browser/account-directory' in request.url: proof['accountCommands'] += 1
                if request.method != 'GET' and '/api/browser-environment' in request.url: proof['browserSelectionWrites'] += 1
            page.on('request', record)
            await page.goto('http://127.0.0.1:4173/')
            before = await (await page.request.get('http://127.0.0.1:4173/api/browser/platform-accounts')).json()
            await page.get_by_role('button', name='浏览器设置', exact=True).click()
            await page.get_by_text('已自动保存', exact=True).wait_for()
            await page.get_by_role('dialog').screenshot(path=str(OUT / 'current-settings.png'))
            await page.get_by_role('button', name='管理账号', exact=True).click()
            await page.locator('.platform-option').first.wait_for()
            await page.get_by_text('已登录', exact=True).wait_for()
            assert await page.locator('.account-checked-at').count() == 1
            after = await (await page.request.get('http://127.0.0.1:4173/api/browser/platform-accounts')).json()
            assert len(before['checks']) == len(after['checks'])
            assert proof['accountCommands'] == proof['browserSelectionWrites'] == 0
            proof['savedLoginAndTimestampDisplayed'] = True
            proof['newChecks'] = len(after['checks']) - len(before['checks'])
            proof['passed'] = True
        finally: await browser.close()

try: asyncio.run(main())
finally: (OUT / 'result.json').write_text(json.dumps(proof, indent=2) + '\n')
