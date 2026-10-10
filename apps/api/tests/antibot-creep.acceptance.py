"""Independent fixed CreepJS modules: native counterpart, tampering and collection failures."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
from uuid import uuid4

spec = importlib.util.spec_from_file_location('owned_input', Path(__file__).with_name('antibot-input.acceptance.py'))
owned = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owned)
owned.PURPOSE = 'creep-independent-owned-headless'


async def exercise(browser, out):
    page = await browser.get_current_page()
    results = {}
    for mode in ['baseline', 'tampered', 'no-media', 'blocked']:
        await page.goto('https://localhost:4185/measurement/creep?mode=' + mode)
        result = None
        for _ in range(30 if mode == 'blocked' else 300):
            raw = await page.evaluate("() => ({query:location.search,result:globalThis.__creepResult || null})")
            state = json.loads(raw) if raw else {}
            if state.get('query') == '?mode=' + mode and state.get('result'):
                result = state['result']; break
            await asyncio.sleep(.1)
        results[mode] = result if result else {'validity': 'timeout-or-script-blocked', 'bot': None}
        owned.save(out, 'creep-results.json', results)
    original = results['baseline']
    assert 'observations' in original, original
    assert not original['prototypeLies'].get('HTMLCanvasElement.toDataURL'), 'native-method-false-positive'
    assert results['tampered']['prototypeLies'].get('HTMLCanvasElement.toDataURL'), 'known-tampering-missed'
    assert results['no-media']['observations']['media']['validity'] == 'unavailable'
    assert results['blocked'] == {'validity': 'timeout-or-script-blocked', 'bot': None}
    return {'inputValueCorrect': True, 'inputEvents': [],
        'probe': {'verdict': 'specific-integrity-rule-calibrated', 'validity': 'per-field-not-human-proof'}}


async def install_webgl_control(page, mode):
    control = json.loads(await page.evaluate("""(mode) => {
      const windows=[window];let changed=0;
      for(let i=0;i<windows.length && i<32;i++){
        const w=windows[i];for(let n=0;n<w.frames.length;n++) windows.push(w.frames[n]);
        for(const name of ['WebGLRenderingContext','WebGL2RenderingContext']){
          const proto=w[name]?.prototype;if(!proto)continue;
          const native=proto.getParameter;
          proto.getParameter=function(key){
            if(mode==='single-vendor' && name==='WebGL2RenderingContext' && key===this.VENDOR) return 'owned-other-vendor';
            if(mode==='consistent-vendor' && key===this.VENDOR) return 'owned-same-vendor';
            if(mode==='version-difference' && name==='WebGL2RenderingContext' && key===this.VERSION) return 'owned-version-2';
            return native.call(this,key);
          };changed++;
        }
        if(mode==='missing-webgl2') for(const name of ['OffscreenCanvas','HTMLCanvasElement']){
          const proto=w[name]?.prototype;if(!proto)continue;const native=proto.getContext;
          proto.getContext=function(kind,...args){return /webgl2/.test(kind)?null:native.call(this,kind,...args);};
        }
      }
      return {windows:windows.length,changed};
    }""", mode))
    return control


async def exercise_availability(browser, out):
    page = await browser.get_current_page()
    rows = []
    modes = ['baseline', 'no-fontface', 'no-fontset', 'fontset-error', 'empty-font-list', 'no-audio', 'restored']
    if '--font-errors' in sys.argv: modes = ['baseline', 'fontcheck-error', 'fontconstructor-error', 'fontload-error', 'empty-font-list', 'restored']
    if '--font-remaining' in sys.argv: modes = ['baseline', 'emoji-layout-error', 'fontload-pending',
        'fontcheck-error', 'fontconstructor-error', 'fontload-error', 'empty-font-list', 'restored']
    for mode in modes:
        await page.goto('https://localhost:4185/measurement/creep?mode=baseline')
        async with asyncio.timeout(35):
            while True:
                raw = json.loads(await page.evaluate('() => ({result:globalThis.__creepResult || null})'))['result']
                if raw: break
                await asyncio.sleep(.1)
        if mode not in ('baseline', 'restored'):
            raw = json.loads(await page.evaluate("""(mode) => {
              if(mode==='no-fontface') Object.defineProperty(window,'FontFace',{value:undefined,configurable:true});
              if(mode==='no-fontset') Object.defineProperty(document,'fonts',{value:undefined,configurable:true});
              if(mode==='fontset-error') Object.defineProperty(document,'fonts',{get(){throw Error('owned capability error')},configurable:true});
              if(mode==='fontcheck-error') Object.defineProperty(document,'fonts',{value:{check(){throw Error('owned check error')}},configurable:true});
              if(mode==='fontconstructor-error') Object.defineProperty(window,'FontFace',{value:class {
                constructor(){throw Error('owned constructor error')} load(){return Promise.reject(new Error('absent'))}
              },configurable:true});
              if(mode==='fontload-error') Object.defineProperty(window,'FontFace',{value:class {
                load(){throw Error('owned synchronous load error')}
              },configurable:true});
              if(mode==='emoji-layout-error') {
                const original=getComputedStyle;
                window.getComputedStyle=function(element,...args){
                  if(element.classList.contains('pixel-emoji')) throw Error('owned emoji layout failure');
                  return original.call(this,element,...args);
                };
              }
              if(mode==='fontload-pending') Object.defineProperty(window,'FontFace',{value:class {
                load(){return new Promise(()=>{})}
              },configurable:true});
              if(mode==='empty-font-list') {
                Object.defineProperty(document,'fonts',{value:{check:()=>false},configurable:true});
                Object.defineProperty(window,'FontFace',{value:class {load(){return Promise.reject(new Error('owned absent font'))}},configurable:true});
              }
              if(mode==='no-audio') {
                Object.defineProperty(window,'OfflineAudioContext',{value:undefined,configurable:true});
                Object.defineProperty(window,'webkitOfflineAudioContext',{value:undefined,configurable:true});
              }
              return import('/measurement/creep.js').then(module=>Promise.race([
                module.probe(),new Promise(resolve=>setTimeout(()=>resolve({observations:{
                  fonts:{validity:'probe-pending',lied:null,fields:{}},audio:{validity:'unknown'}
                }}),8000))
              ]));
            }""", mode))
        fonts, audio = raw['observations']['fonts'], raw['observations']['audio']
        rows.append({'mode': mode, 'fonts': fonts, 'audio': audio})
        owned.save(out, 'capability-availability.json', rows)
    for row in rows:
        mode, fonts, audio = row['mode'], row['fonts'], row['audio']
        if mode in ('no-fontface', 'no-fontset', 'fontset-error'):
            expected = 'error' if mode == 'fontset-error' else 'unavailable'
            assert fonts['fields']['fontFaceLoadFonts'] == expected, 'missing-font-api-reported-measured:' + mode
            assert fonts['validity'] != 'measured', 'partial-font-measurement-reported-complete'
            assert fonts['lied'] is None and fonts['fields']['emojiSet'] == 'measured'
        elif mode in ('fontcheck-error', 'fontconstructor-error', 'fontload-error'):
            assert fonts['fields']['fontFaceLoadFonts'] == 'error', 'font-internal-error-reported-measured:' + mode
            assert fonts['validity'] == 'partial' and fonts['lied'] is None
            assert fonts['fields']['emojiSet'] == 'measured'
        elif mode == 'no-audio':
            assert audio['validity'] == 'unavailable'
        elif mode == 'emoji-layout-error':
            assert fonts['fields']['emojiSet'] == fonts['fields']['pixelSizeSystemSum'] == 'error', 'emoji-error-reported-measured'
            assert fonts['fields']['fontFaceLoadFonts'] == 'measured'
            assert fonts['validity'] == 'partial' and fonts['lied'] is None
        elif mode == 'fontload-pending':
            assert fonts['fields'].get('fontFaceLoadFonts') == 'timeout', 'font-pending-blocked-whole-probe'
            assert fonts['fields']['emojiSet'] == 'measured'
            assert fonts['validity'] == 'partial' and fonts['lied'] is None
        else:
            assert fonts['validity'] == audio['validity'] == 'measured'
    return {'inputValueCorrect': True, 'inputEvents': [], 'probe': {'verdict': 'field-validity-only',
        'validity': 'per-field-not-human-proof'}, 'modelCalls': 0}


async def exercise_deadline(browser, out):
    page = await browser.get_current_page()
    rows = []
    for mode in ['baseline', 'audio-pending', 'no-audio', 'restored']:
        await page.goto('https://localhost:4185/measurement/creep?mode=baseline')
        async with asyncio.timeout(35):
            while True:
                raw = json.loads(await page.evaluate('() => ({result:globalThis.__creepResult || null})'))['result']
                if raw: break
                await asyncio.sleep(.1)
        if mode not in ('baseline', 'restored'):
            raw = json.loads(await page.evaluate("""(mode) => {
              if(mode==='no-audio') {
                Object.defineProperty(window,'OfflineAudioContext',{value:undefined,configurable:true});
                Object.defineProperty(window,'webkitOfflineAudioContext',{value:undefined,configurable:true});
              } else {
                OfflineAudioContext.prototype.startRendering=function(){return new Promise(()=>{})};
              }
              return import('/measurement/creep.js').then(module=>Promise.race([
                module.probe(),new Promise(resolve=>setTimeout(()=>resolve({probePending:true}),8000))
              ]));
            }""", mode))
        row = {'mode': mode, 'observations': raw.get('observations'), 'probePending': raw.get('probePending', False)}
        rows.append(row); owned.save(out, 'probe-deadline.json', rows)
    for row in rows:
        assert not row['probePending'], 'audio-pending-blocked-independent-probes'
        observed = row['observations']
        assert set(observed) == {'canvas', 'webgl', 'audio', 'fonts', 'media'}
        expected = 'timeout' if row['mode'] == 'audio-pending' else 'unavailable' if row['mode'] == 'no-audio' else 'measured'
        assert observed['audio']['validity'] == expected
        if expected != 'measured': assert observed['audio']['lied'] is None
        assert observed['fonts']['validity'] == observed['media']['validity'] == 'measured'
    return {'inputValueCorrect': True, 'inputEvents': [], 'probe': {'verdict': 'probe-deadline-validity',
        'validity': 'per-field-not-human-proof'}, 'modelCalls': 0}


async def exercise_webgl(browser, out):
    page = await browser.get_current_page()
    rows = []
    for mode in ['baseline', 'single-vendor', 'consistent-vendor', 'version-difference', 'missing-webgl2']:
        await page.goto('https://localhost:4185/measurement/creep?mode=baseline&control='+mode)
        for _ in range(300):
            result = json.loads(await page.evaluate('() => ({result:globalThis.__creepResult || null})'))['result']
            if result: break
            await asyncio.sleep(.1)
        assert result and 'observations' in result, 'webgl_baseline_not_ready'
        control = None
        if mode != 'baseline':
            control = await install_webgl_control(page, mode)
            assert control['changed'] > 0, 'webgl_control_not_installed'
            result = json.loads(await page.evaluate("() => import('/measurement/creep.js').then(m=>m.probe())"))
        rows.append({'mode': mode, 'control': control, 'comparison': result.get('webglComparison'),
            'webgl': result['observations']['webgl'], 'advisoryRules': result.get('advisoryRules'),
            'lies': result['lies'], 'rawFingerprintPersisted': False})
        owned.save(out, 'webgl-results.json', rows)
    assert all(row['comparison'] for row in rows), 'upstream_comparison_not_exposed'
    for row in rows:
        expected = row['mode'] == 'single-vendor'
        if row['mode'] == 'missing-webgl2':
            assert row['comparison'] == {'validity': 'unavailable', 'mismatch': None}
        else:
            assert row['comparison'] == {'validity': 'measured', 'mismatch': expected}, row['mode']
        assert not row['lies']['data'], 'object_integrity_probe_confounded_comparison'
    owned.save(out, 'webgl-passed.json', {'controls': 5, 'originalRule': True, 'modelCalls': 0,
        'webglWebgpuPhysicalIdentityProven': False, 'independentPhysicalHardware': False})


async def exercise_online(browser, out, online):
    page = await browser.get_current_page()
    results = []
    modes = ['blocked-script'] if '--webgl-csp-only' in sys.argv else ['baseline', 'single-vendor', 'consistent-vendor', 'missing-webgl2']
    for mode in modes:
        before = {r['id'] for r in online.alerts()}
        case = online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
        state = await online.ready(page, case['url'])
        for _ in range(160):
            native = [r for r in online.observations(case) if r.get('detector') == 'creepWebglMirror']
            if native: break
            await asyncio.sleep(.1)
        assert len(native) == 1 and native[0]['valid'] == 'true' and native[0]['outcome'] == 'clear', native
        integrity = json.loads(await page.evaluate('() => globalThis.__batShieldIntegrity'))
        if mode == 'blocked-script':
            session = await browser.get_or_create_cdp_session()
            script = await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(params={'source': """
              globalThis.__ownedCspBlocked=false;
              document.addEventListener('securitypolicyviolation',e=>{
                if(e.blockedURI.endsWith('/measurement/creep.js')) globalThis.__ownedCspBlocked=true;
              });
              document.addEventListener('DOMContentLoaded',()=>{
                const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';
                meta.content=`script-src ${location.origin}/shield/collector.js ${location.origin}/measurement/probe/botd.js`;
                document.head.append(meta);
              },{once:true});
            """}, session_id=session.session_id)
            try:
                state = await online.ready(page, case['url'])
                for _ in range(160):
                    raw = await page.evaluate('() => globalThis.__batShieldIntegrity || null')
                    integrity = json.loads(raw) if raw and raw != 'null' else None
                    if integrity: break
                    await asyncio.sleep(.1)
                assert integrity and integrity['validity'] == 'error' and integrity['mismatch'] is None
                policy = json.loads(await page.evaluate('() => ({blocked:globalThis.__ownedCspBlocked})'))
                online.save(out, 'webgl-csp-policy.json', {'integrity': integrity, **policy})
                assert policy['blocked'] is True
                await asyncio.sleep(1.2)
                rows = [r for r in online.observations(case) if r.get('detector') == 'creepWebglMirror' and r['session'].endswith(state['page'])]
                assert len(rows) == 1 and rows[0]['valid'] == 'false' and rows[0]['outcome'] == 'error'
                report = next(r for r in online.local('/api/report')['telemetry'] if r['caseId'] == case['id'])
                assert report['webglIntegrity'] == 'error'
                online.save(out, 'webgl-csp.json', {'nativeBefore': native, 'blockedByActualPolicy': True,
                    'observation': rows[0], 'report': report, 'modelCalls': 0})
            finally:
                await session.cdp_client.send.Page.removeScriptToEvaluateOnNewDocument(params=script, session_id=session.session_id)
            continue
        if mode != 'baseline':
            control = await install_webgl_control(page, mode)
            assert control['changed'] > 0
            integrity = json.loads(await page.evaluate("() => import('/measurement/creep.js').then(m=>m.webglIntegrity())"))
            batch = str(uuid4())
            packet = {'version': 1, 'page': state['page'], 'batch': batch, 'events': [], 'dropped': 0, 'integrity': integrity}
            status = await page.evaluate("() => fetch('/shield/telemetry/"+case['id']+"', {method:'POST',headers:{'Content-Type':'application/json'},body:"
                +json.dumps(json.dumps(packet))+"}).then(r=>r.status)")
            assert str(status) == '202'
        expected = 'detected' if mode == 'single-vendor' else 'unavailable' if mode == 'missing-webgl2' else 'clear'
        observed = [r for r in online.observations(case) if r.get('detector') == 'creepWebglMirror'][-1]
        assert observed['outcome'] == expected
        await asyncio.sleep(2)
        alerts = [r for r in online.alerts() if r['id'] not in before and r['scenario'] == 'bat-lab/browser-marker']
        assert len(alerts) == (1 if mode == 'single-vendor' else 0), alerts
        results.append({'mode': mode, 'case': case['id'], 'integrity': integrity, 'observation': observed, 'alerts': alerts})
        online.save(out, 'webgl-online.json', results)
        if mode == 'baseline':
            # Changed collector must preserve actual business and original native event capture.
            await (await page.get_elements_by_css_selector('a[href$="/document/7"]'))[0].click()
            for _ in range(40):
                if '/document/7' in await page.get_url(): break
                await asyncio.sleep(.1)
            business = [r for r in online.local('/api/report')['business'] if r['case_id'] == case['id'] and r['action'] == 'selected']
            assert [json.loads(r['value']) for r in business] == [{'version': 7, 'correct': True}]
            online.save(out, 'webgl-business.json', business)
    online.save(out, 'passed.json', {'modes': modes, 'modelCalls': 0})


if __name__ == '__main__':
    if '--webgl' in sys.argv:
        spec = importlib.util.spec_from_file_location('device', Path(__file__).with_name('antibot-device.acceptance.py'))
        device = importlib.util.module_from_spec(spec); spec.loader.exec_module(device)
        device.exercise = exercise_webgl
        asyncio.run(device.main())
    else:
        owned.exercise = exercise_deadline if '--deadline' in sys.argv else exercise_availability if '--availability' in sys.argv else exercise
        asyncio.run(owned.main())
