"""Real online cadence signals: native inputs, unavailable evidence, exclusions and business."""
import asyncio
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path.cwd().resolve()
spec = importlib.util.spec_from_file_location('devices', ROOT/'apps/api/tests/antibot-device.acceptance.py')
devices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(devices)


async def raw_key(session, kind, **extra):
    await session.cdp_client.send_raw('Input.dispatchKeyEvent', {'type': kind, 'key': 'a', 'code': 'KeyA',
        'windowsVirtualKeyCode': 65, **extra}, session_id=session.session_id)


async def exercise(browser, out):
    from browser_use.browser.events import TypeTextEvent
    page = await browser.get_current_page()
    results = []
    for mode in ['actor', 'watchdog', 'fast', 'incomplete', 'repeat', 'ime']:
        case = devices.online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
        await devices.online.ready(page, case['url'])
        await page.evaluate('''() => {
          const node=document.createElement('textarea');node.id='owned-cadence';document.body.prepend(node);node.focus();
          globalThis.__keyAudit=[];
          for(const type of ['keydown','keyup','compositionstart'])node.addEventListener(type,e=>__keyAudit.push({type,trusted:e.isTrusted,repeat:!!e.repeat}));
        }''')
        session = await browser.get_or_create_cdp_session()
        try:
            if mode == 'actor':
                await (await page.get_elements_by_css_selector('#owned-cadence'))[0].fill('sampletyping')
            elif mode == 'watchdog':
                state = await browser.get_browser_state_summary()
                node = next(n for n in state.dom_state.selector_map.values() if n.attributes.get('id') == 'owned-cadence')
                event = browser.event_bus.dispatch(TypeTextEvent(node=node, text='sampletyping', clear=True))
                await event
                await event.event_result(raise_if_any=True, raise_if_none=False)
            else:
                for index in range(12):
                    await raw_key(session, 'keyDown', text='a', autoRepeat=mode == 'repeat' and index > 0)
                    if mode != 'repeat' and (mode != 'incomplete' or index != 11): await raw_key(session, 'keyUp')
                if mode == 'repeat': await raw_key(session, 'keyUp')
                if mode == 'ime':
                    await session.cdp_client.send_raw('Input.imeSetComposition', {'text': '测', 'selectionStart': 1, 'selectionEnd': 1},
                        session_id=session.session_id)
                    await session.cdp_client.send_raw('Input.insertText', {'text': '测试'}, session_id=session.session_id)
            expected = 'clear' if mode in ['actor', 'watchdog'] else 'detected' if mode == 'fast' else 'incomplete' if mode == 'incomplete' else 'excluded'
            observed = []
            async with asyncio.timeout(8):
                while True:
                    observed = [r for r in devices.online.observations(case) if r.get('detector') == 'typing-cadence']
                    if observed and observed[-1]['outcome'] == expected: break
                    await asyncio.sleep(.1)
            audit = json.loads(await page.evaluate('() => ({events:__keyAudit,length:document.querySelector("#owned-cadence").value.length})'))
            assert audit['events'] and all(event['trusted'] for event in audit['events'])
            if mode in ['actor', 'watchdog']: assert audit['length'] == len('sampletyping')
            if mode == 'repeat': assert any(event['repeat'] for event in audit['events'])
            if mode == 'ime': assert any(event['type'] == 'compositionstart' for event in audit['events'])
            results.append({'mode': mode, 'expected': expected, 'observations': observed, 'audit': audit})
            devices.online.save(out, 'cadence-online.json', results)
            if mode == 'actor':
                await (await page.get_elements_by_css_selector('a[href$="/document/7"]'))[0].click()
                async with asyncio.timeout(10):
                    while not (await page.get_url()).endswith('/document/7'): await asyncio.sleep(.05)
                business = [json.loads(r['value']) for r in devices.online.local('/api/report')['business']
                            if r['case_id'] == case['id'] and r['action'] == 'selected']
                assert business == [{'version': 7, 'correct': True}]
                devices.online.save(out, 'business.json', business)
        finally:
            if mode == 'incomplete': await raw_key(session, 'keyUp')
            devices.online.save(out, mode+'-observations.json', devices.online.observations(case))
    devices.online.save(out, 'passed.json', {'cases': len(results), 'fullTls': True, 'modelCalls': 0})


async def remaining(browser, out):
    page = await browser.get_current_page()
    case = devices.online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
    await devices.online.ready(page, case['url'])
    await page.evaluate('''() => {
      const fetchOriginal=globalThis.fetch;globalThis.__cadencePackets=[];
      globalThis.fetch=(url,options)=>{
        if(typeof options?.body==='string'){
          const data=JSON.parse(options.body);if(data.behavior?.cadence)__cadencePackets.push(data.behavior.cadence);
        }
        return fetchOriginal(url,options);
      };
      const node=document.createElement('textarea');node.id='owned-cadence';document.body.prepend(node);node.focus();
    }''')
    session = await browser.get_or_create_cdp_session()
    results = []
    for mode in ['capacity', 'restored', 'paste', 'next-field']:
        if mode == 'capacity':
            for _ in range(125):
                await raw_key(session, 'keyDown', text='a')
                await raw_key(session, 'keyUp')
        elif mode == 'restored':
            await page.evaluate('''() => {const n=document.querySelector('#owned-cadence');n.blur();n.value='';n.focus();}''')
            await (await page.get_elements_by_css_selector('#owned-cadence'))[0].fill('sampletyping')
        else:
            if mode == 'paste':
                await page.evaluate("() => document.querySelector('#owned-cadence').dispatchEvent(new ClipboardEvent('paste',{bubbles:true}))")
            else:
                await page.evaluate('''() => {
                  const n=document.createElement('textarea');n.id='owned-next';n.name='fixture-name-not-telemetry';
                  document.body.prepend(n);n.focus();
                }''')
                for _ in range(11):
                    await raw_key(session, 'keyDown', text='a')
                    await raw_key(session, 'keyUp')
        async with asyncio.timeout(8):
            while True:
                packets = json.loads(await page.evaluate('() => __cadencePackets'))
                sample = packets[-1] if packets else None
                expected_count = 100 if mode == 'capacity' else 11 if mode == 'next-field' else 12
                if sample and sample['keyCount'] == expected_count and sample['pending'] == 0 and sample['excluded'] == (mode in ['paste', 'next-field']): break
                await asyncio.sleep(.1)
        observed = [r for r in devices.online.observations(case) if r.get('detector') == 'typing-cadence']
        expected = 'detected' if mode == 'capacity' else 'clear' if mode == 'restored' else 'excluded'
        async with asyncio.timeout(5):
            while not observed or observed[-1]['outcome'] != expected:
                await asyncio.sleep(.1)
                observed = [r for r in devices.online.observations(case) if r.get('detector') == 'typing-cadence']
        results.append({'mode': mode, 'sample': sample, 'observation': observed[-1]})
        devices.online.save(out, 'cadence-state.json', results)
        assert sample['keyCount'] == len(sample['dwellTimes']) == len(sample['intervals']) + 1
        assert 'fixture-name-not-telemetry' not in json.dumps(sample)
    assert await page.evaluate('() => typeof captureCadence') == 'undefined', 'collector_leaked_global'
    devices.online.save(out, 'passed.json', {'capacityAndRecovery': True, 'pasteControlSynthetic': True,
        'pagePasteExclusionPreserved': True, 'modelCalls': 0})


if __name__ == '__main__':
    devices.exercise = remaining if '--remaining' in sys.argv else exercise
    asyncio.run(devices.main())
