"""Fine ranges inside owned same-origin frames and real OOPIFs use the existing scope proof."""
import asyncio
import importlib.util
from pathlib import Path

ROOT = Path.cwd().resolve()
spec = importlib.util.spec_from_file_location('devices', ROOT/'apps/api/tests/antibot-device.acceptance.py')
devices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(devices)


async def exercise(browser, out):
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
            nodes = [n for n in state.dom_state.selector_map.values() if n.attributes.get('type') == 'range']
            assert len(nodes) == 1, 'owned_range_not_found'
            node = nodes[0]
            session = await browser.cdp_client_for_node(node)
            target = (await session.cdp_client.send.Target.getTargetInfo(params={'targetId': session.target_id}))['targetInfo']
            if kind == 'oopif': assert target['type'] == 'iframe', 'oopif_not_established'
            frame_page = TaskPage(browser, session.target_id, session_id=session.session_id)
            element = await frame_page.get_element(node.backend_node_id)
            object_id = await element._get_remote_object_id()
            await frame_page._client.send.Runtime.callFunctionOn(params={'objectId': object_id,
                'functionDeclaration': '''function(){
                  this.min='0';this.max='1';this.step='any';this._events=[];
                  for(const type of ['input','change'])this.addEventListener(type,e=>this._events.push({type,trusted:e.isTrusted}));
                }'''}, session_id=session.session_id)
            if mode == 'actor': await element.fill('0.12345')
            else:
                event = browser.event_bus.dispatch(TypeTextEvent(node=node, text='0.12345', clear=True))
                await event
                await event.event_result(raise_if_any=True, raise_if_none=False)
            actual = (await frame_page._client.send.Runtime.callFunctionOn(params={'objectId': object_id, 'returnByValue': True,
                'functionDeclaration': '''function(){return {value:this.value,
                  state:this.ownerDocument.querySelector('#range-state').textContent,
                  committed:this.ownerDocument.querySelector('#range-committed').textContent,events:this._events};}'''},
                session_id=session.session_id))['result']['value']
            rows.append({'kind': kind, 'mode': mode, 'targetType': target['type'], 'actual': actual})
            devices.online.save(out, 'native-range-frames.json', rows)
            assert actual['value'] == actual['state'] == actual['committed'] == '0.12345'
            assert actual['events'] and all(e['trusted'] for e in actual['events'])
    devices.online.save(out, 'passed.json', {'cases': len(rows), 'scriptedEvents': 0, 'modelCalls': 0})


if __name__ == '__main__':
    devices.exercise = exercise
    asyncio.run(devices.main())
