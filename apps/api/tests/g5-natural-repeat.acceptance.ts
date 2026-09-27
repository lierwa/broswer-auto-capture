// 显式 G5 真实来源/编译/复跑样本；不在 *.test.ts 内，不创建正式任务或发布记录。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import { CONTRACT_VERSION, taskPlanSchema, type ValueSchema } from "@browser-capture/contracts"
import { compileTaskChain, digestJson, TaskChainRuntime } from "@browser-capture/runtime"
import { SHARED_AI_SUBJECT } from "../src/app.js"
import { withHybridAuthoring, recompileHybridSource } from "../src/upstream-browser/hybrid-exploration.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"

if (process.env.BAT_RUN_REAL_REPEAT !== "1") throw new Error("explicit_real_repeat_run_required")
const root = process.cwd(), url = "https://github.com/openai/openai-agents-js/releases"
const task = `从 ${url} 收集该仓库发布列表的所有版本标题和各自发布详情链接，沿列表的下一页直到结束，按发布详情链接去重。只读取，不登录、不下载、不修改。`
const schema: ValueSchema = { type: "object", properties: { releases: { type: "array", minItems: 1, maxItems: 1000,
  items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } },
    required: ["title", "url"], additionalProperties: false } } }, required: ["releases"], additionalProperties: false }
const plan = samplePlan(), step = plan.steps[0]!
const directory = await mkdtemp(path.join(tmpdir(), "bat-g5-real-repeat-"))
const save = async (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const database = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true, fileMustExist: true })
const row = database.prepare("SELECT selection FROM aiSettings WHERE subjectId = ?").get(SHARED_AI_SUBJECT) as { selection: string }
database.close()
const selection = parseModelSelection(JSON.parse(row.selection))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const subject = ai.forSubject(SHARED_AI_SUBJECT), signal = AbortSignal.timeout(240_000)
process.env.BAT_UPSTREAM_BROWSER_HEADLESS = "true"
await save("sample-plan.json", plan)
console.log(JSON.stringify({ stage: "start", url, directory, modelId: selection.modelId }))
let receiptWrite: Promise<void> | undefined
try {
  const source = await withHybridAuthoring({ root, directory, subject, selection, signal,
    allowedOrigins: [new URL(url).origin], ownerId: randomUUID(),
    onProgress: (event) => { if (event.status === "completed" && "phase" in event && event.phase === "after_step"
      && "actionName" in event && event.actionName) {
      console.log(JSON.stringify({ stage: "action", action: event.actionName }))
    } } },
  (session) => session.author({ task, input: null, inputSchema: { type: "null" }, outputSchema: schema,
    resultSpec: step.resultSpec!, requirementId: plan.requirement.id, requirementVersion: 1,
    requirementText: task, requirementDigest: plan.requirement.digest, planId: plan.id, planVersion: 1,
    planDigest: digestJson(plan), stepId: step.id, callMode: "once", entryUrls: [url], maxSteps: 18 },
  { onSource: (receipt) => { receiptWrite = save("source-receipt.json", receipt) } }))
  await receiptWrite
  await save("source-result.json", source)
  console.log(JSON.stringify({ stage: "source", success: source.sourceSuccess, gaps: source.sourceGaps,
    commands: source.browserCommands, modelCalls: source.modelCalls.filter((call) => call.status === "completed").length }))
  assert.equal(source.sourceSuccess, true, "real_source_not_completed")
  assert.equal(source.sourceGaps.length, 0, "real_source_has_gaps")
  const compiled = await recompileHybridSource({ root, signal, canonicalRequest: source.canonicalRequest,
    outputSchema: schema, sourceGaps: source.sourceGaps, verifiedChildren: [] })
  await save("compilation.json", compiled)
  assert.equal(compiled.response.compilation.gaps.length, 0, "real_compilation_has_gaps")
  const chain = materializeHybridChain({ response: compiled.response, request: source.request, plan, step,
    version: 1, model: selection.modelId })
  compileTaskChain(chain)
  assert.ok(chain.nodes.some((node) => node.kind === "loop"), "real_repeat_loop_missing")
  await save("chain.json", chain)
  const browser = new PythonUpstreamBrowserRuntime({ root, directory, subject })
  const run = await browser.withCapabilities({ signal: AbortSignal.timeout(330_000), ownerId: randomUUID(), headless: true,
    allowedOrigins: [new URL(url).origin] }, (capabilities) => new TaskChainRuntime().execute({ chain,
    request: requestFor(chain, null), capabilities: { ...capabilities, persist: (value) => save("latest-run.json", value) } }))
  await save("run.json", run)
  console.log(JSON.stringify({ stage: "replay", status: run.status, outcome: run.outcome,
    modelCalls: run.modelCalls.length, consumed: run.consumed, outputCount: run.outputs.length }))
  assert.equal(run.status, "completed", "real_replay_failed")
  assert.equal(run.modelCalls.length, 0, "ordinary_replay_model_call")
  const compilation = compiled.response.compilation
  assert.ok(compilation.compilerVersion === "bat-hybrid/2", "natural_compilation_required")
  const repeat = compilation.repeatMethods?.[0]
  assert.ok(repeat, "real_repeat_method_missing")
  const advances = run.events.filter((event) => event.nodeId === repeat.advanceSegmentId
    && event.status === "finished" && event.outcome === "success").length
  assert.ok(advances > 0, "real_replay_did_not_advance")
  console.log(JSON.stringify({ stage: "pagination", advances, pages: advances + 1 }))
} catch (error) {
  await receiptWrite
  await save("failure.json", { error: error instanceof Error ? error.message : "unknown" })
  console.error(JSON.stringify({ stage: "failed", directory, error: error instanceof Error ? error.message : "unknown" }))
  process.exitCode = 1
}

function samplePlan() {
  const contract = (id: string, value: ValueSchema) => ({ id, version: 1, dialect: "bat-value-schema/v1", schema: value })
  const inputContract = contract("input", { type: "null" }), outputContract = contract("output", schema)
  const budget = { maxTransitions: 1000, maxBrowserCommands: 240, maxActiveMs: 300_000,
    maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 }
  const completion = [{ id: "collected", description: "沿可用翻页路径结束并返回发布列表", predicate: {
    operator: "exists", value: { source: "node", nodeId: "collect", path: [] } } }]
  return taskPlanSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "plan", id: randomUUID(), taskId: randomUUID(),
    version: 1, requirement: { id: randomUUID(), version: 1, revision: 1, digest: digestJson(task) }, summary: task,
    inputContract, outputContract, steps: [{ id: "collect", title: "收集公开发布列表", goal: task, dependsOn: [],
      inputContract, outputContract, input: { source: "input", path: [] }, invocation: { mode: "once" },
      chain: { id: randomUUID(), version: 1 }, budget, completion, risks: [],
      resultSpec: { contractVersion: "bat-result-spec/v1", mode: "data", schema,
        fields: [{ path: ["releases"], description: "完整发布列表，含标题与发布详情链接", producerRef: "releases" }],
        derivations: [], edgeCases: [] } }], output: { source: "node", nodeId: "collect", path: [] }, budget,
    completion, evidence: [], authorizationScope: "公开发布列表只读；G5隔离样本" })
}
