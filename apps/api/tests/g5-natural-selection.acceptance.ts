// 显式 G5 真实动态选择；独立来源和持久化，不创建正式任务或修改网页。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
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
import { describeValue } from "../src/upstream-browser/task-request.js"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"

if (process.env.BAT_RUN_REAL_SELECTION !== "1") throw new Error("explicit_real_selection_run_required")
const root = process.cwd(), url = "https://github.com/openai/openai-agents-js/releases"
const basic = process.env.BAT_SELECTION_CASE === "first_patch"
const task = "打开输入 url 指定的 GitHub 发布列表当前页，在当前页全部发布条目中，"
  + (basic ? "选择网页正文顺序中第一条标题以 .1 结尾的发布条目，打开它的详情并停留。"
    : "选择版本号为 v数字.数字.数字且第三段大于0的条目中版本号最大的一个，打开它的发布详情并停留。版本号按三段整数比较；")
  + "不看下一页，不使用侧边跳转菜单替代正文发布列表。只读，不登录、不下载、不修改。"
const inputSchema: ValueSchema = { type: "object", properties: { url: { type: "string" } },
  required: ["url"], additionalProperties: false }
const schema: ValueSchema = { type: "null" }
const directory = process.env.BAT_SELECTION_DIRECTORY ?? await mkdtemp(path.join(tmpdir(), "bat-g5-real-selection-"))
const outputDirectory = process.env.BAT_SELECTION_DIRECTORY ? await mkdtemp(path.join(directory, "retry-")) : directory
const save = async (name: string, value: unknown) => writeFile(path.join(outputDirectory, name), JSON.stringify(value, null, 2))
const plan = process.env.BAT_SELECTION_DIRECTORY
  ? taskPlanSchema.parse(JSON.parse(await readFile(path.join(directory, "sample-plan.json"), "utf8"))) : samplePlan()
const step = plan.steps[0]!
const database = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true, fileMustExist: true })
const row = database.prepare("SELECT selection FROM aiSettings WHERE subjectId = ?").get(SHARED_AI_SUBJECT) as { selection: string }
database.close()
const selection = parseModelSelection(JSON.parse(row.selection))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const subject = ai.forSubject(SHARED_AI_SUBJECT)
process.env.BAT_UPSTREAM_BROWSER_HEADLESS = "true"
await save("sample-plan.json", plan)
console.log(JSON.stringify({ stage: "start", url, directory: outputDirectory, sourceDirectory: directory,
  reusedSource: Boolean(process.env.BAT_SELECTION_DIRECTORY), case: basic ? "first_patch" : "version_order", modelId: selection.modelId }))
