import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { cadenceObservations, cadenceSchema } from '../cadence.ts'
import { behaviorObservations } from '../behavior.ts'
import { checkReceipt } from '../check.ts'
import { acceptReceipt, catalog, createMeasurement, measurementReport } from '../check-model.js'
import { directory } from '../locations.mjs'

// 保护实际采集器的 IME 生命周期与证据强度；不使用复制的采集/检测算法。
function collector(scoped: boolean | 'both' = false) {
  const listeners = new Map<string, ((event: object) => void)[]>()
  const document = { addEventListener(type: string, callback: (event: object) => void) {
    listeners.set(type, [...(listeners.get(type) ?? []), callback])
  } }
  const source = readFileSync(new URL('../collector.js', import.meta.url), 'utf8')
  const target = { tagName: 'TEXTAREA' },chinese={tagName:'TEXTAREA'}
  const context = createContext({ document,scope:scoped==='both'?[target,chinese]:scoped?target:undefined })
  const start = source.indexOf('const timingSample'), end = source.indexOf('(() =>', start)
  assert.ok(start >= 0 && end > start)
  runInContext(source.slice(start, end) + '\nglobalThis.snapshot = captureCadence(() => {},scope);', context)
  const send = (type: string, changes: object = {}) => {
    const event = { type, target, timeStamp: 100, key: 'a', code: 'KeyA', isComposing: false,
      repeat: false, ctrlKey: false, altKey: false, metaKey: false, isTrusted:true, ...changes }
    for (const callback of listeners.get(type) ?? []) callback(event)
  }
  return { target,chinese,send, snapshot: () => JSON.parse(JSON.stringify(context.snapshot())) }
}

test('Chinese composition preserves English evidence; any page paste retains the original FCaptcha exclusion gate', async () => {
  const c=collector(true),chinese={tagName:'TEXTAREA'}
  const gaps=[120,180,210,140,260,160,190,220,170];let at=100
  for(let i=0;i<10;i++) {
    if(i) at+=gaps[i-1]!
    c.send('keydown',{timeStamp:at});c.send('keyup',{timeStamp:at+70})
  }
  const measured=c.snapshot()
  assert.equal((await cadenceObservations(directory,measured))[0]!.outcome,'clear')
  for(const type of ['compositionstart','compositionend','keydown','keyup'])
    c.send(type,{target:chinese,key:'Process',keyCode:229})
  assert.deepEqual(c.snapshot(),measured)
  c.send('paste',{target:chinese})
  assert.equal((await cadenceObservations(directory,c.snapshot()))[0]!.outcome,'excluded')
  const rows=await behaviorObservations(directory,{keys:[],cadence:c.snapshot(),
    scroll:{count:1,maxDelta:120,wheelCount:1,scrollKey:false,maxTouchPoints:0}})
  for(const id of ['keystroke-interval','keystroke-entropy'])assert.equal(rows.find(r=>r.detector===id)?.valid,'true')
  c.send('keyup',{timeStamp:at+100})
  assert.equal(c.snapshot().invalid,true)
  c.send('paste');assert.equal((await cadenceObservations(directory,c.snapshot()))[0]!.outcome,'invalid')
  const pasted=collector(true);pasted.send('paste')
  assert.equal(pasted.snapshot().excluded,true)
})

test('native code-less Process down/up pairs retain real timing through composition and extra release', async () => {
  const c=collector(true);let at=100
  for(let i=0;i<12;i++) {
    at += [120,180,210,140][i%4]!
    c.send('keydown',{timeStamp:at,key:'Process',keyCode:229,code:'',isTrusted:true,isComposing:i>0})
    if(!i)c.send('compositionstart',{timeStamp:at+1})
    c.send('keyup',{timeStamp:at+70,key:'Process',keyCode:229,code:'',isTrusted:true,isComposing:true})
    c.send('keyup',{timeStamp:at+71,key:'a',code:'',isTrusted:true,isComposing:true})
  }
  c.send('compositionend',{timeStamp:at+75})
  const sample=c.snapshot()
  assert.equal(sample.excluded,false)
  assert.equal(sample.keyCount,12)
  assert.equal(sample.dwellTimes.length,12)
  const rows=await behaviorObservations(directory,{keys:sample.starts,
    cadence:sample,scroll:{count:1,maxDelta:120,wheelCount:1,scrollKey:false,maxTouchPoints:0}})
  for(const id of ['keystroke-interval','keystroke-entropy','typing-cadence']) {
    assert.equal(rows.find(r=>r.detector===id)?.outcome,'clear',id)
    assert.equal(rows.find(r=>r.detector===id)?.valid,'true',id)
  }
})

