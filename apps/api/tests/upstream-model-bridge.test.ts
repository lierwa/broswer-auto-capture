import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { test } from "node:test"
import { openModelBridge, type ModelAudit } from "../src/upstream-browser/model-bridge.js"

const selection = { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "medium" as const }
type Subject = Parameters<typeof openModelBridge>[0]["subject"]
const usage = { inputTokens: 3, outputTokens: 2, totalTokens: 5, reported: true }

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

async function python(root: string, script: string, input: unknown) {
  const executable = process.env.BAT_UPSTREAM_PYTHON
  assert.ok(executable, "BAT_UPSTREAM_PYTHON must select the verified upstream environment")
  const configDir = await mkdtemp(path.join(tmpdir(), "bat-model-bridge-"))
  try { return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, ["-c", script], { cwd: root, env: {
      PATH: process.env.PATH, LANG: "en_US.UTF-8", PYTHONPATH: path.join(root, "apps/api/python"),
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
