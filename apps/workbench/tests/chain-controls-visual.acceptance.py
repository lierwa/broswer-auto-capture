"""Headless rendering of production components and captured real runtime events."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    root = Path.cwd()
    out = root / 'work/chain-control-integration-20261004'
    url = 'http://127.0.0.1:4180/tests/fixtures/control-screen.html?evidence=/@fs/' + (out / 'natural-control.json').as_posix()
    proof = {'headless': True, 'source': 'production-components-real-materialized-chain-runtime-events', 'errors': []}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        try:
            page = await browser.new_page(viewport={'width':820, 'height':780}, device_scale_factor=2)
            page.on('pageerror', lambda error: proof['errors'].append(str(error)))
            await page.goto(url)
            await page.locator('.chain-loop-body').wait_for()
            await page.evaluate('document.fonts.ready')
            stage = page.locator('.chain-stage-card')
            before = await stage.bounding_box()
            assert await stage.locator('.chain-status-icon[data-tone="running"]').count() == 1
            assert await stage.locator('[data-node-id="s-advance"] .chain-status-icon[data-tone="running"]').count() == 1
            visible = await stage.inner_text()
            assert not any(word in visible for word in ['上限', '本次已选', '本次未选', '待判定', '循环处理中'])
            columns = await stage.locator('.chain-status-icon').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().right)')
            assert max(columns)-min(columns) < 2, columns
            await page.screenshot(path=str(out / 'connected-running-dark.png'), animations='disabled')
            await stage.screenshot(path=str(out / 'connected-running-card.png'), animations='disabled')
            await page.get_by_role('button', name='下一轮', exact=True).click()
            assert await stage.locator('.chain-status-icon[data-tone="running"]').count() <= 1
            await page.get_by_role('button', name='已结束', exact=True).click()
            assert await stage.locator('.chain-status-icon[data-tone="running"]').count() == 0
            assert before == await stage.bounding_box()
            await page.screenshot(path=str(out / 'connected-complete-dark.png'), animations='disabled')
            target = stage.locator('[data-node-id="s-r1"]')
            await target.click()
            await page.locator('aside[aria-label="动作说明"]').wait_for()
            assert await page.locator('aside[aria-label="动作说明"]').inner_text()
            await page.get_by_role('button', name='关闭检查器').click()
            await page.get_by_role('button', name='切换主题').click()
            await page.screenshot(path=str(out / 'connected-complete-light.png'), animations='disabled')
            assert not proof['errors'], proof['errors']
            proof.update({'passed': True, 'oneCurrentSpinner': True, 'alignedStatusColumn': True,
                          'stableStateGeometry': True, 'noRepeatedStatusText': True, 'realNodeInspector': True,
                          'darkAndLight': True, 'stage': before})
            live = await browser.new_page(viewport={'width':1440, 'height':900})
            writes = []
            async def read_only(route):
                if route.request.method not in ('GET', 'HEAD', 'OPTIONS'):
                    writes.append(route.request.method)
                    await route.abort('blockedbyclient')
                else:
                    await route.continue_()
            await live.route('**/api/**', read_only)
            live.on('pageerror', lambda error: proof['errors'].append(str(error)))
            await live.goto('http://127.0.0.1:4173/')
            await live.locator('.task-list').wait_for()
            tabs = live.get_by_role('button', name='链路', exact=True)
            if await tabs.count(): await tabs.click()
            await live.locator('.chain-stage-card').first.wait_for()
            assert await live.locator('.chain-stage-actions [data-node-id]').count() > 0
            assert not writes, writes
            assert not proof['errors'], proof['errors']
            await live.screenshot(path=str(out / 'existing-workbench-readonly.png'))
            proof['existingWorkbenchReadOnly'] = {'passed':True, 'writes':writes}
        except Exception:
            await page.screenshot(path=str(out / 'failure.png'))
            proof['text'] = (await page.locator('body').inner_text())[-2500:]
            raise
        finally:
            await browser.close()
            (out / 'visual-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps(proof, ensure_ascii=False))


asyncio.run(main())
