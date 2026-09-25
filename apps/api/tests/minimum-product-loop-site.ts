import { createServer, type ServerResponse } from "node:http"

export type MinimumProductSiteState = {
  actionStatus: 200 | 401 | 429
  catalogInterference: "none" | "dynamic-overlay"
  requests: Array<{ path: string; status: number; at: string }>
}

/** 受控页面只提供通用浏览器事实；任务语义仍由自然语言需求和真实探索产生。 */
export async function startMinimumProductSite(port = 0) {
  const state: MinimumProductSiteState = { actionStatus: 200, catalogInterference: "none", requests: [] }
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/action") return actionPage(state, response)
    if (url.pathname === "/catalog") return catalogPage(state, response)
    state.requests.push({ path: url.pathname, status: 404, at: new Date().toISOString() })
    response.writeHead(404, headers); response.end(page("Not found", "The requested local page does not exist."))
  })
  const base = await new Promise<string>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") return reject(new Error("controlled_site_address_missing"))
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
  return { base, state, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }

function actionPage(state: MinimumProductSiteState, response: ServerResponse) {
  state.requests.push({ path: "/action", status: state.actionStatus, at: new Date().toISOString() })
  if (state.actionStatus === 401) {
    response.writeHead(401, headers)
    response.end(page("Sign in required", "Please sign in in this browser, then continue the same run.")); return
  }
  if (state.actionStatus === 429) {
    response.writeHead(429, { ...headers, "retry-after": "60" })
    response.end(page("Please wait", "This source is temporarily rate limited.")); return
  }
  response.writeHead(200, headers)
  response.end(page("Ready to run", "The fixed operation is ready.", "run-ready"))
}

function catalogPage(state: MinimumProductSiteState, response: ServerResponse) {
  state.requests.push({ path: "/catalog", status: 200, at: new Date().toISOString() })
  response.writeHead(200, headers)
  const dynamicOverlay = state.catalogInterference === "dynamic-overlay"
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local catalog</title></head>
    <body><main><h1>Catalog lookup</h1><section><form id="lookup"><label for="keyword">Keyword</label>
    <input id="keyword" name="keyword" autocomplete="off"><button type="submit">Look up</button></form></section>
    <section aria-live="polite"><h2>Lookup result</h2><p id="result">Enter a keyword.</p></section></main>
    <div id="notice" role="dialog" aria-modal="true" hidden style="position:fixed;inset:0;z-index:50;background:#111e;color:#fff;padding:25vh 20vw">
      <p>New page notice. Continue to use the lookup.</p><button id="notice-continue" type="button">Continue</button></div>
    <script>const input=document.querySelector('#keyword'),notice=document.querySelector('#notice');
    document.querySelector('#lookup').addEventListener('submit',(event)=>{event.preventDefault();
    const value=input.value.trim();document.querySelector('#result').textContent='Catalog result for '+value;});
    document.querySelector('#notice-continue').addEventListener('click',()=>{notice.hidden=true;});
    ${dynamicOverlay ? "input.addEventListener('input',()=>{notice.hidden=input.value.trim()!=='alpha';});" : ""}</script>
    </body></html>`)
}

function page(title: string, body: string, marker?: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
    <body><main><h1${marker ? ` data-purpose="${marker}"` : ""}>${title}</h1><p>${body}</p></main></body></html>`
}
