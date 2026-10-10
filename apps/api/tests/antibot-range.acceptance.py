"""Large native ranges must retain value/framework/blur semantics without scripted input."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path.cwd()
spec = importlib.util.spec_from_file_location('inputs', ROOT / 'apps/api/tests/antibot-input.acceptance.py')
inputs = importlib.util.module_from_spec(spec); spec.loader.exec_module(inputs)


async def exercise(browser, out):
    from browser_use.browser.events import TypeTextEvent
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    for _ in range(40):
        if await page.get_elements_by_css_selector('input[type=range]'): break
        await asyncio.sleep(.1)
    await page.evaluate("""() => {
      globalThis.__events=[];
      for(const type of ['input','change','focus','blur','click','keydown'])
        document.addEventListener(type,e=>__events.push({type,trusted:e.isTrusted}),true);
    }""")
    cases = [('horizontal-tb', 'ltr', 1), ('horizontal-tb', 'rtl', 1),
             ('vertical-lr', 'ltr', 1), ('vertical-rl', 'rtl', 1.25)]
    rows = []
    for mode in ['actor', 'watchdog']:
        for writing, direction, zoom in cases:
            await page.evaluate("""(c) => {
              const node=document.querySelector('input[type=range]');
              node.min='0';node.max='10000';node.step='1';
              node.style.cssText=`writing-mode:${c.writing};direction:${c.direction};zoom:${c.zoom};`+
                (c.writing==='horizontal-tb'?'width:400px':'height:400px');
            }""", dict(writing=writing, direction=direction, zoom=zoom))
            target = '3333' if mode == 'actor' else '7666'
            # Reset through native Home, not a setter; each case needs a large move.
            element = (await page.get_elements_by_css_selector('input[type=range]'))[0]
            await page._client.send.DOM.focus(params={'backendNodeId': element._backend_node_id}, session_id=element._session_id)
            await page.press('Home')
            await inputs.snapshot(page)
            if mode == 'actor': await element.fill(target)
            else:
                state = await browser.get_browser_state_summary()
                node = next(n for n in state.dom_state.selector_map.values() if n.attributes.get('type') == 'range')
                event = browser.event_bus.dispatch(TypeTextEvent(node=node, text=target, clear=True))
                await event; await event.event_result(raise_if_any=True, raise_if_none=False)
            actual = json.loads(await page.evaluate("""() => ({value:document.querySelector('input[type=range]').value,
              state:document.querySelector('#range-state').textContent,committed:document.querySelector('#range-committed').textContent,
              focused:document.activeElement.type==='range'})"""))
            events = await inputs.snapshot(page)
            rows.append(dict(mode=mode, writing=writing, direction=direction, zoom=zoom, expected=target,
                             actual=actual, events=events, scripted=sum(not e['trusted'] for e in events)))
            inputs.save(out, 'range-native.json', rows)
            assert actual['value'] == actual['state'] == actual['committed'] == target and actual['focused']
            assert rows[-1]['scripted'] == 0
            assert sum(e['type'] == 'click' for e in events) == 1
    return dict(cases=len(rows), scriptedEvents=0, modelCalls=0, otherPlatformsTested=False)


async def nested_exercise(browser, out):
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    await page.evaluate("""() => {
      const host=document.createElement('div');host.id='owned-shadow';
      const shadow=host.attachShadow({mode:'open'});
      shadow.innerHTML='<input type="range" min="0" max="10000" step="1" value="0" style="width:400px">';
      document.body.prepend(host);
      const frame=document.createElement('iframe');frame.id='owned-frame';
      frame.src='/measurement/inputs';frame.style.cssText='width:500px;height:350px';
      document.body.append(frame);
    }""")
    for _ in range(50):
        if str(await page.evaluate("() => !!document.querySelector('#owned-frame').contentDocument?.querySelector('input[type=range]')")).lower() == 'true': break
        await asyncio.sleep(.1)
    rows = []
    await page._client.send.DOM.getDocument(params={'depth': -1, 'pierce': True}, session_id=page._session_id)
    for container in ['shadow', 'frame']:
        expression = ("document.querySelector('#owned-shadow').shadowRoot.querySelector('input')" if container == 'shadow'
                      else "document.querySelector('#owned-frame').contentDocument.querySelector('input[type=range]')")
        obj = (await page._client.send.Runtime.evaluate(params={'expression': expression}, session_id=page._session_id))['result']['objectId']
        try:
            await page._client.send.Runtime.callFunctionOn(params={'objectId': obj, 'functionDeclaration': """function(){
              this.min='0';this.max='10000';this.step='1';this.style.width='400px';this._probe=[];
              for(const type of ['input','change','click'])this.addEventListener(type,e=>this._probe.push({type,trusted:e.isTrusted}));
            }"""}, session_id=page._session_id)
            node = (await page._client.send.DOM.describeNode(params={'objectId': obj}, session_id=page._session_id))['node']
            await (await page.get_element(node['backendNodeId'])).fill('3333')
            actual = (await page._client.send.Runtime.callFunctionOn(params={'objectId': obj, 'returnByValue': True,
                'functionDeclaration': 'function(){return {value:this.value,events:this._probe};}'}, session_id=page._session_id))['result']['value']
            rows.append(dict(container=container, **actual))
            inputs.save(out, 'range-nested.json', rows)
            assert actual['value'] == '3333'
            assert all(e['trusted'] for e in actual['events']), f'{container}-range-scripted-fallback'
            assert sum(e['type'] == 'click' for e in actual['events']) == 1
        finally:
            await page._client.send.Runtime.releaseObject(params={'objectId': obj}, session_id=page._session_id)
    return dict(cases=len(rows), scriptedEvents=0, modelCalls=0, containers=['shadow', 'same-origin-iframe'])


async def all_exercise(browser, out):
    ordinary = await exercise(browser, out)
    nested = await nested_exercise(browser, out)
    return dict(cases=ordinary['cases'] + nested['cases'], scriptedEvents=0, modelCalls=0)


inputs.exercise = nested_exercise if '--nested' in sys.argv else all_exercise
if __name__ == '__main__': asyncio.run(inputs.main())