let receiptWrite: Promise<void> | undefined
try {
  const source = process.env.BAT_SELECTION_DIRECTORY
    ? JSON.parse(await readFile(path.join(directory, "source-result.json"), "utf8"))
    : await withHybridAuthoring({ root, directory, subject, selection, signal: AbortSignal.timeout(240_000),
      allowedOrigins: [new URL(url).origin], ownerId: randomUUID(), onProgress: (event) => {
        if (event.status === "completed" && "phase" in event && event.phase === "after_step" && "actionName" in event) {
          console.log(JSON.stringify({ stage: "action", action: event.actionName }))
        }
      } }, (session) => session.author({ task: [task, "【预执行入口】", url, "【本次真实输入】",
        ...describeValue({ url }, "输入"), "复跑时输入.url 可变化，按本次输入页面的候选重新选择。"].join("\n"),
      input: { url }, inputSchema, outputSchema: schema,
      resultSpec: step.resultSpec!, requirementId: plan.requirement.id, requirementVersion: 1,
      requirementText: task, requirementDigest: plan.requirement.digest, planId: plan.id, planVersion: 1,
      planDigest: digestJson(plan), stepId: step.id, callMode: "once", entryUrls: [url], maxSteps: 14 },
      { onSource: (receipt) => { receiptWrite = save("source-receipt.json", receipt) } }))
  await receiptWrite
  if (!process.env.BAT_SELECTION_DIRECTORY) await save("source-result.json", source)
  console.log(JSON.stringify({ stage: "source", success: source.sourceSuccess, gaps: source.sourceGaps,
    commands: source.browserCommands, modelCalls: source.modelCalls.filter((call: { status: string }) => call.status === "completed").length }))
  assert.equal(source.sourceSuccess, true, "real_source_not_completed")
  assert.equal(source.sourceGaps.length, 0, "real_source_has_gaps")
  const compiled = await recompileHybridSource({ root, signal: AbortSignal.timeout(60_000),
    canonicalRequest: source.canonicalRequest, outputSchema: schema, sourceGaps: source.sourceGaps, verifiedChildren: [] })
  await save("compilation.json", compiled)
  assert.equal(compiled.response.compilation.gaps.length, 0, "real_compilation_has_gaps")
  const chain = materializeHybridChain({ response: compiled.response, request: source.request, plan, step,
    version: 1, model: selection.modelId })
  compileTaskChain(chain)
  const selector = chain.nodes.find((node) => node.kind === "function")
  assert.ok(selector, "natural_dynamic_selection_function_missing")
  assert.ok(chain.nodes.some((node) => node.kind === "capability" && node.input.url?.source === "input"),
    "runtime_url_binding_missing")
  await save("chain.json", chain)
  const browser = new PythonUpstreamBrowserRuntime({ root, directory: outputDirectory, subject })
  const replayUrls = process.env.BAT_SELECTION_FIRST_PAGE_ONLY === "1" ? [url] : [url, `${url}?page=2`]
  for (const [index, inputUrl] of replayUrls.entries()) {
    const run = await browser.withCapabilities({ signal: AbortSignal.timeout(90_000), ownerId: randomUUID(),
      headless: true, allowedOrigins: [new URL(url).origin] }, (capabilities) => new TaskChainRuntime().execute({ chain,
      request: requestFor(chain, { url: inputUrl }, "replay", randomUUID(), randomUUID()),
      capabilities: { ...capabilities, persist: async (value) => {
        await save(`latest-run-${index + 1}.json`, value)
        if (value.checkpoint?.browser) await save(`browser-receipt-${index + 1}.json`, value.checkpoint)
      } } }))
    await save(`run-${index + 1}.json`, run)
    console.log(JSON.stringify({ stage: "replay", inputUrl, status: run.status, outcome: run.outcome,
      modelCalls: run.modelCalls.length, consumed: run.consumed }))
    assert.equal(run.status, "completed", "real_selection_replay_failed")
    assert.equal(run.modelCalls.length, 0, "ordinary_replay_model_call")
    assert.ok(run.events.some((event) => event.nodeId === selector.id && event.status === "finished"
      && event.outcome === "success"), "selection_not_executed")
  }
} catch (error) {
  await receiptWrite
  await save(`failure-${Date.now()}.json`, { error: error instanceof Error ? error.message : "unknown" })
  console.error(JSON.stringify({ stage: "failed", directory: outputDirectory, error: error instanceof Error ? error.message : "unknown" }))
  process.exitCode = 1
}

function samplePlan() {
  const contract = (id: string, value: ValueSchema) => ({ id, version: 1, dialect: "bat-value-schema/v1", schema: value })
  const inputContract = contract("input", inputSchema), outputContract = contract("output", schema)
  const budget = { maxTransitions: 60, maxBrowserCommands: 30, maxActiveMs: 90_000,
    maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 }
  const completion = [{ id: "opened", description: "按当前集合的规则打开对应详情", predicate: {
    operator: "exists", value: { source: "node", nodeId: "select", path: [] } } }]
  return taskPlanSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "plan", id: randomUUID(), taskId: randomUUID(),
    version: 1, requirement: { id: randomUUID(), version: 1, revision: 1, digest: digestJson(task) }, summary: task,
    inputContract, outputContract, steps: [{ id: "select", title: "选择当前列表的补丁版本", goal: task, dependsOn: [],
      inputContract, outputContract, input: { source: "input", path: [] }, invocation: { mode: "once" },
      chain: { id: randomUUID(), version: 1 }, budget, completion, risks: [],
      resultSpec: { contractVersion: "bat-result-spec/v1", mode: "execution" } }],
    output: { source: "node", nodeId: "select", path: [] }, budget, completion, evidence: [],
    authorizationScope: "公开列表与详情只读；G5隔离动态选择验证" })
}
