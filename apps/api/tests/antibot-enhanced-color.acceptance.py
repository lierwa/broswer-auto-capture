"""Actual Blink alpha/P3 support: native input must retain value, React state and trusted events."""
import asyncio
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path.cwd().resolve()
spec = importlib.util.spec_from_file_location('devices', ROOT/'apps/api/tests/antibot-device.acceptance.py')
devices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(devices)


class EnhancedWindow(devices.ManagedWindow):
    async def _launch(self, lease):
        original = subprocess.Popen
        def launch(args, **kwargs):
            if '--user-data-dir=' + str(self.profile_path) in args:
                args = [*args, '--enable-blink-features=InputTypeColorEnhancements']
            return original(args, **kwargs)
        with patch('browser_use_runner.managed_window.subprocess.Popen', side_effect=launch):
            return await super()._launch(lease)


async def popup_fields(page):
    element = (await page.get_elements_by_css_selector('input[type=color]'))[0]
    await page._client.send.Accessibility.enable(session_id=page._session_id)
    await element.click()
    try:
        tree = (await page._client.send.Accessibility.getFullAXTree(session_id=page._session_id))['nodes']
        nodes = {n['nodeId']: n for n in tree}
        owner = next(n for n in tree if n.get('role', {}).get('value') == 'ColorWell')
        pending, result, seen = list(owner.get('childIds', [])), [], set()
        while pending and len(seen) < 128:
            key = pending.pop()
            if key in seen: continue
            seen.add(key); item = nodes.get(key, {}); pending.extend(item.get('childIds', []))
            role = item.get('role', {}).get('value')
            if role not in ['textbox', 'button', 'spinbutton', 'slider'] or not item.get('backendDOMNodeId'): continue
            node = (await page._client.send.DOM.describeNode(params={'backendNodeId': item['backendDOMNodeId']},
                session_id=page._session_id))['node']
            result.append({'role': role, 'nodeName': node['nodeName'], 'attributes': node.get('attributes', [])})
        return result
    finally:
        await page.press('Escape')


async def exercise(browser, out):
    from browser_use.browser.events import TypeTextEvent
    page = await browser.get_current_page()
    rows = []
    cases = [('alpha', '#12345680', {'alpha': ''}),
             ('alpha-transparent', '#abcdef00', {'alpha': ''}),
             ('p3', 'color(display-p3 1 0 0 / 0.5)', {'alpha': '', 'colorspace': 'display-p3'})]
    if '--remaining' in sys.argv:
        cases = [('alpha-opaque', '#123456', {'alpha': ''}),
                 ('css-alpha', 'rgba(25, 50, 75, 0.4)', {'alpha': ''}),
                 ('p3-opaque', 'color(display-p3 0 1 0)', {'colorspace': 'display-p3'})]
    for mode in ['actor', 'watchdog']:
        for name, value, attrs in cases:
            await page.goto('https://localhost:4185/measurement/inputs')
            expected = json.loads(await page.evaluate('''(data) => {
              const node=document.querySelector('input[type=color]');
              for(const [key,value] of Object.entries(data.attrs))node.setAttribute(key,value);
              const copy=node.cloneNode();copy.value=data.value;
              if(data.value==='#123456')node.value='#abcdef00';
              globalThis.__colorEvents=[];
              for(const type of ['input','change','focus','blur'])node.addEventListener(type,e=>__colorEvents.push({type,trusted:e.isTrusted}));
              return {value:copy.value,alpha:node.alpha,colorSpace:node.colorSpace};
            }''', {'value': value, 'attrs': attrs}))
            assert expected['alpha'] == ('alpha' in attrs) and expected['colorSpace'] == attrs.get('colorspace', 'limited-srgb')
            if '--baseline' in sys.argv and mode == 'actor':
                devices.online.save(out, name+'-popup.json', await popup_fields(page))
                await page.evaluate('() => {globalThis.__colorEvents=[];}')
            if mode == 'actor':
                await (await page.get_elements_by_css_selector('input[type=color]'))[0].fill(value)
            else:
                state = await browser.get_browser_state_summary()
                node = next(n for n in state.dom_state.selector_map.values() if n.attributes.get('type') == 'color')
                event = browser.event_bus.dispatch(TypeTextEvent(node=node, text=value, clear=True))
                await event
                await event.event_result(raise_if_any=True, raise_if_none=False)
            actual = json.loads(await page.evaluate('''() => ({value:document.querySelector('input[type=color]').value,
              state:document.querySelector('#color-state').textContent,committed:document.querySelector('#color-committed').textContent,
              focused:document.activeElement.type==='color',events:globalThis.__colorEvents})'''))
            rows.append({'mode': mode, 'case': name, 'expected': expected, 'actual': actual,
                         'scripted': sum(not e['trusted'] for e in actual['events'])})
            devices.online.save(out, 'enhanced-color.json', rows)
            assert actual['value'] == actual['state'] == actual['committed'] == expected['value'] and actual['focused']
    if '--baseline' in sys.argv:
        assert all(row['scripted'] > 0 for row in rows), 'original_extended_fallback_changed'
    else:
        assert all(row['scripted'] == 0 for row in rows if row['case'].startswith('alpha')), 'alpha_used_scripted_fallback'
        assert all(row['scripted'] > 0 for row in rows if not row['case'].startswith('alpha')), 'fidelity_fallback_changed'
    devices.online.save(out, 'passed.json', {'cases': len(rows), 'baseline': '--baseline' in sys.argv, 'modelCalls': 0})


