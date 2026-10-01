import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { taskRequirementSchema, type TaskAuthoringJob } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { TaskChainAuthoring } from "../src/task-chain/authoring.js"
import { projectPreparationPlan } from "../src/task-chain/preparation-plan-projection.js"
import { browserUseTask } from "../src/upstream-browser/task-request.js"
import { digestCanonicalJson } from "../src/upstream-browser/hybrid-materializer.js"
import { parseCapturedSource } from "../src/upstream-browser/hybrid-captured-source.js"
import type { HybridAuthorSession } from "../src/upstream-browser/hybrid-exploration.js"
import { jsonValueSchema } from "@browser-capture/contracts"

const entry = "https://example.org/"
const markdown = `# 目标
在已确认来源完成一次可重复的页面状态操作。

## 试做入口
1. ${entry}

## 运行输入
- 无

## 代表试做
从已确认入口观察页面，完成任务并验证结果。

## 结果与完成
- 交付：完成状态
- 页面交付：无需保留
页面到达用户要求的状态；不可访问时停止并说明。`

function requirement(body = markdown) {
  const id = randomUUID(), resolutionId = randomUUID()
  return taskRequirementSchema.parse({ contractVersion: "bat-task-chain/v1", kind: "requirement",
    id, taskId: randomUUID(), version: 1, revision: 1, goal: "完成页面状态操作", scope: "仅限已确认来源",
    definition: { format: "markdown", body }, inputContract: null, outputContract: null,
    constraints: [], completionCriteria: ["到达用户要求的状态"],
    authorization: { scope: "仅限本草案", risks: ["访问限制时停止"], requiredApprovals: ["启动前确认"] },
    confirmation: { confirmedAt: new Date().toISOString(), requestId: randomUUID() },
    confirmationFacts: { decisions: [], sources: [{ resolutionId, label: "示例来源", url: entry,
      origin: entry, domain: "example.org", provider: "user_provided", query: entry }],
      entries: [{ url: entry, resolutionId }], resultExpectation: "页面到达用户要求的状态", unresolvedItemCount: 0 },
  })
}

test("确认草案唯一投影计划与 B-U 指令，入口和版本摘要保持一致", () => {
  const draft = requirement(), plan = projectPreparationPlan(draft, 1)
  assert.deepEqual(plan.entryUrls, [entry])
  assert.equal(plan.requirement.digest, digestJson(draft))
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.steps[0]!.goal, "从已确认入口观察页面，完成任务并验证结果。")
  assert.equal(plan.steps[0]!.resultSpec?.mode, "execution")
  assert.equal(plan.browserHandoff, "close")
  const instruction = browserUseTask({ requirement: draft, plan, step: plan.steps[0]!, resolvedInput: null })
  assert.match(instruction, /已确认准备计划草案 v1/)
  assert.ok(instruction.includes(draft.definition.body))
  assert.doesNotMatch(instruction, /判定为.*输入存在/)
  assert.deepEqual(plan.steps[0]!.completion[0]?.predicate,
    { operator: "exists", value: { source: "constant", value: true } })
})

test("没有同版来源引用的深层入口及 B-U 交接漂移被拒绝", () => {
  const draft = requirement()
  draft.confirmationFacts!.entries![0]!.url = "https://example.org/other/content"
  assert.throws(() => projectPreparationPlan(draft, 1), /preparation_entry_reference_mismatch/)
  const valid = requirement(), plan = projectPreparationPlan(valid, 1)
  plan.entryUrls = ["https://example.org/other/content"]
  assert.throws(() => browserUseTask({ requirement: valid, plan, step: plan.steps[0]!, resolvedInput: null }),
    /preparation_draft_handoff_mismatch/)
  plan.entryUrls = [entry]; plan.browserHandoff = "keep_open"
  assert.throws(() => browserUseTask({ requirement: valid, plan, step: plan.steps[0]!, resolvedInput: null }),
    /preparation_draft_handoff_mismatch/)
})