test('Windows IME uppercase modifier release and code-less spaces retain actual complete key pairs', async()=>{
  const c=collector(true);let at=100
  c.send('keydown',{timeStamp:at-10,key:'Shift',keyCode:16,code:''})
  for(let i=0;i<12;i++) {
    at+=150
    c.send('keydown',{timeStamp:at,key:'Process',keyCode:229,code:''})
    c.send('keyup',{timeStamp:at+60,key:'Process',keyCode:229,code:''})
    c.send('keyup',{timeStamp:at+61,key:'a',keyCode:65,code:''})
    if(!i) {
      c.send('keyup',{timeStamp:at+65,key:'Process',keyCode:229,code:''})
      c.send('keyup',{timeStamp:at+66,key:'Shift',keyCode:16,code:''})
    }
  }
  c.send('keydown',{timeStamp:at+150,key:' ',keyCode:32,code:''})
  c.send('keyup',{timeStamp:at+220,key:' ',keyCode:32,code:''})
  const sample=c.snapshot()
  assert.equal(sample.invalid,false);assert.equal(sample.pending,0)
  assert.equal(sample.keyCount,13);assert.equal(sample.dwellTimes.length,13)
  assert.equal(sample.context.imePairs,12);assert.equal(sample.context.physicalPairs,1)
  assert.equal((await cadenceObservations(directory,sample))[0]!.valid,'true')
})

test('unmatched IME releases and different virtual keys remain errors; unconfirmed modifier release remains pending',()=>{
  const unmatched=collector(true)
  unmatched.send('keyup',{timeStamp:100,key:'Process',keyCode:229,code:''})
  assert.equal(unmatched.snapshot().invalid,true)
  const mismatch=collector(true)
  mismatch.send('keydown',{timeStamp:100,key:' ',keyCode:32,code:''})
  mismatch.send('keyup',{timeStamp:160,key:'.',keyCode:190,code:''})
  assert.equal(mismatch.snapshot().invalid,true);assert.deepEqual(mismatch.snapshot().dwellTimes,[])
  const unresolved=collector(true)
  unresolved.send('keydown',{timeStamp:100,key:'Shift',keyCode:16,code:''})
  unresolved.send('keyup',{timeStamp:150,key:'Process',keyCode:229,code:''})
  assert.equal(unresolved.snapshot().pending,1)
  unresolved.send('keydown',{timeStamp:160})
  assert.equal(unresolved.snapshot().invalid,true)
})

test('native Process events retain physical modifier identity through ShiftLeft and never count as typing keys',()=>{
  const c=collector(true)
  c.send('keydown',{timeStamp:100,key:'Shift',keyCode:16,code:'ShiftLeft'})
  c.send('keydown',{timeStamp:120,key:'Process',keyCode:229,code:'KeyT'})
  c.send('keyup',{timeStamp:180,key:'Process',keyCode:229,code:'KeyT'})
  c.send('keyup',{timeStamp:181,key:'T',keyCode:84,code:'KeyT'})
  c.send('keyup',{timeStamp:182,key:'Process',keyCode:229,code:'ShiftLeft'})
  c.send('keyup',{timeStamp:183,key:'Shift',keyCode:16,code:'ShiftLeft'})
  c.send('keydown',{timeStamp:250,key:'Process',keyCode:229,code:'ShiftLeft'})
  c.send('keyup',{timeStamp:300,key:'Process',keyCode:229,code:'ShiftLeft'})
  c.send('keyup',{timeStamp:301,key:'Shift',keyCode:16,code:'ShiftLeft'})
  assert.equal(c.snapshot().invalid,false);assert.equal(c.snapshot().pending,0)
  assert.equal(c.snapshot().keyCount,1);assert.deepEqual(c.snapshot().dwellTimes,[60])
})

