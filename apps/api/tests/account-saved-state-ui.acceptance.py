"""Current built UI + fixture SQLite: per-Profile saved checks, timestamp, small layouts."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path.cwd() / os.environ.get('BAT_ACCOUNT_EVIDENCE_DIR', 'work/browser-account-ui-sharing-20261004/accounts-ui')
OUT.mkdir(parents=True, exist_ok=True)
proof = {'passed': False, 'personalProfileTouched': False, 'samples': []}

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        try:
            page = await browser.new_page(viewport={'width': 1280, 'height': 800})
            await page.route('**/api/browser/daily-chrome', lambda route: route.fulfill(json={
                'paired': True, 'busy': False, 'profileDirectory': 'Default', 'extensionDirectory': 'Owned fixture',
                'profiles': [{'id': 'Default', 'name': '测试 Chrome'}]}))
            await page.request.post('http://127.0.0.1:4199/', data={'daily': 'A', 'dedicated': 'A'})
            await page.goto('http://127.0.0.1:4198/')
            async def accounts(mode):
                await page.get_by_role('button', name='浏览器设置', exact=True).click()
                await page.get_by_role('radio', name=mode).click()
                await page.get_by_text('已自动保存', exact=True).wait_for()
                await page.get_by_role('button', name='管理账号', exact=True).click()
                await page.locator('.platform-option').first.wait_for()
            async def settle():
                async with asyncio.timeout(20):
                    while True:
                        value = await page.evaluate('async()=>await (await fetch("/api/browser/account-directory")).json()')
                        if value['operation'] and value['operation']['status'] != 'running': return value
                        await asyncio.sleep(.1)
            await accounts('日常 Chrome')
            await page.get_by_role('button', name='检查并登录', exact=True).click()
            assert (await settle())['items'][0]['account']['state'] == 'ready'
            await page.get_by_text('已登录', exact=True).wait_for()
            await page.get_by_role('button', name='关闭网站账号', exact=True).click()
            await accounts('专属浏览器')
            await page.get_by_role('button', name='检查登录', exact=True).click()
            assert (await settle())['items'][0]['account']['state'] == 'ready'
            await page.get_by_text('已登录', exact=True).wait_for()
            count = len((await (await page.request.get('http://127.0.0.1:4198/api/browser/platform-accounts')).json())['checks'])
            await page.get_by_role('button', name='关闭网站账号', exact=True).click()
            await accounts('日常 Chrome')
            await page.get_by_text('已登录', exact=True).wait_for()
            for theme, width, height in [('dark',1280,800),('light',1280,800),('light',390,844),('light',390,480)]:
                if theme == 'light' and width == 1280:
                    await page.get_by_role('button', name='关闭网站账号', exact=True).click()
                    await page.get_by_role('button', name='切换为浅色主题', exact=True).click()
                    await accounts('日常 Chrome')
                await page.set_viewport_size({'width': width, 'height': height})
                if width == 390: await page.locator('.platform-option').first.click()
                await page.get_by_text('已登录', exact=True).wait_for()
                assert await page.locator('.account-checked-at').count() == 1
                assert (await page.locator('.account-checked-at').inner_text()).startswith('上次检查 ')
                bounds = await page.evaluate('''()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect();
                    return {overflow:d.scrollHeight>d.clientHeight+2||d.scrollWidth>d.clientWidth+2,
                      fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}}''')
                assert not bounds['overflow'] and bounds['fits'], bounds
                name = f'{theme}-{width}-{height}'
                await page.get_by_role('dialog').screenshot(path=str(OUT / (name + '.png')))
                proof['samples'].append({'name': name, **bounds})
                if width == 390: await page.get_by_role('button', name='返回平台选择', exact=True).click()
            after = len((await (await page.request.get('http://127.0.0.1:4198/api/browser/platform-accounts')).json())['checks'])
            assert after == count, 'viewing cached login triggered new checks'
            proof['savedChecks'] = count; proof['passed'] = True
        finally: await browser.close()

try: asyncio.run(main())
finally: (OUT / 'result.json').write_text(json.dumps(proof, indent=2) + '\n')
