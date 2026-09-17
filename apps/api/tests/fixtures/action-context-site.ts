import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

export type OracleEvent = Readonly<{
  kind: "event"
  caseId: string
  documentId: string
  href: string
  sequence: number
  type: string
  target: string
  trusted: boolean
  action: string | null
  path: string[]
}>

export type OracleEffect = Readonly<{
  kind: "effect"
  caseId: string
  documentId: string
  href: string
  sequence: number
  effect: string
  value: string | null
}>

export type OracleRecord = OracleEvent | OracleEffect

export type ActionContextSite = Readonly<{
  primaryOrigin: string
  secondaryOrigin: string
  startUrl: string
  url(path: string): string
  snapshot(): Promise<OracleRecord[]>
  close(): Promise<void>
}>

export async function openActionContextSite(): Promise<ActionContextSite> {
  const records: OracleRecord[] = []
  let primaryOrigin = "", secondaryOrigin = ""
  const primary = createServer((request, response) => {
    void handlePrimary(request, response, records, primaryOrigin, secondaryOrigin)
      .catch((error) => failResponse(response, error))
  })
  const secondary = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.invalid")
    if (url.pathname !== "/frames/cross") return notFound(response)
    html(response, framePage("frame-cross", "Cross Frame Action", primaryOrigin + "/oracle", false, true))
  })
  primaryOrigin = await listen(primary)
  secondaryOrigin = await listen(secondary)
  return {
    primaryOrigin,
    secondaryOrigin,
    startUrl: `${primaryOrigin}/cases/hit?shape=a#source-fragment`,
    url: (value) => primaryOrigin + value,
    snapshot: async () => {
      const response = await fetch(primaryOrigin + "/oracle-state")
      assert.equal(response.status, 200)
      return await response.json() as OracleRecord[]
    },
    close: async () => Promise.all([close(primary), close(secondary)]).then(() => undefined),
  }
}

async function handlePrimary(request: IncomingMessage, response: ServerResponse, records: OracleRecord[],
  primaryOrigin: string, secondaryOrigin: string) {
  const url = new URL(request.url ?? "/", "http://fixture.invalid")
  if (url.pathname === "/oracle" && request.method === "POST") {
    const body = JSON.parse(await readBody(request)) as OracleRecord
    if (!validRecord(body)) throw new Error("invalid_action_context_oracle_record")
    records.push(body)
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.statusCode = 204
    response.end()
    return
  }
  if (url.pathname === "/oracle-state") {
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify(records))
    return
  }
  if (url.pathname === "/cases/hit") {
    const shape = url.searchParams.get("shape") === "b" ? "b" : "a"
    html(response, hitPage(primaryOrigin + "/oracle", shape))
    return
  }
  if (url.pathname === "/cases/shadow") {
    html(response, shadowPage(primaryOrigin + "/oracle"))
    return
  }
  if (url.pathname === "/cases/frames") {
    html(response, framesPage(primaryOrigin + "/oracle", secondaryOrigin))
    return
  }
  if (url.pathname === "/frames/same") {
    const rebuilt = url.searchParams.get("document") === "b"
    html(response, framePage(rebuilt ? "frame-same-b" : "frame-same-a",
      rebuilt ? "Rebuilt Frame Action" : "Same Frame Action", primaryOrigin + "/oracle", !rebuilt))
    return
  }
  if (url.pathname === "/cases/navigation") {
    html(response, navigationPage(primaryOrigin + "/oracle"))
    return
  }
  if (url.pathname === "/cases/input") {
    html(response, inputPage(primaryOrigin + "/oracle"))
    return
  }
  if (url.pathname === "/cases/scroll") {
    html(response, scrollPage(primaryOrigin + "/oracle"))
    return
  }
  if (url.pathname === "/cases/select") {
    html(response, selectPage(primaryOrigin + "/oracle"))
    return
  }
  if (url.pathname === "/cases/dialog") {
    html(response, dialogPage(primaryOrigin + "/oracle"))
    return
  }
  if (url.pathname === "/cases/popup") {
    html(response, popupPage(primaryOrigin + "/oracle"))
    return
  }
  if (url.pathname === "/cases/popup-child") {
    html(response, popupChildPage(primaryOrigin + "/oracle"))
    return
  }
  if (url.pathname === "/cases/final") {
    html(response, finalPage(primaryOrigin + "/oracle"))
    return
  }
  notFound(response)
}