test('composition starting during a physical hold preserves its native up pair and extra release through key rollover',()=>{
  const c=collector(true)
  c.send('keydown',{timeStamp:100,key:'j',keyCode:74,code:'KeyJ'})
  c.send('compositionstart',{timeStamp:101})
  c.send('keydown',{timeStamp:150,key:'Process',keyCode:229,code:'KeyI',isComposing:true})
  c.send('keyup',{timeStamp:180,key:'Process',keyCode:229,code:'KeyJ',isComposing:true})
  c.send('keydown',{timeStamp:180.5,key:'Process',keyCode:229,code:'KeyN',isComposing:true})
  c.send('keyup',{timeStamp:181,key:'j',keyCode:74,code:'KeyJ',isComposing:true})
  c.send('keyup',{timeStamp:230,key:'Process',keyCode:229,code:'KeyI',isComposing:true})
  c.send('keyup',{timeStamp:231,key:'i',keyCode:73,code:'KeyI',isComposing:true})
  c.send('keyup',{timeStamp:260.5,key:'Process',keyCode:229,code:'KeyN',isComposing:true})
  c.send('keyup',{timeStamp:261,key:'n',keyCode:78,code:'KeyN',isComposing:true})
  const sample=c.snapshot()
  assert.equal(sample.invalid,false);assert.equal(sample.pending,0)
  assert.equal(sample.context.imePairs,3);assert.deepEqual(sample.dwellTimes,[80,80,80])
  const ordinary=collector(true)
  ordinary.send('keydown',{timeStamp:100});ordinary.send('keyup',{timeStamp:180})
  ordinary.send('keyup',{timeStamp:181})
  assert.equal(ordinary.snapshot().invalid,true)
})

test('composition commit/cancel retain actual final release; focus loss cannot fabricate a missing hold', async () => {
  for (const finish of ['commit', 'cancel', 'blur']) {
    const c = collector()
    c.send('keydown', { timeStamp: 90, key: 'Process', keyCode: 229 })
    c.send('compositionstart')
    c.send('compositionend', { timeStamp: 150 })
    if (finish === 'blur') c.send('blur', { timeStamp: 151 })
    else c.send('keyup', { isComposing: false, timeStamp: 160, key: finish === 'cancel' ? 'Escape' : 'a' })
    const sample = c.snapshot()
    assert.equal(sample.excluded, false, finish)
    assert.equal(sample.invalid, false, finish)
    assert.equal(sample.dwellTimes.length,finish==='blur'?0:1)
    assert.equal(sample.pending,finish==='blur'?1:0)
    assert.equal((await cadenceObservations(directory, sample))[0]!.outcome, 'unavailable')
  }
})

test('code-less IME final ordinary keyup completes the sole real hold; different known physical codes stay invalid',()=>{
  const c=collector(true)
  c.send('keydown',{timeStamp:100,key:'Process',keyCode:229,code:''})
  c.send('compositionend',{timeStamp:140})
  c.send('keyup',{timeStamp:170,code:'',keyCode:0,isComposing:false})
  assert.deepEqual(c.snapshot().dwellTimes,[70]);assert.equal(c.snapshot().pending,0)
  assert.equal(c.snapshot().invalid,false)
  const mismatch=collector(true)
  mismatch.send('keydown',{timeStamp:100,code:'KeyA',keyCode:229,key:'Process'})
  mismatch.send('keyup',{timeStamp:170,code:'KeyB',keyCode:229,key:'Process'})
  assert.equal(mismatch.snapshot().invalid,true);assert.deepEqual(mismatch.snapshot().dwellTimes,[])
})