test("同一可审阅草案的输入和数据字段投影为动态合同", () => {
  const body = markdown.replace("- 无", "- 查询词（文本）：每次执行可变的业务查询词")
    .replace("- 交付：完成状态", "- 交付：数据结果\n- 结果形状：单条记录\n- 字段：标题（文本）：现场读取的标题")
    .replace("- 页面交付：无需保留", "- 页面交付：保留现场")
  const plan = projectPreparationPlan(requirement(body), 1)
  assert.equal(plan.inputContract.schema.type, "object")
  assert.equal(plan.outputContract.schema.type, "object")
  assert.equal(plan.steps[0]!.resultSpec?.mode, "data")
  assert.equal(plan.browserHandoff, "keep_open")
})

test("同版草案把多项配对字段投影为记录列表及一个整体结果来源", () => {
  const body = markdown.replace("- 交付：完成状态", ["- 交付：数据结果", "- 结果形状：记录列表",
    "- 字段：标题（文本）：每项的标题", "- 字段：链接（文本）：同一项的链接"].join("\n"))
  const draft = requirement(body), plan = projectPreparationPlan(draft, 1)
  assert.deepEqual(plan.outputContract.schema, { type: "array", items: { type: "object",
    properties: { 标题: { type: "string" }, 链接: { type: "string" } },
    required: ["标题", "链接"], additionalProperties: false } })
  assert.deepEqual(plan.steps[0]!.resultSpec, { contractVersion: "bat-result-spec/v1", mode: "data",
    schema: plan.outputContract.schema, fields: [{ path: [], description: "逐项包含已声明字段的记录列表",
      producerRef: "records" }], derivations: [], edgeCases: [] })
  const instruction = browserUseTask({ requirement: draft, plan, step: plan.steps[0]!, resolvedInput: null })
  assert.ok(instruction.includes(body))
  assert.match(instruction, /结果（整体）/)
})

test("数据草案须明确结果形状，完成状态不得写结果形状", () => {
  const data = markdown.replace("- 交付：完成状态", "- 交付：数据结果\n- 字段：标题（文本）：一个标题")
  assert.throws(() => projectPreparationPlan(requirement(data), 1), /preparation_draft_result_shape_required/)
  const newPlan = projectPreparationPlan(requirement(data.replace("- 字段：", "- 结果形状：单条记录\n- 字段：")), 1)
  assert.equal(newPlan.outputContract.schema.type, "object")
  assert.throws(() => projectPreparationPlan(requirement(markdown.replace("- 交付：完成状态",
    "- 交付：完成状态\n- 结果形状：记录列表")), 1), /preparation_draft_result_shape_invalid/)
  assert.throws(() => projectPreparationPlan(requirement(data.replace("- 字段：",
    "- 结果形状：记录列表\n- 结果形状：记录列表\n- 字段：")), 1), /preparation_draft_result_shape_invalid/)
})

test("缺少用户确认的页面交付意图不能投影新计划", () => {
  assert.throws(() => projectPreparationPlan(requirement(markdown.replace("- 页面交付：无需保留\n", "")), 1),
    /preparation_draft_browser_delivery_required/)
})

test("确认后计划投影不调用模型", async () => {
  const saved: TaskAuthoringJob[] = []
  const authoring = new TaskChainAuthoring({ nextPlanVersion: () => 1,
    saveJob: (job: TaskAuthoringJob) => { saved.push(structuredClone(job)) } } as never,
  { prepare: () => { throw new Error("model_must_not_run") } } as never, {} as never)
  const job = { id: randomUUID(), taskId: randomUUID(), status: "queued", sequence: 0,
    updatedAt: new Date().toISOString(), audit: null } as TaskAuthoringJob
  const plan = await authoring.plan(job, requirement(), new AbortController().signal)
  assert.equal(plan.steps.length, 1)
  assert.equal(saved.at(-1)?.audit?.reportedInvocations, 0)
  assert.equal(saved.at(-1)?.audit?.model, "none")
})