function hitPage(oracle: string, shape: "a" | "b") {
  const child = shape === "a"
    ? '<span class="fill" data-oracle-node="span-a">Variable Hit</span>'
    : '<svg class="fill" data-oracle-node="svg-b" viewBox="0 0 200 70" aria-hidden="true"><rect width="200" height="70"></rect></svg><span class="label">Variable Hit</span>'
  return page(`hit-${shape}`, oracle, `<style>${baseStyle()}.label{position:relative;pointer-events:none}</style>
    <button id="variable" aria-label="Variable Hit">${child}</button>`, `
    const button=document.getElementById('variable');
    button.addEventListener('click',event=>{
      if(!event.isTrusted)return;
      effect('hit-${shape}');
      ${shape === "a" ? "button.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));" : ""}
    });`)
}

function shadowPage(oracle: string) {
  return page("shadow", oracle, `<style>${baseStyle()}x-open-hit,x-closed-hit{position:absolute;inset:0;display:block}</style>
    <button aria-label="Open Shadow Action" data-oracle-action="shadow-open"><x-open-hit id="open-hit"></x-open-hit></button>
    <button aria-label="Closed Shadow Action" data-oracle-action="shadow-closed"><x-closed-hit id="closed-hit"></x-closed-hit></button>`, `
    const openHost=document.getElementById('open-hit'),openRoot=openHost.attachShadow({mode:'open'});
    openRoot.innerHTML='<span data-open-internal="true" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">Open Shadow Action</span>';
    openRoot.querySelector('span').addEventListener('click',()=>effect('shadow-open'));
    const closedHost=document.getElementById('closed-hit'),closedRoot=closedHost.attachShadow({mode:'closed'});
    closedRoot.innerHTML='<span data-closed-internal="true" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">Closed Shadow Action</span>';
    closedRoot.querySelector('span').addEventListener('click',()=>effect('shadow-closed'));`)
}

function framesPage(oracle: string, secondaryOrigin: string) {
  return page("frames-root", oracle, `<style>iframe{width:300px;height:120px;margin:8px}</style>
    <iframe title="Same origin frame" src="/frames/same?document=a#same-a"></iframe>
    <iframe title="Cross origin frame" src="${secondaryOrigin}/frames/cross?document=a#cross-a"></iframe>`, "")
}

function framePage(caseId: string, label: string, oracle: string, rebuild: boolean, acceptSynthetic = false) {
  return page(caseId, oracle, `<style>${baseStyle()}</style><button aria-label="${label}"><span class="fill">${label}</span></button>`, `
    document.querySelector('button').addEventListener('click',event=>{
      ${acceptSynthetic ? "" : "if(!event.isTrusted)return;"}
      effect('${caseId}');
      ${rebuild ? "location.replace('/frames/same?document=b#same-b');" : "document.body.dataset.completed='true';"}
    });`)
}

function navigationPage(oracle: string) {
  return page("navigation", oracle, `<style>${baseStyle()}</style>
    <button id="navigate" aria-label="Navigate Now"><span class="fill" data-oracle-node="navigation-child">Navigate Now</span></button>`, `
    const button=document.getElementById('navigate');button.addEventListener('click',event=>{
      if(!event.isTrusted)return;
      effect('navigate');button.remove();location.assign('/cases/input?from=action#arrived');
    });`)
}

function inputPage(oracle: string) {
  return page("input", oracle, `<label>Next Input <input aria-label="Next Input" data-oracle-action="input-text"></label><output id="value"></output>`, `
    const input=document.querySelector('input'),output=document.getElementById('value');
    input.addEventListener('input',()=>{output.textContent=input.value;effect('input-value',output.textContent)});
    input.addEventListener('keydown',event=>{if(event.key==='Enter')effect('enter-value',output.textContent)});`)
}

