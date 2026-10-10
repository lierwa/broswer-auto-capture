"""Original owned product path: same/cross-origin iframe DOM, action and session release."""
import asyncio
import importlib.util
import inspect
import json
from collections import Counter
from pathlib import Path
import sys

ROOT = Path.cwd()
spec = importlib.util.spec_from_file_location('admission', ROOT / 'apps/api/tests/antibot-admission.acceptance.py')
admission = importlib.util.module_from_spec(spec); spec.loader.exec_module(admission)


servers, original_server = [], admission.server
def server():
    fixture = original_server(); servers.append(fixture[0]); return fixture
admission.server = server
original_get = admission.Fixture.do_GET


def frame_boot(self):
    if self.path != '/frame-boot': return original_get(self)
    url = f'http://127.0.0.1:{servers[1].server_port}/frame-budget'
    body = ('<button id="action">Confirm</button><script>'
            'document.querySelector("#action").onclick=()=>document.body.dataset.clicked="yes";'
            'globalThis.__boot=Promise.all(Array.from({length:4},()=>fetch(' + json.dumps(url) +
            ').then(r=>r.status).catch(()=>0)));</script>').encode()
    self.server.arrivals.append(self.path)
    self.send_response(200); self.send_header('Content-Type', 'text/html')
    self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
admission.Fixture.do_GET = frame_boot


async def exercise(browser, out, normal):
    from browser_use.browser.events import ClickElementEvent
    browser.browser_profile.allowed_domains = ['127.0.0.1', 'localhost']
    page = await browser.get_current_page()
    session = await browser.get_or_create_cdp_session()
    rows = []
    policy_path = out / 'policy.json'
    policy = json.loads(policy_path.read_text())
    policy['policies'][0]['rates'][0]['intervalMs'] = 60000
    policy_path.write_text(json.dumps(policy), encoding='utf-8')
    for kind, origin in [('same-origin', normal[2]), ('cross-origin', normal[2].replace('127.0.0.1', 'localhost'))]:
        await page.goto(normal[2] + '/page')
        await page.evaluate("""(url) => new Promise(resolve=>{
          const frame=document.createElement('iframe');frame.style.cssText='width:500px;height:250px';
          frame.onload=()=>resolve({loaded:true});frame.src=url;document.body.append(frame);
        })""", origin + ('/frame-boot' if kind == 'cross-origin' and '--boot' in sys.argv else '/deferred-page'))
        raw = await inspect.unwrap(browser.cdp_client.send.Target.getTargets)()
        if '--daily' in sys.argv:
            # Independent measurement only: the extension intentionally enumerates task tabs, not all native targets.
            from browser_use_runner.attached_window import _client
            port, endpoint = (out / 'daily/DevToolsActivePort').read_text().splitlines()[:2]
            async with _client('ws://127.0.0.1:' + port + endpoint) as native:
                raw = await native.send.Target.getTargets()
        children = [t for t in raw['targetInfos'] if t['type'] == 'iframe']
        if kind == 'cross-origin' and '--quota' in sys.argv:
            child = browser.session_manager.get_all_sessions_for_target(children[0]['targetId'])
            assert child, 'early-oopif-session-unavailable'
            url = policy['policies'][0]['origin'] + '/frame-budget'
            expression = 'globalThis.__boot' if '--boot' in sys.argv else (
                'Promise.all(Array.from({length:4},()=>fetch(' + json.dumps(url) + ').then(r=>r.status).catch(()=>0)))')
            result = await browser.cdp_client.send.Runtime.evaluate(params={'expression': expression,
                'awaitPromise': True, 'returnByValue': True}, session_id=child[0].session_id)
            statuses = result['result'].get('value')
            admission.save(out, 'frame-quota.json', {'statuses': statuses, 'expectedBudget': 2,
                'actualArrivals': sum(instance.arrivals.count('/frame-budget') for instance in servers),
                'beforeDomObservation': True, 'initialInlineScript': '--boot' in sys.argv})
            assert Counter(statuses) == {200: 2, 0: 2}, 'oopif-budget-not-enforced'
            assert sum(instance.arrivals.count('/frame-budget') for instance in servers) == 2
        state = await browser.get_browser_state_summary()
        matches = [n for n in state.dom_state.selector_map.values() if n.attributes.get('id') == 'action']
        row = dict(kind=kind, iframeFlag=browser.browser_profile.cross_origin_iframes,
                   rawIframeTargets=len(children), trackedIframeSessions=sum(len(browser.session_manager.get_all_sessions_for_target(t['targetId'])) for t in children),
                   buttonFound=len(matches), clicked=False)
        rows.append(row); admission.save(out, 'frame-owned.json', rows)
        assert len(matches) == 1, kind + '-iframe-action-not-discovered'
        event = browser.event_bus.dispatch(ClickElementEvent(node=matches[0]))
        await event; await event.event_result(raise_if_any=True, raise_if_none=False)
        if kind == 'same-origin':
            actual = await page.evaluate("() => document.querySelector('iframe').contentDocument.body.dataset.clicked")
        else:
            assert len(children) == 1, 'cross-origin-test-did-not-establish-oopif'
            child = browser.session_manager.get_all_sessions_for_target(children[0]['targetId'])
            assert child, 'oopif-session-not-tracked'
            actual = (await browser.cdp_client.send.Runtime.evaluate(params={'expression': 'document.body.dataset.clicked',
                'returnByValue': True}, session_id=child[0].session_id))['result'].get('value')
        row['clicked'] = actual == 'yes'; admission.save(out, 'frame-owned.json', rows)
        assert row['clicked'], kind + '-native-action-not-delivered'
        if kind == 'cross-origin' and '--cooldown' in sys.argv:
            result = await browser.cdp_client.send.Runtime.evaluate(params={'expression':
                '(async()=>{const read=p=>fetch(p).then(r=>r.status).catch(()=>0);'
                'return [await read("/worker-limited"),await read("/frame-cooldown-probe")]})()',
                'awaitPromise': True, 'returnByValue': True}, session_id=child[0].session_id)
            statuses = result['result'].get('value')
            arrivals = normal[0].arrivals.count('/frame-cooldown-probe')
            admission.save(out, 'frame-cooldown.json', {'statuses': statuses, 'probeArrivals': arrivals})
            assert statuses == [429, 0] and arrivals == 0, 'oopif-cooldown-not-enforced'
    admission.save(out, 'passed.json', {'sameAndCrossOrigin': True, 'modelCalls': 0})
    if '--release' in sys.argv:
        from browser_use_runner.target_scope import TargetScope
        scope = TargetScope._active
        assert scope.browser is browser and len(scope.owned) == 1
        scope.prepare_close()
        await browser.cdp_client.send.Target.closeTarget(params={'targetId': next(iter(scope.owned))})
        await scope.release_operation()
        admission.save(out, 'frame-release.json', {'nativeTargetPoolEmpty': not browser.session_manager.get_all_target_ids(),
            'ownedEmpty': not scope.owned, 'relatedEmpty': not scope.related_sessions, 'connectionRetained': browser.is_cdp_connected})


admission.deferred_navigation_exercise = exercise
sys.argv = [__file__, '--navigation', *sys.argv[1:]]
asyncio.run(asyncio.wait_for(admission.main(), 45))
