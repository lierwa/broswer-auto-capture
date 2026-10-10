"""Owned Windows native range input must preserve exact values, React and trusted events."""
import asyncio
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path.cwd().resolve()
spec = importlib.util.spec_from_file_location('devices', ROOT/'apps/api/tests/antibot-device.acceptance.py')
devices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(devices)


async def exercise(browser, out):
    from browser_use.browser.events import TypeTextEvent
    page = await browser.get_current_page()
    results = []
    for mode, target_id, value in [('actor', 'owned-range', '0.12345'), ('watchdog', 'owned-range', '0.76543'),
                                  ('actor', '', '0.23456'), ('watchdog', '', '0.87654')]:
        await page.goto('https://localhost:4185/measurement/inputs')
        await page.evaluate('''(id) => {
          const node=document.querySelector('input[type=range]');
          node.id=id;node.min='0';node.max='1';node.step='any';
          globalThis.__rangeEvents=[];
          for(const type of ['input','change','focus','blur'])node.addEventListener(type,e=>__rangeEvents.push({type,trusted:e.isTrusted}));
        }''', target_id)
        if mode == 'actor':
            await (await page.get_elements_by_css_selector('input[type=range]'))[0].fill(value)
        else:
            state = await browser.get_browser_state_summary()
            node = next(n for n in state.dom_state.selector_map.values() if n.attributes.get('type') == 'range')
            event = browser.event_bus.dispatch(TypeTextEvent(node=node, text=value, clear=True))
            await event
            await event.event_result(raise_if_any=True, raise_if_none=False)
        result = json.loads(await page.evaluate('''() => ({value:document.querySelector('input[type=range]').value,
          state:document.querySelector('#range-state').textContent,committed:document.querySelector('#range-committed').textContent,
          focused:document.activeElement.type==='range',events:globalThis.__rangeEvents})'''))
        results.append({'mode': mode, 'hasId': bool(target_id), 'expected': value, 'actual': result})
        devices.online.save(out, 'native-fine-range.json', results)
        assert result['value'] == result['state'] == result['committed'] == value and result['focused']
        assert result['events'] and all(e['trusted'] for e in result['events']), 'fine_range_used_scripted_fallback'
    devices.online.save(out, 'passed.json', {'cases': len(results), 'scriptedEvents': 0, 'modelCalls': 0})


async def joint(browser, out):
    from workflow_use.hybrid.capability import OrdinaryCapability
    page = await browser.get_current_page()
    case = devices.online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
    await devices.online.ready(page, case['url'])
    await page.evaluate('''() => {
      const range=document.createElement('input');range.type='range';range.min='0';range.max='1';range.step='any';
      range.id='owned-fine-range';range.value='0';document.body.prepend(range);
      globalThis.__rangeEvents=[];
      for(const type of ['input','change'])range.addEventListener(type,e=>__rangeEvents.push({type,trusted:e.isTrusted}));
    }''')
    capability = OrdinaryCapability(browser)
    try:
        result = await capability.execute_checked('input', {'text': '0.12345', 'clear': True},
            {'strategy': 'css', 'value': '#owned-fine-range'}, [])
        actual = json.loads(await page.evaluate('() => ({value:document.querySelector("#owned-fine-range").value,events:__rangeEvents})'))
        devices.online.save(out, 'fine-ordinary.json', {'actual': actual, 'capture': result['metadata']['batActionPreparation']})
        assert actual['value'] == '0.12345' and actual['events'] and all(e['trusted'] for e in actual['events'])
        assert result['metadata']['batActionPreparation']['eventCount'] > 0
        await asyncio.sleep(1.2)
        rows = devices.online.observations(case)
        devices.online.save(out, 'fine-online.json', rows)
        assert len([r for r in rows if r.get('detector_version') == '2.0.0']) == 18
        assert len([r for r in rows if r.get('detector', '').startswith('creepWorker.')]) == 4
        assert not any(r.get('outcome') == 'detected' for r in rows)
        events = [r for r in rows if r['category'] == 'input' and r['event_type'] in ['input', 'change']]
        assert events and all(r['trusted'] == 'true' for r in events)
        await capability.execute_checked('click', {}, {'strategy': 'css', 'value': 'a[href$="/document/7"]'}, [])
        async with asyncio.timeout(10):
            while not (await page.get_url()).endswith('/document/7'): await asyncio.sleep(.05)
        business = [json.loads(r['value']) for r in devices.online.local('/api/report')['business']
                    if r['case_id'] == case['id'] and r['action'] == 'selected']
        assert business == [{'version': 7, 'correct': True}]
        devices.online.save(out, 'passed.json', {'fullTls': True, 'ordinaryInputCapture': True,
            'shieldClear': True, 'business': business, 'modelCalls': 0})
    finally:
        await capability.event_capture.close()


if __name__ == '__main__':
    devices.exercise = joint if '--joint' in sys.argv else exercise
    asyncio.run(devices.main())