test("本次来源沿用环境快照并关闭 owner；缺在线最终编译即失败，不搜索旧任务或离线补编译", async () => {
  const draft = requirement(), plan = projectPreparationPlan(draft, 1), events: string[] = []
  const job = { id: randomUUID(), taskId: draft.taskId, key: "current", status: "queued", sequence: 0,
    type: "prepare", browserRunId: null, browser: { mode: "dedicated-headless", headless: true } } as TaskAuthoringJob
  const artifacts: unknown[] = []
  const repository = { saveJob: () => {},
    jobs: () => { throw new Error("must_not_search_old_jobs") },
    saveArtifact: (_task: string, _job: string, mediaType: string, body: unknown) => {
      events.push("persist-source"); artifacts.push(structuredClone(body))
      return { artifactId: randomUUID(), digest: digestJson(jsonValueSchema.parse(body)), mediaType }
    } }
  const selection = { modelId: "fixture", reasoningEffort: "medium" }
  const ai = { selection: () => selection, prepare: async () => ({ selection }) }
  let frozenSource = ""
  const upstream = {
    withAuthoring: async (_input: { browserMode?: string }, work: (session: HybridAuthorSession) => Promise<void>) => {
      assert.equal(_input.browserMode, "dedicated-headless")
      events.push("browser-open")
      await work({ author: async (source, options) => {
        const sign = (value: unknown) => ({ ...value as object, digest: digestCanonicalJson(jsonValueSchema.parse(value)) })
        const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: "a".repeat(64),
          requirement: sign({ id: source.requirementId, version: source.requirementVersion,
            text: source.requirementText, taskText: source.task, sourceDigest: source.requirementDigest }),
          plan: sign({ id: source.planId, version: source.planVersion, sourceDigest: source.planDigest,
            stepId: source.stepId, inputSchemaDigest: digestCanonicalJson(jsonValueSchema.parse(source.inputSchema)),
            outputSchemaDigest: digestCanonicalJson(jsonValueSchema.parse(source.outputSchema)),
            callMode: source.callMode, entryUrls: source.entryUrls, resultSpec: source.resultSpec, semanticOperations: [] }),
          runtimeInputSchema: source.inputSchema,
          trace: sign({ source: { historyRef: "fixture" }, completed: true, observations: [],
            finalResultRef: { ref: "fixture:output", digest: digestCanonicalJson(null) },
            actions: [{ id: "a-0001", name: "done", status: "succeeded", preObservationRef: null, postObservationRef: null,
              args: { success: true, reason: "Execution sample finished", readRefs: [] },
              resultRef: { ref: "fixture:done", digest: digestCanonicalJson(null) } }] }) }
        const wire = { output: null, canonicalRequest: JSON.stringify(request), sourceGaps: [] }
        const result = parseCapturedSource(wire, "a".repeat(64), [])
        options?.onSource?.({ result: wire, forkSourceDigest: "a".repeat(64), modelCalls: [] })
        frozenSource = JSON.stringify(artifacts)
        return result
      } })
      events.push("browser-closed")
    },
    recompile: async () => { events.push("compile"); throw new Error("compiler_fixture_failure") },
  }
  const authoring = new TaskChainAuthoring(repository as never, ai as never, upstream as never)
  await assert.rejects(authoring.task(job, draft, plan, null, new AbortController().signal), /hybrid_online_final_compilation_required/)
  assert.deepEqual(events, ["browser-open", "persist-source", "browser-closed"])
  assert.equal(artifacts.length, 1)
  assert.equal(JSON.stringify(artifacts), frozenSource)
  assert.equal(job.authoring?.stage, "exploring")
  assert.equal(job.authoring?.consumption.compilationCalls, 0)
  assert.equal(job.status, "failed")
  assert.deepEqual((job.authoring!.exploration as { sources: { closed: boolean }[] }).sources.map((s) => s.closed), [true])
})

