import assert from "node:assert/strict"
import test from "node:test"
import { BrowserModel } from "../../../vendor/daily-chrome-extension/browserModel.js"

test("borrow aliases only target approved task tabs; reconnect replays native Runtime without reattach; detach leaves Chrome alive",async()=>{
  const calls:Array<{method:string;params:any}>=[], events:any[]=[]
  const model=new BrowserModel(async(method,params)=>{calls.push({method,params}); return method==="chrome.debugger.sendCommand"&&params[1]==="Target.getTargetInfo"
    ?{targetInfo:{targetId:"approved",type:"page",url:"about:blank"}}:{} })
  model.connectOverCDP(message=>events.push(message)); model.onTabCreated({id:7,windowId:9,index:0,active:true,pinned:false})
  await model.enableAutoAttach(); assert.throws(()=>model.borrowTarget("personal","root"),/not_authorized/)
  const borrowed=model.borrowTarget("approved","root").sessionId
  model.onDebuggerEvent({tabId:7},"Overlay.inspectNodeRequested",{backendNodeId:9})
  assert(events.some(e=>e.sessionId===borrowed&&e.method==="Overlay.inspectNodeRequested"))
  await model.sendCommand(borrowed,"Runtime.enable",{})
  await model.sendCommand(borrowed,"Runtime.enable",{})
  assert.equal(calls.filter(c=>c.params?.[1]==="Runtime.disable").length,1)
  await model.releaseBorrow(borrowed); assert.equal(model.hasSession(borrowed),false)
  const before=events.filter(e=>e.sessionId===borrowed).length
  model.onDebuggerEvent({tabId:7},"Overlay.inspectNodeRequested",{backendNodeId:10})
  assert.equal(events.filter(e=>e.sessionId===borrowed).length,before)
  assert.equal((await model.getTargets()).length,1); assert(!calls.some(c=>c.method==="chrome.debugger.detach"||c.method==="chrome.tabs.remove"))
  model.connectOverCDP(message=>events.push(message)); await model.enableAutoAttach()
  const next=model.borrowTarget("approved","root").sessionId; await model.sendCommand(next,"Runtime.enable",{})
  assert.equal(calls.filter(c=>c.method==="chrome.debugger.attach").length,1)
  assert.equal(calls.filter(c=>c.params?.[1]==="Runtime.disable").length,2)
  assert.equal(model.hasSession(borrowed),false); model.onTabRemoved(7); assert.equal(model.hasSession(next),false)
  await assert.rejects(model.sendCommand(next,"Network.getCookies",{urls:["https://example.test"]}),/No tab found/)
})

// WHY：真实扩展别名共用原生Fetch，必须唯一放行、保留认证，并在释放/失败后恢复。
test('borrowed Fetch owns request pauses exclusively and restores native auth and configuration', async () => {
  const calls: any[] = [], events: any[] = []
  let fail = false
  const model = new BrowserModel(async (method, params) => {
    calls.push({ method, params })
    if (params[1] === 'Target.getTargetInfo') return { targetInfo: { targetId: 'owned', type: 'page' } }
    if (fail && params[1] === 'Fetch.enable') throw Error('owned-enable-failed')
    return {}
  })
  model.connectOverCDP(message => events.push(message))
  model.onTabCreated({ id: 7, windowId: 9, index: 0, active: true, pinned: false })
  await model.enableAutoAttach()
  const primary = events.find(e => e.method === 'Target.attachedToTarget').params.sessionId
  const original = { handleAuthRequests: true, patterns: [{ urlPattern: '*' }] }
  await model.sendCommand(primary, 'Fetch.enable', original)
  const borrowed = model.borrowTarget('owned', 'root').sessionId
  await model.sendCommand(borrowed, 'Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  const emit = (method: string, source: any = { tabId: 7 }) => {
    events.length = 0; model.onDebuggerEvent(source, method, { requestId: 'owned-request' }); return events.slice()
  }
  assert.deepEqual(emit('Fetch.requestPaused').map(e => e.sessionId), [borrowed])
  assert.deepEqual(emit('Fetch.authRequired').map(e => e.sessionId), [primary])
  assert.equal(calls.at(-1).params[2].handleAuthRequests, true)
  assert.equal(emit('Fetch.requestPaused', { tabId: 99 }).length, 0)
  await assert.rejects(model.sendCommand(primary, 'Fetch.disable', {}), /fetch_owner_busy/)
  fail = true
  await assert.rejects(model.releaseBorrow(borrowed), /owned-enable-failed/)
  assert.equal(model.hasSession(borrowed), true)
  assert.deepEqual(emit('Fetch.requestPaused').map(e => e.sessionId), [borrowed])
  fail = false
  await model.sendCommand(borrowed, 'Fetch.disable', {})
  assert.deepEqual(emit('Fetch.requestPaused').map(e => e.sessionId), [primary])
  assert.deepEqual(calls.at(-1).params.slice(1), ['Fetch.enable', original])
  await model.sendCommand(borrowed, 'Fetch.enable', {})
  await model.releaseBorrow(borrowed)
  assert.deepEqual(emit('Fetch.requestPaused').map(e => e.sessionId), [primary])
  assert.equal(model.hasSession(borrowed), false)
})
