"""Owned daily SW attribution: correlate native Fetch/Network, never infer ownership."""
import asyncio
from collections import Counter
import importlib.util
import json
from pathlib import Path
import sys
from unittest.mock import patch

ROOT = Path.cwd().resolve()
spec = importlib.util.spec_from_file_location('admission', ROOT / 'apps/api/tests/antibot-admission.acceptance.py')
admission = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admission)
original_daily = admission.daily_exercise
context = {}


async def daily(out, normal, limited, policy):
    context['limited'] = limited
    await original_daily(out, normal, limited, policy)


async def compare(client, worker, page, out, normal, limited):
    # WHY：第二窗口仅属于本测试Profile；不能使用产品任务租约获取个人页面。
    from playwright.async_api import async_playwright
    port = int((out / 'daily/DevToolsActivePort').read_text().splitlines()[0])
    events, tasks = [], set()
    phase = {'name': 'setup'}
    registry = client._event_registry._handlers
    old_fetch, old_network = registry.get('Fetch.requestPaused'), registry.get('Network.requestWillBeSent')

    def network(event, session_id=None):
        if session_id == worker:
            events.append({'kind': 'network', 'phase': phase['name'], **{k: event.get(k) for k in (
                'requestId', 'loaderId', 'documentURL', 'frameId', 'initiator', 'type')}})
        if old_network: return old_network(event, session_id)

    def paused(event, session_id=None):
        if session_id != worker:
            return old_fetch(event, session_id) if old_fetch else None
        events.append({'kind': 'fetch', 'phase': phase['name'], **{k: event.get(k) for k in (
            'requestId', 'frameId', 'networkId', 'redirectedRequestId', 'resourceType')}})
        # CDP读循环不可等待自己的响应；沿用原Admission的调度方式。
        task = asyncio.create_task(client.send.Fetch.continueRequest(
            params={'requestId': event['requestId']}, session_id=worker))
        tasks.add(task)

    client.register.Network.requestWillBeSent(network)
    client.send.Fetch._bat_access.register(paused)
    try:
        await client.send.Network.enable(session_id=worker)
        await client.send.Fetch.enable(params={'patterns': [{'urlPattern': '*'}]}, session_id=worker)
        async with async_playwright() as pw:
            observer = await pw.chromium.connect_over_cdp(f'http://127.0.0.1:{port}')
            root = await observer.new_browser_cdp_session()
            created = await root.send('Target.createTarget', {'url': normal[2] + '/unrelated', 'newWindow': True})
            try:
                async with asyncio.timeout(10):
                    other = None
                    while other is None:
                        other = next((p for p in observer.contexts[0].pages if p.url.endswith('/unrelated')), None)
                        if other is None: await asyncio.sleep(.05)
                await other.wait_for_load_state('domcontentloaded')
                url = limited[2] + '/same-worker-resource'
                phase['name'] = 'task'
                task_result = await admission.worker_message(page, {'url': url, 'count': 2})
                phase['name'] = 'unrelated'
                other_result = await other.evaluate("""async url => {
                  const r=await navigator.serviceWorker.ready;
                  return new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);
                    r.active.postMessage({url,count:2},[c.port2]);});}
                """, url)
                await asyncio.gather(*tasks)
                requests = [e for e in events if e['kind'] == 'fetch']
                networks = {e['requestId']: e for e in events if e['kind'] == 'network'}
                joined = [{'phase': e['phase'], 'fetch': e, 'network': networks.get(e['networkId'])} for e in requests]
                result = {'events': events, 'joined': joined, 'taskResults': task_result,
                    'unrelatedResults': other_result, 'originArrivals': Counter(limited[0].arrivals),
                    'actions': {'taskMessages': 1, 'unrelatedMessages': 1}, 'requestAttempts': 4,
                    'gatewayArrivals': None, 'gatewayReason': 'direct local fixture',
                    'modelCalls': 0, 'personalProfileTouched': False, 'attributionAccepted': False}
                admission.save(out, 'shared-worker-attribution.json', result)
                assert task_result == other_result == [200, 200]
                assert len(joined) == 4 and all(e['network'] is not None for e in joined)
                assert limited[0].arrivals.count('/same-worker-resource') == 4
                admission.save(out, 'passed.json', {'diagnosticValid': True,
                    'productSharedWorkerFixed': False, 'modelCalls': 0})
            finally:
                await root.send('Target.closeTarget', {'targetId': created['targetId']})
                await root.detach()
                await observer.close()
    finally:
        await client.send.Fetch.disable(session_id=worker)
        await client.send.Network.disable(session_id=worker)
        await asyncio.gather(*tasks, return_exceptions=True)
        client.send.Fetch._bat_access.register(old_fetch)
        if old_network: client.register.Network.requestWillBeSent(old_network)
        else: registry.pop('Network.requestWillBeSent', None)


async def exercise(browser, out, normal):
    page = await browser.get_current_page()
    session = await browser.get_or_create_cdp_session()
    client = session.cdp_client
    previous = client._event_registry._handlers.get('Target.attachedToTarget')
    worker = asyncio.get_running_loop().create_future()

    def attached(event, session_id=None):
        if event.get('targetInfo', {}).get('type') == 'service_worker' and not worker.done():
            worker.set_result(event['sessionId'])
        if previous: return previous(event, session_id)

    client.register.Target.attachedToTarget(attached)
    try:
        await page.goto(normal[2] + '/page')
        # 仅本诊断owned Profile观察SW；产品原scope仍排除共享SW，不能以测试附着作为准入授权。
        with patch('browser_use_runner.target_scope.TargetScope._frame_admission_required', return_value=False):
            await client.send.Target.setAutoAttach(params={'autoAttach': True, 'flatten': True,
                'waitForDebuggerOnStart': False, 'filter': [{'type': 'service_worker'}, {'exclude': True}]},
                session_id=session.session_id)
        # Zero requests: registration is setup, not another run of the known leakage case.
        await admission.worker_message(page, {'url': normal[2] + '/setup', 'count': 0})
        await compare(client, await asyncio.wait_for(worker, 5), page, out, normal, context['limited'])
    finally:
        if previous: client.register.Target.attachedToTarget(previous)
        else: client._event_registry._handlers.pop('Target.attachedToTarget', None)


if __name__ == '__main__':
    admission.daily_exercise = daily
    admission.deferred_navigation_exercise = exercise
    sys.argv = [__file__, '--daily', '--navigation']
    asyncio.run(admission.main())
