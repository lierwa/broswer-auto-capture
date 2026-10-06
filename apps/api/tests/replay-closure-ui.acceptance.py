"""Built UI, real isolated SQLite/API, mocked product browser. Only headless Chrome."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path.cwd() / 'work/replay-closure-20261004'
proof = {'passed': False, 'headless': True, 'personalProfileTouched': False, 'screenshots': []}

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        try:
            page = await browser.new_page(viewport={'width': 1280, 'height': 800})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            await page.goto('http://127.0.0.1:4198/')
            initial = await (await page.request.get('http://127.0.0.1:4199/')).json()
            await page.locator('.task-attention-count').wait_for()
            assert await page.locator('.task-attention-count').inner_text() == '1'
            assert await page.locator('.status-group .task-more').count() == 0
            await page.get_by_role('button', name='任务提醒，1 条未读', exact=True).click()
            item = page.locator('.task-attention-menu [role=menuitem]').filter(has_text='受控恢复与通知样本')
            await item.hover()
            proof['notificationColors'] = await item.evaluate('e=>({background:getComputedStyle(e).backgroundColor,title:getComputedStyle(e.querySelector("strong")).color,detail:getComputedStyle(e.querySelector("small")).color})')
            await page.screenshot(path=str(OUT / 'notification-dark.png'))
            proof['screenshots'].append(str(OUT / 'notification-dark.png'))
            await item.click()
            await page.get_by_role('button', name='返回运行历史', exact=True).wait_for()
            assert await page.locator('.task-attention-count').count() == 0
            await page.reload()
            await page.get_by_role('button', name='任务提醒', exact=True).wait_for()
            assert await page.locator('.task-attention-count').count() == 0
            await page.request.post('http://127.0.0.1:4199/')
            await page.reload()
            await page.get_by_role('button', name='任务提醒，1 条未读', exact=True).click()
            await page.get_by_role('menuitem', name='全部标为已读', exact=True).click()
            assert await page.locator('.task-attention-count').count() == 0
            if not await page.locator('.task-list').is_visible():
                await page.get_by_role('button', name='打开任务列表', exact=True).click()
            row = page.locator('.task-list-item[data-selected=true]')
            await row.hover()
            await row.get_by_role('button', name='受控恢复与通知样本的更多操作', exact=True).click()
            for label in ['重命名', '归档任务', '永久删除']:
                assert await page.get_by_role('menuitem', name=label, exact=True).count() == 1
            await page.keyboard.press('Escape')
            if await page.get_by_role('button', name='链路', exact=True).count():
                await page.get_by_role('button', name='链路', exact=True).click()
            run = page.locator('header[aria-label="运行控制"]').get_by_role('button', name='再次运行', exact=True)
            await run.wait_for()
            assert await run.is_enabled()
            assert await page.get_by_role('button', name='恢复连接', exact=True).count() == 0
            await run.click()
            dialog = page.get_by_role('dialog')
            slider = dialog.get_by_role('slider')
            await slider.focus()
            await page.keyboard.press('Home')
            for _ in range(14): await page.keyboard.press('ArrowRight')
            assert await slider.get_attribute('aria-valuenow') == '2800'
            await dialog.get_by_role('button', name='取消', exact=True).click()
            await page.reload()
            await page.get_by_role('button', name='再次运行', exact=True).click()
            dialog = page.get_by_role('dialog')
            assert await dialog.get_by_role('slider').get_attribute('aria-valuenow') == '2800'
            await page.screenshot(path=str(OUT / 'replay-persisted.png'))
            proof['screenshots'].append(str(OUT / 'replay-persisted.png'))
            await dialog.get_by_role('button', name='开始运行', exact=True).click()
            await dialog.wait_for(state='hidden')
            async with asyncio.timeout(35):
                while True:
                    state = await (await page.request.get('http://127.0.0.1:4199/')).json()
                    newer = [e for e in state['executions'] if e['id'] != initial['executionId']]
                    if newer and newer[0]['status'] == 'completed': break
                    await asyncio.sleep(.2)
            original = next(e for e in state['executions'] if e['id'] == initial['executionId'])
            assert original['status'] == 'failed' and original['cleanup']['status'] == 'confirmed'
            assert original['result'] == initial['executions'][0]['cleanupResume']['result']
            assert newer[0]['pacing']['nodeDelayMs'] == 2800
            proof['replay'] = {'newRun': True, 'firstFailurePreserved': True, 'oldCleanupConfirmed': True,
                               'status': newer[0]['status'], 'modelCalls': newer[0]['consumed']['llmCalls']}
            await page.get_by_role('button', name='浏览器设置', exact=True).click()
            await page.get_by_role('button', name='管理账号', exact=True).click()
            await page.get_by_text('Synthetic A', exact=True).wait_for()
            await page.get_by_text('已登录', exact=True).wait_for()
            proof['browserConsoleErrors'] = errors
            assert errors == [], errors
            proof['passed'] = True
        finally: await browser.close()

OUT.mkdir(parents=True, exist_ok=True)
try: asyncio.run(main())
finally:
    (OUT / 'ui-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(proof, ensure_ascii=False))
