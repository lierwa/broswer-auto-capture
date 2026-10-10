"""A repeated worker sample must not turn restored consistency into a stale detection."""
import asyncio
import importlib.util
import json
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path.cwd().resolve()
spec = importlib.util.spec_from_file_location('devices', ROOT/'apps/api/tests/antibot-device.acceptance.py')
devices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(devices)


async def exercise(browser, out):
    page = await browser.get_current_page()
    case = devices.online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
    state = await devices.online.ready(page, case['url'])
    rows = json.loads(await page.evaluate('''() => (async () => {
      const module=await import('/measurement/worker/probe.js');
      const original=Object.getOwnPropertyDescriptor(navigator,'platform');
      const rows=[];
      try {
        rows.push({mode:'normal',result:await module.workerIntegrity()});
        Object.defineProperty(navigator,'platform',{configurable:true,get:()=> 'owned-mismatch'});
        rows.push({mode:'mismatch',result:await module.workerIntegrity()});
      } finally {
        if(original)Object.defineProperty(navigator,'platform',original);else delete navigator.platform;
      }
      rows.push({mode:'restored',result:await module.workerIntegrity()});
      return rows;
    })()'''))
    devices.online.save(out, 'worker-repeat.json', rows)
    for row in rows:
        signals = row['result']['signals']
        assert len(signals) == 4 and all(signal['validity'] == 'measured' for signal in signals)
        assert [s['name'] for s in signals if s['mismatch']] == (['platform'] if row['mode'] == 'mismatch' else []), row['mode']
        packet = {'version': 1, 'page': state['page'], 'batch': str(uuid4()), 'events': [], 'dropped': 0,
                  'workerIntegrity': row['result']}
        status = await page.evaluate("(packet) => fetch('/shield/telemetry/"+case['id']+"', {method:'POST',"
            "headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)}).then(r=>r.status)", packet)
        assert str(status) == '202'
        measured = [r for r in devices.online.observations(case) if r.get('batch') == packet['batch']
                    and r.get('detector', '').startswith('creepWorker.')]
        devices.online.save(out, row['mode']+'-online.json', measured)
        assert len(measured) == 4 and [r['detector'] for r in measured if r['outcome'] == 'detected'] == (
            ['creepWorker.platform'] if row['mode'] == 'mismatch' else [])
    devices.online.save(out, 'passed.json', {'sameDocumentSamples': len(rows), 'modelCalls': 0})


async def remaining(browser, out):
    page = await browser.get_current_page()
    case = devices.online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
    await devices.online.ready(page, case['url'])
    result = json.loads(await page.evaluate('''() => (async () => {
      const module=await import('/measurement/worker/probe.js');await module.workerIntegrity();
      const WorkerOriginal=globalThis.Worker,descriptor=Object.getOwnPropertyDescriptor(navigator,'platform');
      const restore=()=>{if(descriptor)Object.defineProperty(navigator,'platform',descriptor);else delete navigator.platform;};
      let completions=0;
      try {
        globalThis.Worker=new Proxy(WorkerOriginal,{construct(target,args){
          const worker=new target(...args);
          worker.addEventListener('message',()=>{
            if(completions++===0)Object.defineProperty(navigator,'platform',{configurable:true,get:()=> 'owned-mismatch'});
            else restore();
          },{once:true});
          return worker;
        }});
        const concurrent=await Promise.all([module.workerIntegrity(),module.workerIntegrity()]);
        globalThis.Worker=undefined;
        const unavailable=await module.workerIntegrity();
        globalThis.Worker=WorkerOriginal;
        const restored=await module.workerIntegrity();
        return {completions,concurrent,unavailable,restored};
      } finally {globalThis.Worker=WorkerOriginal;restore();}
    })()'''))
    devices.online.save(out, 'worker-concurrent.json', result)
    assert result['completions'] == 2
    assert all(s['validity'] == 'measured' for sample in result['concurrent'] for s in sample['signals'])
    assert sorted(sum(s['mismatch'] for s in sample['signals']) for sample in result['concurrent']) == [0, 1]
    assert all(s['validity'] == 'unavailable' and s['mismatch'] is None for s in result['unavailable']['signals'])
    assert all(s['validity'] == 'measured' and s['mismatch'] is False for s in result['restored']['signals'])
    devices.online.save(out, 'passed.json', {'concurrentIsolation': True, 'unavailableAndRestored': True, 'modelCalls': 0})


async def skipped(browser, out):
    page = await browser.get_current_page()
    case = devices.online.local('/api/cases', {'kind': 'catalog', 'variant': 1})
    state = await devices.online.ready(page, case['url'])
    rows = json.loads(await page.evaluate('''() => (async () => {
      const module=await import('/measurement/worker/probe.js'),Original=globalThis.Worker,rows=[];
      try {
        for(const name of ['hardwareConcurrency','deviceMemory']) {
          globalThis.Worker=new Proxy(Original,{construct(target,args){
            const worker=new target(...args);
            worker.addEventListener('message',event=>{event.data[name]=0;},{once:true});
            return worker;
          }});
          rows.push({name,result:await module.workerIntegrity()});
        }
      } finally {globalThis.Worker=Original;}
      rows.push({name:'restored',result:await module.workerIntegrity()});
      return rows;
    })()'''))
    devices.online.save(out, 'worker-skipped.json', rows)
    for row in rows:
        for signal in row['result']['signals']:
            skipped_rule = signal['name'] == row['name']
            assert signal['validity'] == ('unavailable' if skipped_rule else 'measured'), row['name']
            assert signal['mismatch'] is (None if skipped_rule else False), row['name']
        packet = {'version': 1, 'page': state['page'], 'batch': str(uuid4()), 'events': [], 'dropped': 0,
                  'workerIntegrity': row['result']}
        status = await page.evaluate("(packet) => fetch('/shield/telemetry/"+case['id']+"', {method:'POST',"
            "headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)}).then(r=>r.status)", packet)
        assert str(status) == '202'
        measured = [r for r in devices.online.observations(case) if r.get('batch') == packet['batch']
                    and r.get('detector', '').startswith('creepWorker.')]
        devices.online.save(out, row['name']+'-online.json', measured)
        assert len(measured) == 4
        assert [r['detector'] for r in measured if r['valid'] == 'false'] == (
            [] if row['name'] == 'restored' else ['creepWorker.'+row['name']])
    devices.online.save(out, 'passed.json', {'skippedRulesNotClear': 2, 'normalRestored': True, 'modelCalls': 0})


if __name__ == '__main__':
    devices.exercise = skipped if '--skipped' in sys.argv else remaining if '--remaining' in sys.argv else exercise
    asyncio.run(devices.main())
