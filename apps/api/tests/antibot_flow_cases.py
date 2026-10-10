"""Normal browser flow variants versus missing server prerequisites; no credentials saved."""
import asyncio
import json
import time

import httpx


async def wait_text(page, expression, expected):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if await page.evaluate(expression) == expected:
            return
        await asyncio.sleep(.1)
    raise AssertionError('flow_expected_state_missing')


async def exercise(online, browser, out):
    normal = online.local('/api/cases', {'kind': 'booking'})
    online.save(out, 'flow-case.json', {'id': normal['id']})
    url = normal['url'] + '/flow'
    page = await browser.get_current_page()
    session = await browser.get_or_create_cdp_session()
    cached = []
    def response(event, _session):
        value = event.get('response', {})
        if value.get('url', '').endswith('/flow/asset.js'):
            cached.append({'status': value.get('status'), 'disk': value.get('fromDiskCache', False),
                           'worker': value.get('fromServiceWorker', False)})
    session.cdp_client.register.Network.responseReceived(response)
    await session.cdp_client.send.Network.enable(session_id=session.session_id)
    await online.ready(page, url + '/redirect')
    # 浏览器点击使用真实已有Actor；history/hash变化不应要求再次导航签发token。
    before_click = await page.evaluate("""() => {
      globalThis.__flowClickEvents=[];
      for (const type of ['pointerdown','pointerup','mousedown','mouseup','click'])
        document.addEventListener(type,e=>globalThis.__flowClickEvents.push({type,id:e.target.id,
          tag:e.target.tagName,trusted:e.isTrusted,at:performance.timeOrigin+performance.now()}),true);
      const button=document.querySelector('#spa'), r=button.getBoundingClientRect();
      return {ready:document.readyState,handler:typeof button.onclick,at:Date.now(),focus:document.hasFocus(),visibility:document.visibilityState,
        rect:{x:r.x,y:r.y,width:r.width,height:r.height},scrollY,innerHeight};
    }""")
    online.save(out, 'spa-click-before.json', json.loads(before_click))
    await (await page.get_elements_by_css_selector('#spa'))[0].click()
    try: await wait_text(page, "() => document.querySelector('#result')?.textContent", '已完成')
    finally:
        diagnostic = await page.evaluate("""() => ({ready:document.readyState,focus:document.hasFocus(),visibility:document.visibilityState,
          handler:typeof document.querySelector('#spa')?.onclick,result:document.querySelector('#result')?.textContent,
          hash:location.hash,events:globalThis.__flowClickEvents})""")
        online.save(out, 'spa-click-after.json', json.loads(diagnostic))
    assert (await page.get_url()).endswith('#confirmation')
    # 同一token合法直接API不是异常。只记录状态，token既不返回Python也不落日志。
    status = await page.evaluate("""() => fetch(document.querySelector('form').action,
      {method:'POST',headers:{'x-csrf-token':document.querySelector('[name=csrf]').value}}).then(r=>r.status)""")
    assert str(status) == '200'
    # 原缓存语义：同一静态资源不触达源站，不把“没看到加载”当作跳过前置流程。
    await page.evaluate("() => fetch(document.querySelector('script[src*=\"asset.js\"]').src).then(r=>r.text()).then(()=>true)")
    await (await page.get_elements_by_css_selector('#submit'))[0].click()
    await wait_text(page, '() => String(document.body.textContent.includes("true"))', 'true')
    await online.ready(page, url)
    await (await page.get_elements_by_css_selector('#spa'))[0].click()
    await wait_text(page, "() => document.querySelector('#result')?.textContent", '已完成')
    await asyncio.sleep(2)
    facts = online.observations(normal)
    flow = [row['outcome'] for row in facts if row.get('category') == 'workflow']
    online.save(out, 'normal.json', {'tasks': [{'id': normal['id']}], 'flow': flow, 'cache': cached})
    assert flow.count('accepted') == 4 and flow.count('asset') == 1
    assert not any(v in flow for v in ('prerequisite_missing', 'origin_rejected'))
    assert any(row['disk'] for row in cached), 'browser_cache_not_measured'
    # 单层异常校准不谎称穿过JS挑战；经原LAPI入口产生实际源站拒绝和CrowdSec事件。
    abnormal = online.local('/api/cases', {'kind': 'catalog'})
    prefix = '/case/' + abnormal['id'] + '/flow'
    host = abnormal['id'] + '.localhost:4184'
    before = {row['id'] for row in online.alerts()}
    with httpx.Client(base_url='http://127.0.0.1:4184', trust_env=False) as client:
        missing = client.post(prefix + '/submit', headers={'Host': host, 'Origin': 'http://' + host})
        assert missing.status_code == 403
        wrong = client.post(prefix + '/submit', headers={'Host': host, 'Origin': 'https://outside.invalid'})
        assert wrong.status_code == 403
    await asyncio.sleep(3)
    found = [row for row in online.alerts() if row['id'] not in before]
    matched = [row for row in found if row['scenario'] == 'bat-lab/workflow-prerequisite']
    online.save(out, 'flow-control.json', {'statuses': [missing.status_code, wrong.status_code],
        'observations': online.observations(abnormal), 'alerts': matched, 'entry': 'single-layer-4184'})
    assert matched and all(normal['id'] not in json.dumps(row['events']) for row in matched)
    online.save(out, 'passed.json', {'nativeForm': True, 'spa': True, 'redirect': True, 'cacheMeasured': True,
        'validDirectApi': True, 'missingPrerequisiteDetected': True, 'wrongOriginDetected': True,
        'normalFullShieldEntry': 4183, 'abnormalSingleLayerEntry': 4184, 'modelCalls': 0})
