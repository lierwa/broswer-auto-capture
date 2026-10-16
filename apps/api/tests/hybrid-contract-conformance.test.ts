import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { resultSpecSchema } from "@browser-capture/contracts"
import { hybridStartRequestSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { browserAllowedSites, isWithinBrowserSites } from "../src/upstream-browser/site-scope.js"
import { projectRoot } from "./helpers.js"
import { validateHybridResponse } from "../src/upstream-browser/hybrid-response.js"
import { naturalPayloadContext } from "../src/upstream-browser/hybrid-natural-payload.js"
import { materializeHybridNodes } from "../src/upstream-browser/hybrid-materializer-nodes.js"
import { assertNaturalBinding } from "../src/upstream-browser/hybrid-natural-materialization.js"

const python = path.join(projectRoot, "work/upstream-browser-hybrid/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
const pythonPath = [path.join(projectRoot, "vendor/workflow-use/workflows"),
  path.join(projectRoot, "vendor/workflow-use/workflows/tests"), path.join(projectRoot, "apps/api/tests"),
  path.join(projectRoot, "apps/api/python")].join(path.delimiter)

function pythonAccepts(value: unknown) {
  const source = [
    "import json, sys",
    "from workflow_use.hybrid.request import DataResultSpec",
    "try:",
    " DataResultSpec.model_validate(json.load(sys.stdin))",
    " print('accepted')",
    "except Exception:",
    " print('rejected')",
  ].join("\n")
  return execFileSync(python, ["-c", source], { cwd: projectRoot, input: JSON.stringify(value),
    encoding: "utf8", env: { PATH: process.env.PATH, PYTHONPATH: pythonPath,
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" } }).trim()
}

function pythonStartAccepts(value: unknown) {
  const source = [
    "import json, sys",
    "from browser_use_runner.hybrid_main import StartConfig",
    "try:",
    " StartConfig.model_validate(json.load(sys.stdin))",
    " print('accepted')",
    "except Exception:",
    " print('rejected')",
  ].join("\n")
  return execFileSync(python, ["-c", source], { cwd: projectRoot, input: JSON.stringify(value),
    encoding: "utf8", env: { PATH: process.env.PATH, PYTHONPATH: pythonPath,
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" } }).trim()
}

function pythonAdapterProbe(value: unknown) {
  const source = [
    "import asyncio, json, sys",
    "from types import SimpleNamespace",
    "from browser_use_runner.hybrid_main import allowed_domain_patterns, allowed_url, reset_automation_tabs",
    "raw=json.load(sys.stdin)",
    "sites=raw['sites']",
    "class Page:",
    " def __init__(self): self.urls=[]",
    " async def goto(self, url): self.urls.append(url)",
    "class Browser:",
    " def __init__(self):",
    "  self.agent_focus_target_id='owned'; self.page=Page(); self.closed=[]",
    "  self.tabs=[SimpleNamespace(target_id=value) for value in ['stale-a','owned','stale-b']]",
    " async def get_tabs(self): return self.tabs",
    " async def get_current_page(self): return self.page",
    " async def close_page(self, target_id): self.closed.append(target_id)",
    "async def run():",
    " browser=Browser()",
    " await reset_automation_tabs(browser)",
    " return {'patterns': allowed_domain_patterns(sites),",
    "  'allowed': [allowed_url(url, sites) for url in raw['urls']],",
    "  'closed': browser.closed, 'navigated': browser.page.urls}",
    "print(json.dumps(asyncio.run(run()), sort_keys=True))",
  ].join("\n")
  return JSON.parse(execFileSync(python, ["-c", source], { cwd: projectRoot, input: JSON.stringify(value),
    encoding: "utf8", env: { PATH: process.env.PATH, PYTHONPATH: pythonPath,
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" } }).trim()) as {
        patterns: string[]; allowed: boolean[]; closed: string[]; navigated: string[]
      }
}

function spec(key: string) {
  return { contractVersion: "bat-result-spec/v1", mode: "data", schema: {
    type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false,
  }, fields: [{ path: ["value"], description: "业务结果", producerRef: key }], derivations: [],
  edgeCases: [{ description: "无结果", controlRef: key }] }
}

test("TS 公共 TaskKey 与 Python 编译适配器接受同一合法边界", () => {
  for (const key of ["catalogResultText", `a${"B".repeat(63)}`]) {
    const value = resultSpecSchema.parse(spec(key))
    assert.equal(pythonAccepts(value), "accepted")
  }
})

test("Python 文件来源编译在 TS 独立复核并物化为本次生成者的参数绑定", () => {
  const source = ["import json", "from test_browser_context_contract import native_file_source",
    "from workflow_use.hybrid.__main__ import compilation_response", "request,registry=native_file_source()",
    "print(json.dumps({'request':request.model_dump(mode='json',by_alias=True),",
    " 'response':compilation_response(request,registry,output_schema={'type':'null'})}))"].join("\n")
  const fixture = JSON.parse(execFileSync(python, ["-c", source], { cwd: projectRoot, encoding: "utf8",
    env: { PATH: process.env.PATH, PYTHONPATH: pythonPath, PYTHONDONTWRITEBYTECODE: "1",
      ANONYMIZED_TELEMETRY: "false", BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" } }))
  const response = validateHybridResponse(fixture.response)
  assert.equal(response.compilation.compilerVersion, "bat-hybrid/3")
  assert.deepEqual(response.compilation.gaps, [])
  const payload = naturalPayloadContext(response, fixture.request)
  const nodes = materializeHybridNodes({ compilation: response.compilation,
    context: { version: 2, request: payload.ordinary, payload }, model: "unused", runtimeScopes: new Map(), repeats: [] }).nodes
  const read = nodes.find(item => item.id === "s-a-0002")
  assert.ok(read?.kind === "capability")
  assert.deepEqual(read.input.file_name, { source: "input", path: ["name"] })
  assert.equal(JSON.stringify(nodes).includes("/source-owner"), false)
  const segment = response.compilation.segments.find(item => item.id === "s-a-0002")!
  assert.ok(segment.kind === "deterministic")
  assert.throws(() => assertNaturalBinding({ ...segment.bindings[0], binding: {
    source: "constant", value: "/source-owner/note.txt" } }, payload.ordinary.trace, payload), /native_file_binding_mismatch/)
  const input = payload.ordinary.trace.observations.flatMap(item => item.facts).find(item => item.kind === "native_file_input")!
  assert.ok(input.value && typeof input.value === "object" && !Array.isArray(input.value))
  input.value.contentDigest = "e".repeat(64)
  assert.throws(() => assertNaturalBinding(segment.bindings[0], payload.ordinary.trace, payload), /evidence|fact|digest|source/)
})

test("文件生成者的未派发写入须跨语言严格证明且不得借错路径", () => {
  const source = ["import json", "from types import SimpleNamespace",
    "from test_browser_context_contract import native_file_source",
    "from test_natural_read_liveness import sequence_stopped_fixture",
    "from workflow_use.hybrid.evidence import digest", "from workflow_use.hybrid.source_response import canonical_json",
    "from workflow_use.hybrid.natural_prefix import compile_natural_prefix",
    "from workflow_use.hybrid.natural_binding_compile import natural_bindings",
    "from workflow_use.hybrid.__main__ import compilation_response",
    "request,registry=native_file_source()", "producer=compile_natural_prefix(request,registry,output_schema={'type':'null'}).segments[0]",
    "stopped,_,_=sequence_stopped_fixture()", "tail=stopped.actions[4]",
    "tail.name='write_file';tail.args={'file_name':'note.txt','content':'not entered'}",
    "dispatch=next(f for o in stopped.observations for f in o.facts if f.kind=='native_action_dispatch' and f.value['actionRef']==tail.id)",
    "dispatch.value['actionName']=tail.name;dispatch.sourceRefs[0].digest=digest(dispatch.value)",
    "body=request.model_dump(mode='json',by_alias=True)", "template=body['trace']['actions'][1]",
    "extra=[{**template,**vars(item),'args':getattr(item,'args',{}),'resultRef':item.resultRef.model_dump(mode='json') if item.resultRef else None} for item in stopped.actions[2:5]]",
    "body['trace']['actions']=[body['trace']['actions'][0],*extra,body['trace']['actions'][1]]",
    "body['trace']['actions'][-1]['stepIndex']=3",
    "ids={a['id']:f'a-{i+1:04d}' for i,a in enumerate(body['trace']['actions'])}",
    "for a in body['trace']['actions']:a['id']=ids[a['id']]",
    "body['trace']['completed']=False;body['trace']['finalResultRef']=None",
    "base=body['trace']['observations'][0]",
    "body['trace']['observations']=body['trace']['observations'][:4]+[{**base,**vars(o),'facts':[f.model_dump(mode='json') for f in o.facts],'sourceRefs':base['sourceRefs']} for o in stopped.observations]",
    "mapping={o['id']:f'o-{i+1:04d}' for i,o in enumerate(body['trace']['observations'])}",
    "for i,o in enumerate(body['trace']['observations']):o['sequence']=i;o['id']=mapping[o['id']]",
    "for a in body['trace']['actions']:",
    " for key in ('preObservationRef','postObservationRef'):a[key]=mapping.get(a[key],a[key])",
    "for o in body['trace']['observations']:",
    " for f in o['facts']:",
    "  if isinstance(f['value'],dict):",
    "   for key in ('actionRef','causeActionRef'):",
    "    if key in f['value']:f['value'][key]=ids.get(f['value'][key],f['value'][key])",
    "   for ref in f['sourceRefs']:ref['digest']=digest(f['value'])",
    "body['trace']['digest']=digest({k:v for k,v in body['trace'].items() if k!='digest'})",
    "parsed=type(request).model_validate(body)",
    "binding,issues=natural_bindings(parsed,parsed.trace.actions[-1],parsed.trace.observations[2],False,[producer])",
    "assert not issues", "print(json.dumps({'request':body,'response':compilation_response(parsed,registry,output_schema={'type':'null'}),'decision':binding[0]}))"].join("\n")
  const fixture = JSON.parse(execFileSync(python, ["-c", source], { cwd: projectRoot, encoding: "utf8",
    env: { PATH: process.env.PATH, PYTHONPATH: pythonPath, PYTHONDONTWRITEBYTECODE: "1",
      ANONYMIZED_TELEMETRY: "false", BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" } }))
  const payload = naturalPayloadContext(validateHybridResponse(fixture.response), fixture.request)
  const verify = () => assertNaturalBinding(fixture.decision, payload.ordinary.trace, payload)
  assert.deepEqual(verify(), { source: "input", path: ["name"] })
  const input = payload.ordinary.trace.observations[2]!.facts.find(item => item.kind === "native_file_input")!
  const action = payload.ordinary.trace.actions.at(-1)!
  assert.ok(action.args && typeof action.args === "object" && !Array.isArray(action.args))
  action.args = { file_name: "/source-owner/different.txt" }
  assert.throws(verify, /native_file_input_mismatch/)
  assert.ok(input.value && typeof input.value === "object" && !Array.isArray(input.value))
})

test("TS 公共 TaskKey 与 Python 编译适配器共同拒绝保留键", () => {
  const value = spec("constructor")
  assert.equal(resultSpecSchema.safeParse(value).success, false)
  assert.equal(pythonAccepts(value), "rejected")
})

// 不变量：浏览器二进制由 browser-use 发现；产品协议只拥有持久 profile，不允许配置触发上游临时副本。
test("TS 与 Python 启动合同共同拒绝浏览器二进制覆盖", () => {
  const allowedSites = browserAllowedSites(["https://example.com"])
  const config = { headless: true, profilePath: path.join(projectRoot, "work", "contract-profile"),
    allowedOrigins: ["https://example.com"], allowedSites }
  assert.equal(hybridStartRequestSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111",
    type: "hybrid_start", config }).success, true)
  assert.equal(pythonStartAccepts(config), "accepted")
  const overridden = { ...config, executablePath: "C:\\browser\\chrome.exe" }
  assert.equal(hybridStartRequestSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111",
    type: "hybrid_start", config: overridden }).success, false)
  assert.equal(pythonStartAccepts(overridden), "rejected")
})

// 不变量：确认的是站点来源；第一方搜索/内容子域可用，跨站、协议降级和遗留页面不可进入新会话。
test("TS 与 Python 使用同一第一方站点边界并隔离遗留页面", () => {
  const origins = ["https://www.bilibili.com"]
  const sites = browserAllowedSites(origins)
  assert.deepEqual(sites, [{ scheme: "https", domain: "bilibili.com", port: null, includeSubdomains: true }])
  const urls = ["https://www.bilibili.com/", "https://search.bilibili.com/all?keyword=x",
    "https://bilibili.com.evil.example/", "http://search.bilibili.com/", "https://example.com/"]
  assert.deepEqual(urls.map((url) => isWithinBrowserSites(url, origins)), [true, true, false, false, false])
  const probe = pythonAdapterProbe({ sites, urls })
  assert.deepEqual(probe.allowed, [true, true, false, false, false])
  // WHY：已授权的裸 origin 与带路径地址都必须进入上游 glob；结构化范围仍拒绝跨站与降级。
  assert.deepEqual(probe.patterns, ["https://bilibili.com", "https://bilibili.com/*",
    "https://*.bilibili.com", "https://*.bilibili.com/*"])
  assert.deepEqual(probe.closed, ["stale-a", "stale-b"])
  assert.deepEqual(probe.navigated, ["about:blank"])
})