async def frames(browser, out):
    from browser_use.browser.events import TypeTextEvent
    from browser_use_runner.task_input import TaskPage
    page = await browser.get_current_page()
    rows = []
    for kind, host in [('same-origin', 'localhost'), ('oopif', 'frame.localhost')]:
        for mode in ['actor', 'watchdog']:
            await page.goto('https://localhost:4185/measurement/inputs')
            await page.evaluate('''(url) => new Promise(resolve=>{
              document.body.replaceChildren();const frame=document.createElement('iframe');
              frame.style.cssText='width:1100px;height:700px';frame.onload=()=>resolve(true);
              frame.src=url;document.body.append(frame);
            })''', f'https://{host}:4185/measurement/inputs')
            state = await browser.get_browser_state_summary()
            nodes = [n for n in state.dom_state.selector_map.values() if n.attributes.get('type') == 'color']
            assert len(nodes) == 1
            node = nodes[0]
            session = await browser.cdp_client_for_node(node)
            target = (await session.cdp_client.send.Target.getTargetInfo(params={'targetId': session.target_id}))['targetInfo']
            if kind == 'oopif': assert target['type'] == 'iframe', 'oopif_not_established'
            frame_page = TaskPage(browser, session.target_id, session_id=session.session_id)
            element = await frame_page.get_element(node.backend_node_id)
            object_id = await element._get_remote_object_id()
            expected = (await frame_page._client.send.Runtime.callFunctionOn(params={'objectId': object_id, 'returnByValue': True,
                'functionDeclaration': '''function(){
                  this.alpha=true;this._events=[];const copy=this.cloneNode();copy.value='#12345680';
                  for(const type of ['input','change'])this.addEventListener(type,e=>this._events.push({type,trusted:e.isTrusted}));
                  return copy.value;
                }'''}, session_id=session.session_id))['result']['value']
            if mode == 'actor': await element.fill('#12345680')
            else:
                event = browser.event_bus.dispatch(TypeTextEvent(node=node, text='#12345680', clear=True))
                await event
                await event.event_result(raise_if_any=True, raise_if_none=False)
            actual = (await frame_page._client.send.Runtime.callFunctionOn(params={'objectId': object_id, 'returnByValue': True,
                'functionDeclaration': '''function(){return {value:this.value,
                  state:this.ownerDocument.querySelector('#color-state').textContent,
                  committed:this.ownerDocument.querySelector('#color-committed').textContent,events:this._events};}'''},
                session_id=session.session_id))['result']['value']
            rows.append({'kind': kind, 'mode': mode, 'targetType': target['type'], 'expected': expected, 'actual': actual})
            devices.online.save(out, 'enhanced-color-frames.json', rows)
            assert actual['value'] == actual['state'] == actual['committed'] == expected
            assert actual['events'] and all(e['trusted'] for e in actual['events'])
    devices.online.save(out, 'passed.json', {'cases': len(rows), 'scriptedEvents': 0, 'modelCalls': 0})


async def joint(browser, out):
    from workflow_use.hybrid.capability import OrdinaryCapability
    page = await browser.get_current_page()
    case = devices.online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
    await devices.online.ready(page, case['url'])
    expected = await page.evaluate('''() => {
      const node=document.createElement('input');node.type='color';node.alpha=true;node.id='owned-alpha';
      document.body.prepend(node);const copy=node.cloneNode();copy.value='#12345680';return copy.value;
    }''')
    capability = OrdinaryCapability(browser)
    try:
        result = await capability.execute_checked('input', {'text': '#12345680', 'clear': True},
            {'strategy': 'css', 'value': '#owned-alpha'}, [])
        actual = await page.evaluate('() => document.querySelector("#owned-alpha").value')
        assert actual == expected and result['metadata']['batActionPreparation']['eventCount'] > 0
        await asyncio.sleep(1.2)
        rows = devices.online.observations(case)
        devices.online.save(out, 'color-joint.json', {'value': actual, 'capture': result['metadata']['batActionPreparation'], 'rows': rows})
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


async def compat(browser, out):
    spec = importlib.util.spec_from_file_location('inputs', ROOT/'apps/api/tests/antibot-input.acceptance.py')
    inputs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inputs)
    result = await inputs.exercise_color_list(browser, out)
    devices.online.save(out, 'passed.json', result)


if __name__ == '__main__':
    devices.ManagedWindow = EnhancedWindow
    devices.exercise = frames if '--frames' in sys.argv else joint if '--joint' in sys.argv else compat if '--compat' in sys.argv else exercise
    asyncio.run(devices.main())
