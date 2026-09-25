import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { resultSpecSchema } from "@browser-capture/contracts"
import { hybridStartRequestSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { browserAllowedSites, isWithinBrowserSites } from "../src/upstream-browser/site-scope.js"
import { projectRoot } from "./helpers.js"

const python = path.join(projectRoot, "work/upstream-browser-hybrid/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
const pythonPath = [path.join(projectRoot, "vendor/workflow-use/workflows"),
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
  assert.deepEqual(probe.patterns, ["https://bilibili.com/*", "https://*.bilibili.com/*"])
  assert.deepEqual(probe.closed, ["stale-a", "stale-b"])
  assert.deepEqual(probe.navigated, ["about:blank"])
})
