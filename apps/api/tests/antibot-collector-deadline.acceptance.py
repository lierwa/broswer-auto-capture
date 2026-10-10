"""A stalled optional UA API must not suppress independent online shield evidence."""
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
    page = await browser.get_current_page()
    session = await browser.get_or_create_cdp_session()
    results = []
    modes = ['ua-late', 'botd-pending', 'botd-error'] if '--remaining' in sys.argv else ['baseline', 'ua-pending', 'restored']
    for mode in modes:
        script = None
        if mode in ['ua-pending', 'ua-late']:
            script = await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(params={
                'source': "{const native=NavigatorUAData.prototype.getHighEntropyValues;"
                    "Object.defineProperty(NavigatorUAData.prototype,'getHighEntropyValues',"
                    "{value(...args){if(!document.querySelector('script[src=\"/shield/collector.js\"]'))"
                    "return native.apply(this,args);globalThis.__ownedUaCalls=(globalThis.__ownedUaCalls||0)+1;"
                    "return new Promise(resolve=>{globalThis.__ownedUaResolve=()=>native.apply(this,args).then(resolve)});}});}"},
                session_id=session.session_id)
        if mode == 'botd-pending':
            script = await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(params={
                'source': "{const native=Permissions.prototype.query;Permissions.prototype.query=function(...args){"
                    "if(!document.querySelector('script[src=\"/shield/collector.js\"]'))return native.apply(this,args);"
                    "globalThis.__ownedPermissionCalls=(globalThis.__ownedPermissionCalls||0)+1;return new Promise(()=>{});}}"},
                session_id=session.session_id)
        if mode == 'botd-error':
            await session.cdp_client.send.Network.enable(session_id=session.session_id)
            await session.cdp_client.send.Network.setBlockedURLs(params={'urls': ['*/measurement/probe/botd.js']},
                session_id=session.session_id)
        case = devices.online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
        try:
            await page.goto(case['url'])
            independent_early = False
            for _ in range(220):
                state = json.loads(await page.evaluate("() => ({telemetry:globalThis.__batShieldTelemetry??null,"
                    "worker:globalThis.__batShieldWorker??null,webgl:globalThis.__batShieldIntegrity??null})"))
                if all(state.values()):
                    await asyncio.sleep(1.1)
                    break
                independent_early |= bool(state['worker'] and state['webgl'] and not state['telemetry'])
                await asyncio.sleep(.1)
            rows = devices.online.observations(case)
            control = json.loads(await page.evaluate('() => ({calls:globalThis.__ownedUaCalls||0,permissions:globalThis.__ownedPermissionCalls||0,'
                'collector:!!document.querySelector(\'script[src="/shield/collector.js"]\')})'))
            results.append({'mode': mode, 'case': case['id'], 'state': state, 'control': control,
                'independentEarly': independent_early, 'observations': rows})
            devices.online.save(out, 'collector-deadline.json', results)
            if mode in ['ua-pending', 'ua-late']:
                assert control['collector'], 'business_collector_not_loaded'
                assert control['calls'] > 0, 'ua_pending_control_not_exercised'
            assert state['telemetry'], 'optional_ua_api_blocked_all_probes'
            assert state['worker'] and state['webgl'], 'independent_probes_missing'
            assert len([r for r in rows if r.get('detector_version') == '2.0.0']) == (0 if mode.startswith('botd-') else 18)
            assert len([r for r in rows if r.get('detector', '').startswith('creepWorker.')]) == 4
            assert not any(r.get('outcome') == 'detected' for r in rows)
            if mode in ['ua-pending', 'ua-late']:
                assert any(r.get('detector') == 'ua-high-entropy' and r['outcome'] == 'timeout'
                           and r['valid'] == 'false' for r in rows), 'ua_timeout_not_distinguished'
                assert independent_early, 'probes_waited_for_optional_ua_deadline'
            if mode == 'ua-late':
                await page.evaluate('() => globalThis.__ownedUaResolve().then(()=>true)')
                await asyncio.sleep(1.2)
                late = devices.online.observations(case)
                health = [r['outcome'] for r in late if r.get('detector') == 'ua-high-entropy']
                devices.online.save(out, 'late-result.json', {'outcomes': health})
                assert health == ['timeout'], 'late_result_replaced_timeout'
            if mode.startswith('botd-'):
                expected = 'timeout' if mode == 'botd-pending' else 'error'
                assert state['telemetry']['status'] == expected
                assert any(r['category'] == 'environment-health' and r['outcome'] == expected and r['valid'] == 'false' for r in rows)
                if mode == 'botd-pending':
                    assert control['permissions'] > 0 and independent_early
        finally:
            if script:
                await session.cdp_client.send.Page.removeScriptToEvaluateOnNewDocument(
                    params=script, session_id=session.session_id)
            if mode == 'botd-error':
                await session.cdp_client.send.Network.setBlockedURLs(params={'urls': []}, session_id=session.session_id)
    devices.online.save(out, 'passed.json', {'controls': len(results), 'modelCalls': 0,
        'optionalUaCannotBlockOtherProbes': True})


if __name__ == '__main__':
    devices.exercise = exercise
    asyncio.run(devices.main())
