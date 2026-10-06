"""Drive the product check button against the isolated native API; no intercepted product calls."""
import asyncio, json, sys
from playwright.async_api import async_playwright

async def main(config):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        try:
            page = await browser.new_page(viewport={'width': 1280, 'height': 800})
            errors = []
            page.on('pageerror', lambda error: errors.append(type(error).__name__))
            await page.goto(config['url'])
            await page.get_by_role('button', name='浏览器设置', exact=True).click()
            await page.get_by_role('button', name='管理账号', exact=True).click()
            previous = await (await page.request.get(config['url'] + '/api/browser/account-directory')).json()
            await page.get_by_role('button', name='检查登录', exact=True).click()
            async with asyncio.timeout(150):
                while True:
                    state = await (await page.request.get(config['url'] + '/api/browser/account-directory')).json()
                    if (state['operation'] and state['operation']['id'] != previous['operation']['id']
                            and state['operation']['intent'] == 'check' and state['operation']['status'] != 'running'):
                        break
                    await asyncio.sleep(.2)
            assert state['operation']['status'] == 'completed', state['operation'].get('reason')
            assert bool(state['notice']) == config.get('noticeExpected', False), state['notice']
            await page.reload()
            await page.get_by_role('button', name='浏览器设置', exact=True).click()
            await page.get_by_role('button', name='管理账号', exact=True).click()
            await page.get_by_text('已登录', exact=True).wait_for()
            if config.get('noticeExpected'):
                await page.get_by_text(state['notice'], exact=True).wait_for()
            assert not errors, errors
            print(json.dumps({'passed': True, 'pageErrors': errors, 'uiCheck': 'completed', 'refresh': 'ready', 'cleanupNotice': bool(state['notice'])}))
        finally:
            await browser.close()

asyncio.run(main(json.loads(sys.stdin.read())))
