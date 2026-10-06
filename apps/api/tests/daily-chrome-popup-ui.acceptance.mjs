// WHY：真实原生 popup 逐帧观察；宿主只提供受控状态，不创建真实授权/任务或读取个人 Profile。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Cdp, devtoolsPort, evaluate, pause, screenshot, waitDom, waitExit } from './minimum-product-loop-workbench.js';
if (process.env.BAT_RUN_DAILY_POPUP_UI !== '1') throw Error('explicit_popup_ui_acceptance_required');
const root = process.cwd(), directory = path.join(root, 'work/popup-public-controls-' + Date.now()), profile = path.join(directory, 'chrome');
await mkdir(profile, { recursive: true });
let hostDelay = 1100, child, browser, worker, popup, port, extensionId;
const proof = { mode: 'Windows native popup; persisted extension preference; controlled delayed/offline host; no real authorization',
  scope: process.env.BAT_POPUP_UI_SCOPE === 'visual' ? 'visual' : 'interaction' }, clients = [];
const host = createServer(async (_req, res) => {
  await pause(hostDelay);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ paired: true, connected: false, busy: false, profileDirectory: 'Default',
    profiles: [{ id: 'Default', name: '测试 Chrome' }], popupRequest: null }));
});
await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + host.address().port;
const observer = 'globalThis.__switchFrames=[];globalThis.__uiErrors=[];globalThis.__hostReads=0;const originalFetch=fetch;globalThis.fetch=(...args)=>originalFetch(...args).then(r=>{if(String(args[0]).includes("/api/browser/daily-chrome"))__hostReads++;return r});addEventListener("error",e=>__uiErrors.push(e.message));addEventListener("unhandledrejection",e=>__uiErrors.push(String(e.reason)));const observe=()=>{const s=document.querySelector(".bat-switch");const value=s?.getAttribute("aria-checked")??"loading";const last=__switchFrames.at(-1);if(!last||last.value!==value)__switchFrames.push({at:performance.now(),value});};new MutationObserver(observe).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:["aria-checked"]});observe();';
async function connect(url) {
  const client = await Cdp.connect(url), send = client.send.bind(client);
  client.send = (method, params) => Promise.race([send(method, params), pause(7000).then(()=>{throw Error('cdp_timeout:'+method);})]);
  clients.push(client); return client;
}
async function entries() { return fetch('http://127.0.0.1:' + port + '/json/list').then(r => r.json()); }
async function target(predicate) { for(let i=0;i<100;i++){ const found=(await entries()).find(predicate); if(found)return found; await pause(40); } throw Error('target_missing'); }
async function open(expected, name) {
  await evaluate(worker,'void chrome.action.openPopup();true');
  const entry=await target(t=>t.url==='chrome-extension://'+extensionId+'/status.html');
  popup=await connect(entry.webSocketDebuggerUrl);
  await waitDom(popup,'document.querySelector(".bat-popup")',6000);
  await popup.send('Page.enable');
  // 原生 popup 原位重新加载，观察从创建 React 到首个已知值的每一帧；不暂停后台 worker。
  await popup.send('Page.addScriptToEvaluateOnNewDocument',{source:observer});
  await popup.send('Page.reload');
  await waitDom(popup,'document.querySelector(".bat-switch")?.getAttribute("aria-checked")==="'+expected+'"',6000);
  await waitDom(popup,'globalThis.__switchFrames?.at(-1)?.value==="'+expected+'"',3000);
  const state=await evaluate(popup,'({frames:globalThis.__switchFrames,hostReads:globalThis.__hostReads,radix:document.querySelector(".bat-switch").classList.contains("rt-SwitchRoot"),thumb:getComputedStyle(document.querySelector(".rt-SwitchThumb")).backgroundColor,errors:globalThis.__uiErrors})');
  assert.ok(state.frames?.length, 'first_frame_instrumentation_missing');
  assert.ok(state.frames.every(f=>f.value==='loading'||f.value===String(expected)),name+':incorrect_first_value');
  assert.equal(state.radix,true); assert.deepEqual(state.errors,[]);
  proof[name]=state;assert.equal(state.hostReads,0,'local_preference_waited_for_host');console.log(name+' first value verified');
  await pause(1300);
  assert.equal(await evaluate(popup,'document.querySelector(".bat-switch").getAttribute("aria-checked")'),String(expected));
  return entry.id;
}
async function close(id) {
  await browser.send('Target.closeTarget',{targetId:id});
  for(let i=0;i<100;i++){if(!(await entries()).some(t=>t.id===id))return;await pause(30);}
  throw Error('popup_did_not_close');
}
async function setByMouse(enabled) {
  const point=await evaluate(popup,'(()=>{const r=document.querySelector(".bat-switch").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await popup.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await popup.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await waitDom(popup,'document.querySelector(".bat-switch")?.getAttribute("aria-checked")==="'+enabled+'"&&!document.querySelector(".bat-switch").disabled',4000);
  assert.equal(await evaluate(worker,'(async()=> (await chrome.storage.local.get("bat-connection-enabled"))["bat-connection-enabled"])()'),enabled);
}
try {
  child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  port=await devtoolsPort(profile);
  const info=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());proof.chrome=info.Browser;
  browser=await connect(info.webSocketDebuggerUrl);
  extensionId=(await browser.send('Extensions.loadUnpacked',{path:path.join(root,'work/daily-chrome-extension/extension')})).id;
  worker=await connect((await target(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://'+extensionId))).webSocketDebuggerUrl);
  await worker.send('Runtime.enable');await worker.send('Runtime.runIfWaitingForDebugger');
  await waitDom(worker,'typeof chrome!=="undefined" && Boolean(chrome.storage?.local)',8000);
  console.log('isolated extension loaded, worker='+await evaluate(worker,'typeof chrome.storage.local'));
  await evaluate(worker,'(async()=>{await chrome.storage.local.set({"bat-workbench-origin":'+JSON.stringify(origin)+',"bat-connection-enabled":true,"bat-authorized":true,"bat-profile-name":"测试 Chrome"});return true})()');
  let id=await open(true,'enabledFirstOpen');
  for(const theme of ['light','dark']){
    await popup.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'}]});
    await waitDom(popup,'document.querySelector(".bat-theme").classList.contains("'+theme+'")',4000);
    proof[theme]=await evaluate(popup,'({thumb:getComputedStyle(document.querySelector(".rt-SwitchThumb")).backgroundColor,trackCursor:getComputedStyle(document.querySelector(".rt-SwitchRoot"),"::before").cursor,width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight})');
    assert.equal(proof[theme].thumb,'rgb(255, 255, 255)');assert.equal(proof[theme].trackCursor,'pointer');
    assert.ok(proof[theme].scrollHeight<=proof[theme].height+1);
    await pause(250);
    await screenshot(popup,path.join(directory,'popup-'+theme+'.png'));
  }
  assert.equal(await evaluate(popup,'document.querySelectorAll("details,summary").length'),0);
  await evaluate(popup,'document.activeElement?.blur()');
  const focus=[];
  for(let i=0;i<2;i++){
    await popup.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await popup.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    focus.push(await evaluate(popup,'(()=>{const e=document.activeElement,s=getComputedStyle(e);return{label:e.getAttribute("aria-label")||e.textContent,outline:s.outlineStyle,shadow:s.boxShadow,tag:e.tagName}})()'));
  }
  assert(focus.every(f=>f.tag==='BUTTON'),'permission_copy_became_keyboard_control');
  assert(focus.every(f=>f.outline==='none'),'large_focus_outline_returned');
  assert(focus.some(f=>f.shadow!=='none'),'keyboard_focus_feedback_missing');
  proof.permissionTextStaticAndKeyboardFocus=focus;
  await screenshot(popup,path.join(directory,'popup-keyboard.png'));
  if (process.env.BAT_POPUP_UI_SCOPE !== 'visual') {
  await close(id);id=await open(true,'enabledReopen');
  await setByMouse(false);await close(id);id=await open(false,'pausedReopen');
  await setByMouse(true);await close(id);id=await open(true,'resumedReopen');
  await evaluate(popup,'document.querySelector(".bat-switch").focus()');
  await popup.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await popup.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await waitDom(popup,'document.querySelector(".bat-switch").getAttribute("aria-checked")==="false"',4000);
  await pause(1400);
  assert.equal(await evaluate(popup,'document.querySelector(".bat-switch").getAttribute("aria-checked")'),'false');
  proof.keyboardAndLatePollStable=true;
  host.closeAllConnections();await new Promise(resolve=>host.close(resolve));
  await close(id);id=await open(false,'offlineReopen');
  }
  proof.context=await evaluate(popup,'(async()=>({popups:(await chrome.runtime.getContexts({contextTypes:["POPUP"]})).length,tabs:(await chrome.tabs.query({url:"chrome-extension://"+chrome.runtime.id+"/*"})).length,errors:globalThis.__uiErrors}))()');
  assert.equal(proof.context.popups,1);assert.equal(proof.context.tabs,0);assert.deepEqual(proof.context.errors,[]);
  proof.passed=true;console.log(proof.scope==='visual' ? 'native popup light/dark screenshots verified' : 'native popup persisted initial value, Radix controls, browser themes, mouse/keyboard and offline passed');
}catch(error){proof.passed=false;proof.error=String(error.stack??error);console.error(proof.error);process.exitCode=1;if(popup){proof.diagnostic=await evaluate(popup,'({frames:globalThis.__switchFrames,errors:globalThis.__uiErrors,checked:document.querySelector(".bat-switch")?.getAttribute("aria-checked")})').catch(()=>null);await screenshot(popup,path.join(directory,'failure.png')).catch(()=>{});}}
finally{
  await writeFile(path.join(directory,'result.json'),JSON.stringify(proof,null,2));
  if(browser)await browser.send('Browser.close').catch(()=>{});
  for(const client of clients)client.close();if(child)await waitExit(child);
  host.closeAllConnections();if(host.listening)await new Promise(resolve=>host.close(resolve));
  console.log('proof='+directory);
}
