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
  model.releaseBorrow(borrowed); assert.equal(model.hasSession(borrowed),false)
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