function scrollPage(oracle: string) {
  return page("scroll", oracle, `<style>
    body{margin:0;font:16px sans-serif}.spacer{height:1100px}.marker{height:120px;background:#dff4df;padding:16px}
    [aria-label="Scrollable Region"]{height:150px;overflow:auto;border:2px solid #333;margin:24px;padding:8px}
    .container-spacer{height:620px}.container-marker{height:80px;background:#dfe9ff}
  </style>
  <p data-oracle-action="page-scroll">Scroll the page until the lazy marker is visible.</p>
  <div class="spacer"></div><section id="lazy-host" class="marker">Lazy Host</section>
  <div aria-label="Scrollable Region" data-oracle-action="container-scroll" role="region" tabindex="0">
    <div class="container-spacer"></div><div class="container-marker">Container End Marker</div>
  </div>`, `
    let pageReported=false,containerReported=false,lazyReported=false;
    const lazyHost=document.getElementById('lazy-host'),region=document.querySelector('[aria-label="Scrollable Region"]');
    addEventListener('scroll',()=>{if(scrollY>0&&!pageReported){pageReported=true;effect('page-scroll',String(Math.round(scrollY)))};
      const rect=lazyHost.getBoundingClientRect();if(rect.top<innerHeight&&rect.bottom>0&&!lazyReported){lazyReported=true;
        const marker=document.createElement('strong');marker.id='lazy-loaded';marker.textContent='Loaded after scroll';
        lazyHost.append(marker);effect('lazy-inserted',marker.textContent) }},{passive:true});
    region.addEventListener('scroll',()=>{if(region.scrollTop>0&&!containerReported){containerReported=true;
      effect('container-scroll',String(Math.round(region.scrollTop))) }},{passive:true});`)
}

function selectPage(oracle: string) {
  return page("select", oracle, `<label>Shipping Method
    <select aria-label="Shipping Method" data-oracle-action="native-select">
      <option value="ground">Ground</option><option value="air">Air Express</option>
      <option value="pickup">Store Pickup</option>
    </select></label><output id="selection">ground</output>`, `
    const select=document.querySelector('select'),output=document.getElementById('selection');
    select.addEventListener('input',event=>effect('select-input',event.isTrusted+':'+select.value));
    select.addEventListener('change',event=>{if(event.type==='change')output.textContent=select.value;
      effect('select-value',event.type+':'+String(event.isTrusted)+':'+select.value)});`)
}

function dialogPage(oracle: string) {
  return page("dialog", oracle, `<style>${baseStyle()}dialog{padding:24px}</style>
    <button aria-label="Open Confirm" data-oracle-action="confirm-dialog"><span class="fill">Open Confirm</span></button>
    <button aria-label="Open Prompt" data-oracle-action="prompt-dialog"><span class="fill">Open Prompt</span></button>
    <button aria-label="Open Modal" data-oracle-action="html-modal"><span class="fill">Open Modal</span></button>
    <dialog aria-label="HTML Modal"><p>Independent modal content</p>
      <button aria-label="Close Modal" data-oracle-action="html-modal-close">Close Modal</button></dialog>`, `
    const buttons=[...document.querySelectorAll('button')],modal=document.querySelector('dialog');
    buttons[0].addEventListener('click',()=>effect('confirm-result',String(confirm('confirm-token'))));
    buttons[1].addEventListener('click',()=>effect('prompt-result',String(prompt('prompt-token','seed'))));
    buttons[2].addEventListener('click',()=>{modal.showModal();effect('modal-open',String(modal.open))});
    modal.querySelector('button').addEventListener('click',()=>{modal.close();effect('modal-close',String(modal.open))});`)
}

function popupPage(oracle: string) {
  return page("popup", oracle, `<style>${baseStyle()}</style><main data-popup-role="opener">
    <button aria-label="Open Child Tab" data-oracle-action="popup-open"><span class="fill">Open Child Tab</span></button>
    <output id="opener-state">ready</output></main>`, `
    document.querySelector('button').addEventListener('click',()=>{const child=window.open('/cases/popup-child?from=opener#child','_blank');
      document.getElementById('opener-state').textContent=child?'opened':'blocked';effect('popup-opened',child?'opened':'blocked')});`)
}

