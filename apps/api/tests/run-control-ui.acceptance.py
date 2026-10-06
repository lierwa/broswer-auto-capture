"""Read-only actual Workbench rendering; every product mutation is intercepted."""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path.cwd() / 'work/run-control-20261004'
proof = {'passed': False, 'screenshots': [], 'unexpectedMutations': [], 'posts': []}

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        try:
            page = await browser.new_page(viewport={'width':1280, 'height':800})
            lost = False
            async def gate(route):
                request = route.request
                if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                    if '/api/task-chain?' in request.url:
                        proof['posts'].append(request.post_data_json)
                        if lost: await route.abort('failed'); return
                        await route.fulfill(status=409, content_type='application/json', body=json.dumps({'error':'受控验证：暂时无法开始运行','code':'task_busy'}))
                    else:
                        proof['unexpectedMutations'].append(request.url)
                        await route.abort('blockedbyclient')
                else: await route.continue_()
            await page.route('**/api/**', gate)
            await page.goto('http://127.0.0.1:4173/')
            if await page.get_by_role('button', name='链路', exact=True).count():
                await page.get_by_role('button', name='链路', exact=True).click()
            toolbar = page.locator('header[aria-label="运行控制"]')
            await toolbar.wait_for()
            assert await toolbar.get_by_text('查看结果', exact=True).count() == 0
            assert await page.locator('.execution-strip, .workbench-alert').count() == 0
            async def screenshot(name):
                await page.wait_for_timeout(300)
                file = OUT / f'{name}.png'
                await page.screenshot(path=str(file)); proof['screenshots'].append(str(file))
            await screenshot('toolbar-completed-dark')
            await page.get_by_role('button', name='再次运行', exact=True).click()
            dialog = page.get_by_role('dialog')
            await dialog.get_by_role('combobox').click()
            menu = page.get_by_role('listbox')
            await menu.wait_for()
            height = await menu.evaluate('e=>e.getBoundingClientRect().height')
            assert height < 250, height
            proof['selectHeight'] = height
            await screenshot('run-browser-menu-dark')
            await page.keyboard.press('Escape')
            await dialog.get_by_role('button', name='开始运行', exact=True).click()
            await dialog.get_by_role('button', name='重试', exact=True).wait_for()
            assert await page.get_by_text('受控验证：暂时无法开始运行', exact=True).count() == 1
            for name,size in [('run-dark',{'width':1280,'height':800}),('run-short',{'width':1024,'height':480}),('run-narrow',{'width':390,'height':650})]:
                await page.set_viewport_size(size); await page.wait_for_timeout(200)
                geometry = await dialog.evaluate('e=>{const r=e.getBoundingClientRect();return {noScroll:e.scrollHeight<=e.clientHeight+2,fits:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}}')
                assert all(geometry.values()), geometry
                proof[name] = geometry; await screenshot(name)
            await dialog.get_by_role('button', name='取消', exact=True).click()
            assert await page.get_by_text('受控验证：暂时无法开始运行', exact=True).count() == 0
            await page.set_viewport_size({'width':1280,'height':800})
            await page.get_by_role('button', name='切换为浅色主题', exact=True).click()
            await page.get_by_role('button', name='再次运行', exact=True).click()
            await screenshot('run-light')
            lost = True
            await dialog.get_by_role('button', name='开始运行', exact=True).click()
            await dialog.get_by_role('button', name='核验原请求', exact=True).wait_for()
            await screenshot('run-unknown-light')
            await dialog.get_by_role('button', name='关闭', exact=True).click()
            await page.get_by_role('button', name='核验启动', exact=True).click()
            assert await dialog.get_by_role('combobox').count() == 0
            lost = False
            await dialog.get_by_role('button', name='核验原请求', exact=True).click()
            await dialog.get_by_role('button', name='重试', exact=True).wait_for()
            assert proof['posts'][-1] == proof['posts'][-2]
            await dialog.get_by_role('button', name='取消', exact=True).click()
            await page.locator('.react-flow__node').filter(has_text='完成').last.click(force=True)
            await page.get_by_role('button', name='查看本次任务成果', exact=True).click()
            drawer = page.get_by_role('dialog')
            grip = drawer.get_by_role('button', name='调整本次任务成果宽度')
            await grip.focus(); await page.keyboard.press('End')
            await page.wait_for_timeout(200); await screenshot('result-resized-light')
            width = await page.locator('.draft-drawer-body').evaluate('e=>e.getBoundingClientRect().width')
            assert width >= 1000, width
            proof['resultDrawerWidth'] = width
            await drawer.get_by_role('button', name='关闭本次任务成果').click()
            assert await page.get_by_role('button', name='查看本次任务成果', exact=True).evaluate('e=>document.activeElement===e')
            proof['toolbarStates'] = []
            for state,label in [('running','正在运行'),('waiting_for_human','等待人工处理'),('failed','运行失败'),('cleanup_required','连接待恢复')]:
                view = await browser.new_page(viewport={'width':1280,'height':800})
                async def states(route):
                    if route.request.method not in ('GET','HEAD','OPTIONS'):
                        proof['unexpectedMutations'].append(route.request.url); await route.abort('blockedbyclient'); return
                    if '/api/task-chain?' not in route.request.url and '/api/task-chain/execution?' not in route.request.url:
                        await route.continue_(); return
                    response = await route.fetch()
                    value = await response.json(); record = value.get('execution')
                    if record:
                        record['status'] = state
                        if 'reason' in record and state in ('waiting_for_human','failed'):
                            record['reason'] = '请在网站完成登录' if state == 'waiting_for_human' else '受控站点暂时不可用'
                        if state == 'cleanup_required':
                            record['cleanup'] = {**record['cleanup'],'status':'unconfirmed','code':'cleanup_browser_close_failed'}
                            if 'reason' in record: record['cleanupResume'] = {'status':'completed','reason':'已完成','result':record.get('result')}
                        if state == 'waiting_for_human': record['browserHandoff']['purpose'] = 'human_wait'
                    await route.fulfill(response=response, json=value)
                await view.route('**/api/**', states)
                await view.goto('http://127.0.0.1:4173/')
                if await view.get_by_role('button',name='链路',exact=True).count(): await view.get_by_role('button',name='链路',exact=True).click()
                bar = view.locator('header[aria-label="运行控制"]')
                await bar.wait_for(); await view.wait_for_timeout(350)
                text = await bar.inner_text()
                assert label in text, (state,text)
                assert await bar.get_by_role('button',name='再次运行',exact=True).is_disabled() == (state != 'failed')
                assert await view.get_by_role('dialog').count() == 0
                assert await view.get_by_role('complementary',name='运行结果').count() == 0
                file = OUT/f'toolbar-{state}-dark.png'; await view.screenshot(path=str(file))
                proof['screenshots'].append(str(file)); proof['toolbarStates'].append({'state':state,'text':text,'syntheticReadOnlyView':True})
                await view.close()
            assert not proof['unexpectedMutations'], proof['unexpectedMutations']
            proof['passed'] = True
        finally: await browser.close()

try: asyncio.run(main())
finally: (OUT/f'ui-{sys.argv[1] if len(sys.argv)>1 else "first"}.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