test("未完成来源仅有业务歧义时返回需求对话，缺证和拒绝来源仍按来源失败处理", async () => {
  const draft = requirement(), plan = projectPreparationPlan(draft, 1)
  const cases = [
    { resolutions: ["confirm_intent"], clarification: true },
    { resolutions: ["collect_evidence"], clarification: false },
    { resolutions: ["reject_trace"], clarification: false },
    { resolutions: ["confirm_intent", "reject_trace"], clarification: false },
  ] as const
  for (const scenario of cases) {
    const job = { id: randomUUID(), taskId: draft.taskId, key: "source-boundary", status: "queued", sequence: 0,
      type: "prepare", browserRunId: null, preparation: { phase: "preexecuting", requirementReturn: null },
    } as unknown as TaskAuthoringJob
    const events: string[] = []
    const repository = { saveJob: () => {}, saveArtifact: (_task: string, _job: string, mediaType: string, body: unknown) => {
      events.push("source-saved")
      return { artifactId: randomUUID(), digest: digestJson(jsonValueSchema.parse(body)), mediaType }
    } }
    const selection = { modelId: "fixture", reasoningEffort: "medium" }
    const ai = { selection: () => selection, prepare: async () => ({ selection }) }
    const upstream = {
      withAuthoring: async (_input: unknown, work: (session: HybridAuthorSession) => Promise<void>) => {
        try { await work({ author: async (source, options) => {
          const sign = (value: unknown) => ({ ...value as object, digest: digestCanonicalJson(jsonValueSchema.parse(value)) })
          const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: "a".repeat(64),
            requirement: sign({ id: source.requirementId, version: source.requirementVersion,
              text: source.requirementText, taskText: source.task, sourceDigest: source.requirementDigest }),
            plan: sign({ id: source.planId, version: source.planVersion, sourceDigest: source.planDigest,
              stepId: source.stepId, inputSchemaDigest: digestCanonicalJson(jsonValueSchema.parse(source.inputSchema)),
              outputSchemaDigest: digestCanonicalJson(jsonValueSchema.parse(source.outputSchema)),
              callMode: source.callMode, entryUrls: source.entryUrls, resultSpec: source.resultSpec, semanticOperations: [] }),
            runtimeInputSchema: source.inputSchema,
            trace: sign({ source: { historyRef: "fixture" }, completed: false, actions: [], observations: [] }) }
          const sourceGaps = scenario.resolutions.map((resolution) => ({ id: `gap-${resolution}`,
            code: "source_not_proven", actionRefs: [], clauseRefs: ["confirmed-scope"],
            reason: resolution === "confirm_intent" ? "business_scope_ambiguous" : resolution, resolution }))
          const wire = { output: null, canonicalRequest: JSON.stringify(request), sourceGaps }
          options?.onSource?.({ result: wire, forkSourceDigest: "a".repeat(64), modelCalls: [] })
          return parseCapturedSource(wire, "a".repeat(64), [])
        } }) } finally { events.push("browser-closed") }
      },
      recompile: async () => { events.push("compile"); throw new Error("must_not_compile_invalid_source") },
    }
    const authoring = new TaskChainAuthoring(repository as never, ai as never, upstream as never)
    await assert.rejects(authoring.task(job, draft, plan, null, new AbortController().signal),
      scenario.clarification ? /hybrid_requirement_clarification_required/ : /hybrid_completed_source_required/)
    assert.deepEqual(events, ["source-saved", "browser-closed"])
    assert.equal(job.status, "failed")
    assert.deepEqual((job.authoring!.exploration as { sources: { closed: boolean }[] }).sources.map((s) => s.closed), [true])
    assert.deepEqual(job.preparation?.requirementReturn?.issues,
      scenario.clarification ? [{ code: "business_scope_ambiguous", clauseRefs: ["confirmed-scope"] }] : undefined)
  }

  const serviceJob = { id: randomUUID(), taskId: draft.taskId, key: "service-boundary", status: "queued",
    sequence: 0, type: "prepare", browserRunId: null,
    preparation: { phase: "preexecuting", requirementReturn: null },
  } as unknown as TaskAuthoringJob
  const serviceAuthoring = new TaskChainAuthoring({ saveJob: () => {} } as never,
    { selection: () => ({ modelId: "fixture", reasoningEffort: "medium" }),
      prepare: async () => ({ selection: { modelId: "fixture", reasoningEffort: "medium" } }) } as never,
    { withAuthoring: async () => { throw new Error("model_account_unavailable") },
      recompile: async () => { throw new Error("must_not_compile") } } as never)
  await assert.rejects(serviceAuthoring.task(serviceJob, draft, plan, null, new AbortController().signal),
    /model_account_unavailable/)
  assert.equal(serviceJob.preparation?.requirementReturn, null)
})