test('shortcuts/modifiers/repeats preserve an existing physical hold without manufacturing keys', () => {
  for (const change of [{ ctrlKey: true,code:'KeyV' }, { repeat: true }, { key: 'Shift',code:'ShiftLeft' }]) {
    const c = collector()
    c.send('keydown', { timeStamp: 90 })
    c.send('keydown', { timeStamp: 100, ...change })
    if(change.code)c.send('keyup',{timeStamp:130,...change})
    c.send('keyup', { timeStamp: 160 })
    c.send('blur')
    assert.equal(c.snapshot().excluded, false)
    assert.equal(c.snapshot().invalid, false)
    assert.equal(c.snapshot().keyCount,1)
    assert.deepEqual(c.snapshot().dwellTimes,[70])
  }
})

test('genuine corruption remains invalid even if composition follows; incomplete pairs do not become clear', async () => {
  const c = collector()
  c.send('keydown', { timeStamp: 100 });c.send('keyup', { timeStamp: 90 })
  c.send('compositionstart');c.send('compositionend');c.send('keyup', { timeStamp: 130 })
  assert.equal((await cadenceObservations(directory, c.snapshot()))[0]!.outcome, 'invalid')
  const sample = { keyCount: 10, intervals: [120,180,210,140,260,160,190,220,170],
    dwellTimes: [70,70,70,70,70,70,70,70,70], pending: 1, invalid: false, excluded: false }
  assert.equal((await cadenceObservations(directory, sample))[0]!.outcome, 'incomplete')
})

test('legacy excluded reports remain excluded and do not hide a backwards clock', async () => {
  const data = { keys: [100,105,110,115],
    scroll: { count: 1, maxDelta: 120, wheelCount: 1, scrollKey: false, maxTouchPoints: 0 },
    cadence: { keyCount: 0, intervals: [], dwellTimes: [], pending: 0, invalid: false, excluded: true } }
  const rows = await behaviorObservations(directory, data)
  for (const id of ['keystroke-interval', 'keystroke-entropy', 'typing-cadence']) {
    assert.equal(rows.find(row => row.detector === id)?.outcome, 'excluded')
  }
  assert.equal(rows.find(row => row.detector === 'scroll-teleport')?.outcome, 'clear')
  assert.equal((await behaviorObservations(directory, { ...data, keys: [110,100] }))[0]!.outcome, 'invalid')
})

test('unchanged pinned rules still flag fast keyboard timing and accept the calibrated negative', async () => {
  const cadence = { keyCount: 10, intervals: [120,180,210,140,260,160,190,220,170],
    dwellTimes: [70,70,70,70,70,70,70,70,70,70], pending: 0, invalid: false, excluded: false }
  assert.equal((await cadenceObservations(directory, cadence))[0]!.outcome, 'clear')
  assert.equal((await cadenceObservations(directory, { ...cadence, intervals: [5,5,5,5,5,5,5,5,5],
    dwellTimes: [5,5,5,5,5,5,5,5,5,5] }))[0]!.outcome, 'detected')
  const rows = await behaviorObservations(directory, { keys: [100,105,110,115],
    scroll: { count: 1, maxDelta: 120, wheelCount: 1, scrollKey: false, maxTouchPoints: 0 } })
  assert.equal(rows.find(row => row.detector==='keystroke-interval')!.outcome, 'detected')
  assert.equal(rows.find(row => row.detector==='keystroke-entropy')!.outcome, 'detected')
})

function typeSample(c:ReturnType<typeof collector>,target:object,fast=false,physical=false) {
  let at=100
  for(let i=0;i<12;i++) {
    at+=fast?5:[120,180,210,140][i%4]!
    const native=physical?{code:'KeyA'}:{key:'Process',keyCode:229,code:'',isComposing:true}
    c.send('keydown',{target,timeStamp:at,...native})
    c.send('keyup',{target,timeStamp:at+(fast?1:70),...native})
    if(!physical)c.send('keyup',{target,timeStamp:at+(fast?2:71),code:'',isComposing:true})
  }
}
const reading={count:1,maxDelta:120,wheelCount:1,scrollKey:false,maxTouchPoints:0}
test('native Tab release belongs to its actual keydown field after focus moves, preserving both measured samples', async()=>{
  const c=collector('both');typeSample(c,c.target,false,true)
  c.send('keydown',{timeStamp:3000,key:'Tab',keyCode:9,code:'Tab'})
  c.send('blur',{timeStamp:3001});c.send('focus',{target:c.chinese,timeStamp:3002})
  c.send('keyup',{target:c.chinese,timeStamp:3080,key:'Tab',keyCode:9,code:'Tab'})
  typeSample(c,c.chinese,false,true)
  const data=c.snapshot(),english=data.samples.find((s:{field:number})=>s.field===0)
  assert.equal(english.keyCount,13);assert.equal(english.dwellTimes.at(-1),80)
  for(const sample of data.samples) {
    assert.equal(sample.pending,0);assert.equal(sample.invalid,false)
    assert.equal(sample.starts.length,sample.dwellTimes.length)
    assert.equal((await cadenceObservations(directory,sample))[0]!.valid,'true')
  }
})

