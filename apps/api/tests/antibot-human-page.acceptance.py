"""UI wiring check only. Accelerated clock and automated input are never human evidence."""
import asyncio
import importlib.util
import json
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('owned_input', Path(__file__).with_name('antibot-input.acceptance.py'))
owned = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owned)
owned.PURPOSE = 'human-page-automated-fixture-not-human'


async def exercise(browser, out):
    focus_check = '--focus-check' in sys.argv
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/human/' + '0' * 32 + ('?phase=2&mode=focus' if focus_check else ''))
    for _ in range(40):
        if await page.evaluate("() => typeof document.querySelector('#start')?.onclick") == 'function': break
        await asyncio.sleep(.1)
    await page.evaluate("() => {window.__errors=[];window.__clicks=[];addEventListener('error',e=>window.__errors.push(e.message));document.addEventListener('click',e=>window.__clicks.push({id:e.target.id,tag:e.target.tagName,x:e.clientX,y:e.clientY}),true);}")
    await (await page.get_elements_by_css_selector('#start'))[0].click()
    await asyncio.sleep(.7)
    owned.save(out, 'ui-state.json', json.loads(await page.evaluate("() => ({status:document.querySelector('#status').textContent,disabled:document.querySelector('#start').disabled,onclick:typeof document.querySelector('#start').onclick,rect:document.querySelector('#start').getBoundingClientRect().toJSON(),clicks:window.__clicks,errors:window.__errors,resources:performance.getEntriesByType('resource').map(e=>({name:e.name,status:e.responseStatus}))})")))
    assert '秒' in await page.evaluate("() => document.querySelector('#status').textContent")
    await (await page.get_elements_by_css_selector('#entry'))[0].fill('synthetic fixture')
    if focus_check:
        await page.press('Tab')
        await page.press('Shift+Tab')
    # 仅缩短UI等待；拦截提交保存夹具，不写入真人会话。
    await page.evaluate("""() => {
      const now=performance.now.bind(performance); performance.now=()=>now()+46000;
      window.fetch=async (url,options)=>{window.name=options.body;return new Response('{}',{status:201});};
    }""")
    await asyncio.sleep(.7)
    await (await page.get_elements_by_css_selector('#end'))[0].click()
    await asyncio.sleep(.7)
    raw = await page.evaluate('() => window.name')
    sample = json.loads(raw)
    assert sample['phase'] == (2 if focus_check else 0) and sample['data']['k'] and sample['audit']
    assert 'synthetic fixture' not in raw
    if focus_check:
        assert sample['counts']['tabKeydown'] == 2
        assert '补测已保存' in await page.evaluate("() => document.querySelector('#status').textContent")
    else:
        assert '第 2 段' in await page.evaluate("() => document.querySelector('#heading').textContent")
    owned.save(out, 'synthetic-schema-fixture.json', sample)
    return {'inputValueCorrect': True, 'inputEvents': [],
        'probe': {'verdict': 'ui-only', 'validity': 'synthetic-clock-not-human'}}


owned.exercise = exercise
asyncio.run(owned.main())
