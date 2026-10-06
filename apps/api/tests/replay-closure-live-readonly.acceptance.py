"""Read current development UI headlessly; reject every product write, no browser control."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

proof = {'passed': False, 'headless': True, 'productWrites': [], 'personalProfileTouched': False}

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        try:
            page = await browser.new_page(viewport={'width': 1280, 'height': 800})
            async def read_only(route):
                if route.request.method not in ('GET', 'HEAD', 'OPTIONS'):
                    proof['productWrites'].append(route.request.method)
                    await route.abort('blockedbyclient')
                else: await route.continue_()
            await page.route('**/api/**', read_only)
            await page.goto('http://127.0.0.1:4173/')
            await page.locator('.task-attention-trigger').wait_for()
            assert await page.locator('.status-group .task-more').count() == 0
            row = page.locator('.task-list-item[data-selected=true]')
            await row.wait_for()
            assert await row.locator('.task-more').count() == 1
            await page.get_by_role('button', name='浏览器设置', exact=True).click()
            dialog = page.get_by_role('dialog')
            await dialog.get_by_role('button', name='管理账号', exact=True).wait_for()
            geometry = await dialog.evaluate('e=>{const r=e.getBoundingClientRect();return {fits:r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,width:r.width,height:r.height}}')
            assert geometry['fits']
            proof['settingsGeometry'] = geometry
            await dialog.get_by_role('button', name='管理账号', exact=True).click()
            await page.locator('.account-layout').wait_for()
            await page.locator('.account-status.ready').wait_for()
            assert await page.get_by_role('button', name='检查登录', exact=True).is_enabled()
            assert '原任务' not in await page.locator('.account-layout').inner_text()
            assert proof['productWrites'] == []
            proof['passed'] = True
        finally: await browser.close()

try: asyncio.run(main())
finally:
    out = Path.cwd() / 'work/replay-closure-20261004/live-readonly-proof.json'
    out.write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(proof, ensure_ascii=False))