test('release outside the sampling scope completes only the uniquely identified hold; wrong and extra releases remain invalid',()=>{
  const c=collector(true),button={tagName:'BUTTON'}
  c.send('keydown',{timeStamp:100,key:'Tab',keyCode:9,code:'Tab'})
  c.send('blur',{timeStamp:101})
  c.send('keyup',{target:button,timeStamp:180,key:'Tab',keyCode:9,code:'Tab'})
  assert.deepEqual(c.snapshot().dwellTimes,[80]);assert.equal(c.snapshot().pending,0)
  assert.equal(c.snapshot().invalid,false)
  c.send('keyup',{timeStamp:190,key:'Tab',keyCode:9,code:'Tab'})
  assert.equal(c.snapshot().invalid,true)
  const mismatch=collector('both')
  mismatch.send('keydown',{timeStamp:100,code:'KeyA'})
  mismatch.send('keyup',{target:mismatch.chinese,timeStamp:180,code:'KeyB'})
  assert.equal(mismatch.snapshot().samples[0].pending,1)
  assert.equal(mismatch.snapshot().samples[1].invalid,true)
  assert.deepEqual(mismatch.snapshot().samples[1].dwellTimes,[])
})

test('first mismatch retains bounded anonymous real event order without recording key identities or text',()=>{
  const c=collector('both');typeSample(c,c.target,false,true)
  for(let i=0;i<6;i++) {
    c.send('keydown',{timeStamp:2300+i*80,code:'KeyA'})
    c.send('keyup',{timeStamp:2340+i*80,code:'KeyA'})
  }
  c.send('compositionstart',{timeStamp:3000})
  c.send('keydown',{timeStamp:3010,code:'KeyA',key:'a'})
  c.send('compositionend',{timeStamp:3030,isTrusted:false})
  c.send('keyup',{timeStamp:3080,code:'KeyB',key:'b'})
  const sample=c.snapshot(),trace=sample.context.fault.trace
  assert.equal(trace.length,32);assert.equal(cadenceSchema.safeParse(sample).success,true)
  assert.deepEqual(trace.slice(-4).map((e:unknown[])=>e[0]),['compositionstart','keydown','compositionend','keyup'])
  assert.notEqual(trace.at(-3)[3],trace.at(-1)[3])
  assert.equal(trace.at(-2)[4]&8,0);assert.equal(trace.at(-1)[1],3080)
  assert.equal(/KeyA|KeyB|"code"|"value"/.test(JSON.stringify(sample)),false)
  c.send('keyup',{timeStamp:3090,code:'KeyA'})
  assert.deepEqual(c.snapshot().context.fault.trace,trace)
})

test('Windows IME-consumed Ctrl+Space down leaves context-only native up, without invalidating complete real samples', async()=>{
  for(const physical of [true,false]) {
    const c=collector('both');typeSample(c,c.target,false,true)
    const control={key:'Control',keyCode:17,code:physical?'ControlLeft':'',ctrlKey:true}
    c.send('keydown',{timeStamp:4267.799999999814,...control,keyCode:229,key:'Process',isComposing:true})
    c.send('keydown',{timeStamp:4270.199999999255,...control,isComposing:true})
    c.send('compositionend',{timeStamp:4310.899999999441,isTrusted:false})
    c.send('keyup',{timeStamp:4348.799999999814,...control,keyCode:229,key:'Process',ctrlKey:false})
    c.send('keyup',{timeStamp:4350.399999999441,...control,ctrlKey:false})
    c.send('keyup',{timeStamp:4372.199999999255,key:' ',keyCode:32,code:physical?'Space':''})
    const sample=c.snapshot().samples[0]
    assert.equal(sample.invalid,false);assert.equal(sample.pending,0)
    assert.equal(sample.keyCount,12);assert.equal(sample.dwellTimes.length,12)
    for(const row of await behaviorObservations(directory,{keys:sample.starts,cadence:sample,scroll:reading}))
      assert.equal(row.valid,'true')
  }
})

