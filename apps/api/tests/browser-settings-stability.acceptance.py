"""Built product UI, delayed authorization and real fixture settings API; no personal Profile."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path.cwd() / os.environ.get('BAT_SETTINGS_STABILITY_OUT', 'work/browser-account-ui-sharing-20261004/ui-first')
OUT.mkdir(parents=True, exist_ok=True)
proof = {'passed': False, 'personalProfileTouched': False, 'samples': {}}

async def inspect(page, name):
    bounds = await page.evaluate('''()=>{const d=document.querySelector('[role=dialog]'), a=document.querySelector('.browser-account-entry');
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
      return {dialog:rect(d),accounts:rect(a),overflow:d.scrollWidth>d.clientWidth+1,
        titles:[...document.querySelectorAll('.browser-environment-choice-title')].map(e=>({height:e.clientHeight,width:e.scrollWidth,available:e.parentElement.clientWidth}))}}''')
    proof['samples'][name] = bounds
    assert all(t['height'] < 25 and t['width'] <= t['available'] for t in bounds['titles']), bounds
    await page.get_by_role('dialog').screenshot(path=str(OUT / (name + '.png')))
    return bounds

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        try:
            page = await browser.new_page(viewport={'width':1280, 'height':800})
            async def authorization(route):
                await asyncio.sleep(.6)
                await route.fulfill(json={'paired':True, 'busy':False, 'profileDirectory':'Default',
                    'extensionDirectory':'Owned fixture', 'profiles':[{'id':'Default','name':'测试 Chrome'}]})
            await page.route('**/api/browser/daily-chrome', authorization)
            await page.goto('http://127.0.0.1:4198/')
            await page.get_by_role('button', name='浏览器设置', exact=True).click()
            await page.get_by_text('已授权', exact=True).wait_for()
            for size, theme in [(1280,'dark'), (390,'dark'), (1280,'light'), (390,'light')]:
                await page.set_viewport_size({'width':size, 'height':844 if size == 390 else 800})
                if theme == 'light' and size == 1280:
                    await page.get_by_role('button', name='关闭浏览器设置', exact=True).click()
                    await page.get_by_role('button', name='切换为浅色主题', exact=True).click()
                    await page.get_by_role('button', name='浏览器设置', exact=True).click()
                    await page.get_by_text('已授权', exact=True).wait_for()
                before = await inspect(page, f'{size}-{theme}-daily')
                await page.evaluate('''()=>{window.__bounds=[];window.__track=true;const tick=()=>{if(!window.__track)return;
                    const d=document.querySelector('[role=dialog]').getBoundingClientRect();window.__bounds.push({x:d.x,y:d.y,height:d.height});requestAnimationFrame(tick)};tick()}''')
                await page.get_by_role('radio', name='专属浏览器').click()
                await page.get_by_role('switch', name='运行时显示浏览器窗口', exact=True).wait_for()
                await page.get_by_text('已自动保存', exact=True).wait_for()
                dedicated = await inspect(page, f'{size}-{theme}-dedicated')
                await page.get_by_role('radio', name='日常 Chrome').click()
                await page.get_by_text('已授权', exact=True).wait_for()
                await page.get_by_text('已自动保存', exact=True).wait_for()
                await page.wait_for_timeout(150)
                after = await inspect(page, f'{size}-{theme}-daily-again')
                frames = await page.evaluate('()=>{window.__track=false;return window.__bounds}')
                proof['samples'][f'{size}-{theme}-frames'] = frames
                assert not before['overflow'] and not dedicated['overflow'] and not after['overflow']
                assert max(f['height'] for f in frames) - min(f['height'] for f in frames) < 1, frames
                assert abs(before['accounts']['y'] - dedicated['accounts']['y']) < 1
            proof['passed'] = True
        finally:
            await browser.close()

try: asyncio.run(main())
finally: (OUT / 'result.json').write_text(json.dumps(proof, indent=2) + '\n')
