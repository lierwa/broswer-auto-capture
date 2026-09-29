import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { test } from "node:test"
import { openModelBridge, type ModelAudit } from "../src/upstream-browser/model-bridge.js"
import { modelReport } from "../src/upstream-browser/service.js"
import { hybridArtifactSchema } from "../src/upstream-browser/hybrid-artifact.js"

const selection = { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "medium" as const }
type Subject = Parameters<typeof openModelBridge>[0]["subject"]
const usage = { inputTokens: 3, outputTokens: 2, totalTokens: 5, reported: true }

test("模型失败审计保留 allowlisted code、固定类别和调用关联", () => {
  const requestId = randomUUID()
  const report = modelReport({ requestId, purpose: "agent", event: {
    type: "generation.failed", invocationId: "fixture-invocation", sequence: 2, createdAt: 1,
    code: "ai_structured_output_invalid",
  } } as ModelAudit, "fixture-model", new Map([[requestId, "2026-09-29T00:00:00.000Z"]]))
  assert.deepEqual(report, { callId: requestId, purpose: "agent", model: "fixture-model",
    intendedAt: "2026-09-29T00:00:00.000Z", status: "failed", reportedInvocations: 1,
    failureCategory: "ai_event_failure", failureCode: "ai_structured_output_invalid" })
  const legacy = { ...report, failureCategory: undefined, failureCode: undefined }
  assert.equal(hybridArtifactSchema.shape.modelCalls.parse([legacy, report]).length, 2)
})

// 不变量：固定 browser-use 版本必须通过 BrowserProfile 持有 B-A-T 指定目录，不能退回临时 profile。
test("上游浏览器适配器保留持久 profile 所有权和运行边界",
  { skip: !process.env.BAT_UPSTREAM_PYTHON && "requires the pinned BAT_UPSTREAM_PYTHON environment" }, async () => {
  const root = process.cwd(), profilePath = await mkdtemp(path.join(tmpdir(), "bat-owned-profile-"))
  try {
    const result = await python(root, `
import json,sys
from pathlib import Path
from browser_use_runner.hybrid_main import owned_browser
raw=json.load(sys.stdin)
expected=Path(raw['profilePath']).resolve()
browser=owned_browser(expected,headless=True,allowed_domains=['example.com'])
assert Path(browser.browser_profile.user_data_dir).resolve()==expected
assert browser.browser_profile.headless is True
assert browser.browser_profile.allowed_domains==['example.com']
assert browser.browser_profile.enable_default_extensions is False
assert browser.browser_profile.keep_alive is False
assert browser.browser_profile.executable_path is None
`, { profilePath })
    assert.equal(result.code, 0, result.stderr)
  } finally { await rm(profilePath, { recursive: true, force: true }) }
})

// 不变量：真实 Python 调用形状经独立 HTTP 通道保留消息、图像、schema、usage 和用途；正文不能进审计。
test("Python 上游模型桥保留六种用途和多模态请求，stdout 不污染协议",
  { skip: !process.env.BAT_UPSTREAM_PYTHON && "requires the pinned BAT_UPSTREAM_PYTHON environment" }, async () => {
  const calls: any[] = [], audits: ModelAudit[] = []
  const invoke = async (input: any) => {
    calls.push(input)
    const base = { invocationId: randomUUID(), sequence: 0, createdAt: Date.now() }
    input.onEvent({ ...base, type: "text.delta", text: "private fixture content" })
    input.onEvent({ ...base, sequence: 1, type: "generation.completed", usage, providerId: "fixture", modelId: "fixture" })
    return { text: "fixture", object: input.schema?.parse({ label: "fixture" }), usage, model: selection }
  }
  const subject = { verifyCapabilities: async () => ({}), generate: invoke, generateObject: invoke } as Subject
  const bridge = await openModelBridge({ subject, selection, signal: new AbortController().signal, onAudit: (audit) => audits.push(audit) })
  try {
    const root = process.cwd()
    const result = await python(root, `
import asyncio,json,sys
from pydantic import BaseModel
from browser_use_runner.ai_connect import AIConnectModel
from browser_use_runner.ai_connect import wire_part
from browser_use.llm import SystemMessage,UserMessage,AssistantMessage
from browser_use.llm.messages import ContentPartTextParam,ContentPartImageParam,ImageURL
class Output(BaseModel):
    label: str
config=json.load(sys.stdin)
assert wire_part(ContentPartImageParam(image_url=ImageURL(url='data:image/jpeg;base64,aGVsbG8=')))['mediaType']=='image/jpeg'
async def run():
    for purpose in ['agent','judge','workflow_generation','variable_suggestion','extract','output_conversion']:
        model=AIConnectModel(model='fixture',purpose=purpose,**config)
        messages=[SystemMessage(content='system'),UserMessage(content='first'),AssistantMessage(content='prior'),
            UserMessage(content=[ContentPartTextParam(text='last'),ContentPartImageParam(image_url=ImageURL(url='data:image/png;base64,aGVsbG8='))])]
        response=await model.ainvoke('extract this' if purpose=='extract' else messages, None if purpose=='extract' else Output, session_id='fixture-session')
        assert response.usage.total_tokens==5
        assert response.content=='fixture' if purpose=='extract' else response.completion.label=='fixture'
    print('upstream arbitrary stdout')
asyncio.run(run())
`, { endpoint: bridge.url, token: bridge.token })
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /upstream arbitrary stdout/)
    assert.equal(calls.length, 6)
    assert.equal(calls[0].system, "system")
    assert.deepEqual(calls[0].messages.map((message: any) => message.role), ["user", "assistant", "user"])
    assert.equal(calls[0].messages[2].content[1].data, "aGVsbG8=")
    assert.equal(calls[0].schema.jsonSchema.properties.label.type, "string")
    assert.deepEqual(calls[4].messages, [{ role: "user", content: "extract this" }])
    assert.deepEqual(audits.map((audit) => audit.purpose), ["agent", "judge", "workflow_generation", "variable_suggestion", "extract", "output_conversion"])
    assert.ok(audits.every((audit) => audit.upstreamSessionId === "fixture-session"))
    assert.ok(!JSON.stringify(audits).includes("private fixture content"))
    assert.ok(!JSON.stringify(audits).includes(bridge.token))
  } finally { await bridge.close() }
})