test('IME shortcut exclusion cannot swallow wrong, extra, untrusted or stale releases and never fabricate a Space hold',()=>{
  for(const kind of ['missing-control','wrong-key','extra-release','untrusted','intervening-key','focus-change']) {
    const c=collector(true)
    if(kind!=='missing-control') {
      c.send('keydown',{timeStamp:100,key:'Control',keyCode:17,code:'ControlLeft',ctrlKey:true})
      c.send('keyup',{timeStamp:180,key:'Control',keyCode:17,code:'ControlLeft'})
    }
    if(kind==='intervening-key') {
      c.send('keydown',{timeStamp:190});c.send('keyup',{timeStamp:210})
    }
    if(kind==='focus-change')c.send('blur',{timeStamp:200})
    const up={timeStamp:220,key:' ',keyCode:32,code:kind==='wrong-key'?'KeyB':'Space',isTrusted:kind!=='untrusted'}
    c.send('keyup',up)
    if(kind==='extra-release')c.send('keyup',{...up,timeStamp:221})
    assert.equal(c.snapshot().invalid,true,kind)
    assert.equal(c.snapshot().dwellTimes.length,kind==='intervening-key'?1:0,kind)
  }
  const c=collector(true)
  c.send('keydown',{timeStamp:100,key:'Control',keyCode:17,code:'ControlLeft',ctrlKey:true})
  c.send('keyup',{timeStamp:180,key:' ',keyCode:32,code:'Space',ctrlKey:true})
  c.send('keyup',{timeStamp:190,key:'Control',keyCode:17,code:'ControlLeft'})
  c.send('keyup',{timeStamp:195,key:' ',keyCode:32,code:'Space'})
  assert.equal(c.snapshot().invalid,true,'one Control chain cannot cover two orphan releases')
  c.send('keydown',{timeStamp:200,key:' ',keyCode:32,code:'Space'})
  c.send('keyup',{timeStamp:270,key:' ',keyCode:32,code:'Space'})
  assert.deepEqual(c.snapshot().dwellTimes,[70]);assert.equal(c.snapshot().keyCount,1)
  const shortcut=collector(true)
  shortcut.send('keydown',{timeStamp:100,key:'Control',keyCode:17,code:'ControlLeft',ctrlKey:true})
  shortcut.send('keydown',{timeStamp:110,key:' ',keyCode:32,code:'Space',ctrlKey:true})
  shortcut.send('keyup',{timeStamp:180,key:' ',keyCode:32,code:'Space',ctrlKey:true})
  shortcut.send('keyup',{timeStamp:190,key:'Control',keyCode:17,code:'ControlLeft'})
  shortcut.send('keyup',{timeStamp:200,key:' ',keyCode:32,code:'Space'})
  assert.equal(shortcut.snapshot().invalid,true,'already observed shortcut cannot excuse an extra release')
})

test('bilingual failure diagnostics fit the unchanged 16KiB telemetry request boundary with a full event batch',()=>{
  const c=collector('both');let at=10233.200000000186
  for(const [target,count] of [[c.target,35],[c.chinese,28]] as const) {
    for(let i=0;i<count;i++) {
      at+=133.29999999981374
      c.send('keydown',{target,timeStamp:at,keyCode:229,key:'Process',isComposing:true})
      c.send('keyup',{target,timeStamp:at+79.300000000186,keyCode:229,key:'Process',isComposing:true})
      c.send('keyup',{target,timeStamp:at+80.300000000186,isComposing:true})
    }
    c.send('keyup',{target,timeStamp:at+100,code:'KeyB'})
  }
  const sample=c.snapshot();assert.equal(cadenceSchema.safeParse(sample).success,true)
  const packet={version:1,page:'00000000-0000-4000-8000-000000000001',batch:'00000000-0000-4000-8000-000000000002',dropped:0,
    events:Array.from({length:64},()=>({type:'compositionend',trusted:false,hidden:false})),
    behavior:{keys:sample.starts,cadence:sample,scroll:reading},
    flow:{english:22,chinese:8,englishInputs:35,chineseInputs:28,composing:false,scrolled:true,submitted:true}}
  assert.ok(Buffer.byteLength(JSON.stringify(packet))<=16384,'diagnostics_must_not_create_transport_failure')
})