function popupChildPage(oracle: string) {
  return page("popup-child", oracle, `<style>${baseStyle()}</style><main data-popup-role="child">
    <button aria-label="Child Tab Action" data-oracle-action="popup-child"><span class="fill">Child Tab Action</span></button>
    <output id="child-state">ready</output></main>`, `
    document.querySelector('button').addEventListener('click',()=>{document.getElementById('child-state').textContent='done';
      effect('popup-child','done')});`)
}

function finalPage(oracle: string) {
  return page("final", oracle, `<style>${baseStyle()}</style>
    <button id="repeat-final" aria-label="Repeat Final"><span class="fill">Repeat Final</span></button>`, `
    let count=0;const button=document.getElementById('repeat-final');button.addEventListener('click',event=>{
      if(!event.isTrusted)return;
      count+=1;effect('repeat-final',String(count));if(count===2)button.remove();
    });`)
}

function page(caseId: string, oracle: string, body: string, behavior: string) {
  const documentId = randomUUID()
  return `<!doctype html><meta charset="utf-8"><title>${caseId}</title>${body}<script>
    ${oracleScript(oracle, caseId, documentId)}
    ${behavior}
  </script>`
}

function oracleScript(oracle: string, caseId: string, documentId: string) {
  return `const oracleEndpoint=${JSON.stringify(oracle)},oracleCase=${JSON.stringify(caseId)},oracleDocument=${JSON.stringify(documentId)};
    document.documentElement.dataset.oracleDocument=oracleDocument;
    let oracleSequence=0;const transmit=payload=>{const body=JSON.stringify({caseId:oracleCase,documentId:oracleDocument,
      href:location.href,sequence:oracleSequence++,...payload});
      const blob=new Blob([body],{type:'text/plain'});if(!navigator.sendBeacon(oracleEndpoint,blob))
        fetch(oracleEndpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body,keepalive:true}).catch(()=>{});};
    const effect=(name,value=null)=>transmit({kind:'effect',effect:name,value});let keyboardAction=null;
    for(const type of ['click','beforeinput','input','change','keydown','keypress','keyup','scroll'])
      document.addEventListener(type,event=>{if(event.type==='keydown'&&event.key==='Enter')keyboardAction='enter-key';
        const path=event.composedPath();const marked=path.find(node=>node?.dataset?.oracleAction);
        const target=event.target===document?'#document':event.target===globalThis?'window':event.target?.localName||'';
        const scrollAction=event.type==='scroll'?(marked?.dataset?.oracleAction||(event.target===document?'page-scroll':null)):null;
        transmit({kind:'event',type:event.type,target,trusted:event.isTrusted,
          action:keyboardAction||scrollAction||marked?.dataset?.oracleAction||null,
          path:path.map(node=>node.localName||node.nodeName||'window')});
        if(event.type==='keyup'&&event.key==='Enter')keyboardAction=null},true);`
}

function baseStyle() {
  return "button{position:relative;width:240px;height:72px;margin:12px}.fill{position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center}"
}

function validRecord(value: unknown): value is OracleRecord {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  const base = typeof record.caseId === "string" && typeof record.documentId === "string" && typeof record.href === "string"
    && typeof record.sequence === "number"
  return base && (record.kind === "effect" ? typeof record.effect === "string"
    : record.kind === "event" && typeof record.type === "string" && typeof record.target === "string"
      && typeof record.trusted === "boolean" && (typeof record.action === "string" || record.action === null)
      && Array.isArray(record.path))
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

function html(response: ServerResponse, body: string) {
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(body)
}

function notFound(response: ServerResponse) { response.statusCode = 404; response.end("not found") }
function failResponse(response: ServerResponse, error: unknown) {
  if (!response.headersSent) response.statusCode = 500
  response.end(error instanceof Error ? error.message : "fixture failure")
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  return `http://127.0.0.1:${address.port}`
}

async function close(server: Server) {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