// 不变量：上游正常返回不能覆盖已发生的产品取消；拒绝未授权、重复调用，避免重复计费。
test("模型普通返回之后取消仍返回 cancelled，重复 request id 不再次调用", async () => {
  const controller = new AbortController(); let count = 0
  const subject = { verifyCapabilities: async () => ({}), generate: async () => {
    count++; controller.abort(); return { text: "late success", object: undefined, usage, model: selection }
  }, generateObject: async () => { throw new Error("unexpected structured request") } } as Subject
  const bridge = await openModelBridge({ subject, selection, signal: controller.signal, onAudit() {} })
  const body = { id: randomUUID(), purpose: "agent", messages: [{ role: "user", content: "hello" }] }
  const request = (token: string) => fetch(bridge.url + "/invoke", { method: "POST", headers: {
    authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) })
  try {
    assert.equal((await request("wrong")).status, 401)
    assert.deepEqual(await (await request(bridge.token)).json(), { error: "bridge_cancelled" })
    assert.deepEqual(await (await request(bridge.token)).json(), { error: "bridge_duplicate_request" })
    assert.equal(count, 1)
  } finally { await bridge.close() }
})

// 不变量：Pydantic 的内部字段名不能泄漏回二次校验边界；ResultSpec 始终使用公共契约的 schema 别名。
test("上游 author 二次校验保留 ResultSpec schema 别名",
  { skip: !process.env.BAT_UPSTREAM_PYTHON && "requires the pinned BAT_UPSTREAM_PYTHON environment" }, async () => {
  const root = process.cwd()
  const result = await python(root, `
import asyncio,json,sys
from types import SimpleNamespace
import browser_use_runner.hybrid_main as hybrid
from workflow_use.hybrid.author import AuthorInput

raw=json.load(sys.stdin)
captured={}
async def author_step(_browser, source, _models, _output_model_for, diagnostic=None):
    captured.update(source)
    AuthorInput.model_validate(source)
    return {'resultSpecKeys': sorted(source['resultSpec'])}

async def run():
    hybrid.author_step=author_step
    runner=hybrid.Runner()
    runner.browser=SimpleNamespace(browser_profile=SimpleNamespace(keep_alive=False))
    result=await runner.handle(raw)
    assert 'schema' in result['resultSpecKeys']
    assert 'schemaValue' not in result['resultSpecKeys']
    assert 'schemaValue' not in captured['resultSpec']

asyncio.run(run())
`, {
    id: randomUUID(), type: "hybrid_author",
    model: { model: "fixture", endpoint: "http://127.0.0.1:12345", token: "fixture" },
    source: {
      task: "read records", input: {}, inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: { type: "object", properties: { items: { type: "array", items: { type: "string" } } },
        required: ["items"], additionalProperties: false },
      resultSpec: { contractVersion: "bat-result-spec/v1", mode: "data",
        schema: { type: "object", properties: { items: { type: "array", items: { type: "string" } } },
          required: ["items"], additionalProperties: false },
        fields: [{ path: ["items"], description: "visible records", producerRef: "visible-records" }], edgeCases: [] },
      requirementId: randomUUID(), requirementVersion: 1, requirementText: "read records", requirementDigest: "a".repeat(64),
      planId: randomUUID(), planVersion: 1, planDigest: "b".repeat(64), entryUrls: ["https://example.test/"],
      stepId: "read-records", callMode: "once", maxSteps: 10,
    },
  })
  assert.equal(result.code, 0, result.stderr)
})

async function python(root: string, script: string, input: unknown) {
  const executable = process.env.BAT_UPSTREAM_PYTHON
  assert.ok(executable, "BAT_UPSTREAM_PYTHON must select the verified upstream environment")
  const configDir = await mkdtemp(path.join(tmpdir(), "bat-model-bridge-"))
  try { return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, ["-c", script], { cwd: root, env: {
      PATH: process.env.PATH, LANG: "en_US.UTF-8", PYTHONPATH: [path.join(root, "vendor/workflow-use/workflows"),
        path.join(root, "apps/api/python")].join(path.delimiter),
      BROWSER_USE_CONFIG_DIR: configDir,
      ANONYMIZED_TELEMETRY: "false", BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false",
    }, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = "", stderr = ""
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("python_probe_timeout")) }, 30_000)
    child.stdout.on("data", (data) => { stdout += data }); child.stderr.on("data", (data) => { stderr += data })
    child.once("error", (error) => { clearTimeout(timer); reject(error) })
    child.once("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
    child.stdin.end(JSON.stringify(input))
  }) } finally { await rm(configDir, { recursive: true, force: true }) }
}