test('bilingual fields keep separate real samples; a normal field cannot conceal another field positive', async () => {
  for(const fast of [false,true]) {
    const c=collector('both')
    typeSample(c,c.target,fast);typeSample(c,c.chinese)
    const data=c.snapshot();assert.equal(data.samples.length,2)
    for(const sample of data.samples) {
      assert.equal(sample.keyCount,12);assert.equal(sample.context.imePairs,12)
      assert.equal(sample.pending,0);assert.equal(sample.excluded,false)
    }
    const rows=await behaviorObservations(directory,{keys:data.starts,cadence:data,scroll:reading})
    for(const id of ['keystroke-interval','keystroke-entropy','typing-cadence']) {
      assert.equal(rows.find(r=>r.detector===id)?.outcome,fast?'detected':'clear',id)
      assert.equal(rows.find(r=>r.detector===id)?.valid,'true',id)
    }
  }
})
test('ambiguous code-less overlaps cannot generate holds; missing releases leave only down statistics measurable', async () => {
  const c=collector(true)
  c.send('keydown',{timeStamp:100,key:'Process',keyCode:229,code:''})
  c.send('keydown',{timeStamp:110,key:'Process',keyCode:229,code:''})
  for(const at of [150,160]) {
    c.send('keyup',{timeStamp:at,key:'Process',keyCode:229,code:''})
    c.send('keyup',{timeStamp:at+1,code:''})
  }
  typeSample(c,c.target)
  const sample=c.snapshot();assert.equal(sample.invalid,false)
  assert.equal(sample.dwellTimes.length,12);assert.equal(sample.keyCount,14)
  assert.equal((await cadenceObservations(directory,sample))[0]!.outcome,'incomplete')
  const missing=collector(true)
  for(let i=0;i<12;i++)missing.send('keydown',{timeStamp:100+i*130,code:`Key${i}`})
  missing.send('blur')
  const rows=await behaviorObservations(directory,{keys:[],cadence:missing.snapshot(),scroll:reading})
  assert.equal(rows.find(r=>r.detector==='keystroke-interval')?.valid,'true')
  assert.equal(rows.find(r=>r.detector==='typing-cadence')?.outcome,'incomplete')
})
test('native timing envelope rejects forged starts/counts/intervals/pair counts while preserving original thresholds', async () => {
  const c=collector(true);typeSample(c,c.target)
  const sample=c.snapshot()
  assert.equal(cadenceSchema.safeParse({...sample,samples:[sample,{...sample}]}).success,false)
  assert.equal(cadenceSchema.safeParse({...sample,samples:[{...sample,starts:undefined}]}).success,false)
  for(const change of [{keyCount:13},{starts:[1,2]},{intervals:Array(11).fill(150)},
    {context:{...c.snapshot().context,imePairs:11}}]) {
    assert.equal((await cadenceObservations(directory,{...c.snapshot(),...change}))[0]!.outcome,'invalid')
  }
  sample.starts[1]=sample.starts[0]-1
  const rows=await behaviorObservations(directory,{keys:[],cadence:sample,scroll:reading})
  for(const id of ['keystroke-interval','keystroke-entropy','typing-cadence'])
    assert.equal(rows.find(r=>r.detector===id)?.outcome,'invalid',id)
})
test('100-key limit does not turn following native releases into corruption', () => {
  const c=collector(true)
  for(let i=0;i<105;i++) {
    c.send('keydown',{timeStamp:i*150});c.send('keyup',{timeStamp:i*150+70})
  }
  const sample=c.snapshot();assert.equal(sample.keyCount,100)
  assert.equal(sample.dwellTimes.length,100);assert.equal(sample.invalid,false);assert.equal(sample.pending,0)
})

function current() {
  const state = { ...createMeasurement(), pageId: 'owned-page', runId: 'owned-run', mode: 'interactive', behaviorPhase: 'done' }
  const signals = catalog.filter(row => row.group < 3).map(row => ({ category: row.category, detector: row.id, valid: true, outcome: 'clear' }))
  acceptReceipt(state, { page: state.pageId, batch: 'automatic', environment: 'measured', report: { signals, input: {} } })
  return state
}
function acceptEvents(state: ReturnType<typeof current>, types: string[], batch: string) {
  return acceptReceipt(state, { page: state.pageId, batch,
    report: checkReceipt([], types.map(type => ({ type, trusted: false, hidden: false })), 0) })
}

test('Chrome queued compositionend false with trusted input is normal context, not adverse input evidence', () => {
  const state = current()
  // 来自实际 Windows 手输及 Chrome 原 IME 回执的信任位组合；不改写浏览器原始值。
  acceptReceipt(state, {page:state.pageId,batch:'native-ime',report:checkReceipt([], [
    {type:'compositionstart',trusted:true,hidden:false},{type:'input',trusted:true,hidden:false},
    {type:'compositionend',trusted:false,hidden:false},{type:'paste',trusted:true,hidden:false}
  ],0)})
  const report=measurementReport(state)
  assert.equal(report.signals.find(row=>row.id==='trusted')!.status,'clear')
  assert.equal(report.input.byType.compositionend.untrusted,1)
  assert.notEqual(report.verdict,'human') // 正常输入仍不能替代本次原服务端验证。
})

test('composition context alone cannot establish input assessment; script input/key events remain positive through IME and later negatives', () => {
  const state = current()
  acceptEvents(state, ['compositionend'], 'composition')
  let report = measurementReport(state)
  assert.equal(report.verdict, 'unknown')
  assert.equal(report.signals.find(row => row.id === 'trusted')!.status, 'excluded')
  assert.equal(report.input.untrusted, 1)
  assert.match(report.signals.find(row => row.id === 'trusted')!.reason, /尚无适用输入样本/)
  for (const type of ['input', 'change', 'click', 'keydown', 'keyup']) {
    const direct = current()
    acceptEvents(direct, ['compositionend'], 'first')
    acceptEvents(direct, [type], 'direct')
    acceptReceipt(direct, { page: direct.pageId, batch: 'later', report: checkReceipt([], [{ type: 'input', trusted: true, hidden: false }], 0) })
    report = measurementReport(direct)
    assert.equal(report.verdict, 'bot', type)
    assert.equal(report.signals.find(row => row.id === 'trusted')!.status, 'flagged')
    assert.deepEqual(report.evidence, ['input:trusted'])
  }
  const native = current()
  acceptReceipt(native, { page: native.pageId, batch: 'native', report: checkReceipt([], [{ type: 'compositionend', trusted: true, hidden: false }], 0) })
  assert.equal(measurementReport(native).signals.find(row => row.id === 'trusted')!.status, 'excluded')
})

test('legacy untyped adverse input remains unknown and duplicate/foreign batches cannot alter evidence', () => {
  const state = current()
  const receipt = { page: state.pageId, batch: 'legacy', report: { signals: [], input: { events: 1, untrusted: 1, hidden: 0, dropped: 0 } } }
  acceptReceipt(state, receipt)
  assert.equal(measurementReport(state).verdict, 'unknown')
  assert.equal(acceptReceipt(state, receipt), false)
  assert.equal(acceptReceipt(state, { ...receipt, page: 'foreign', batch: 'different' }), false)
  assert.equal(state.input.untrusted, 1)
  const verified={status:'accepted',challengeAccepted:true,protectedRequestAccepted:true,allowlisted:false}
  state.verification=verified
  state.flow={submitted:true}
  assert.equal(measurementReport(state).verdict,'unknown')
})
