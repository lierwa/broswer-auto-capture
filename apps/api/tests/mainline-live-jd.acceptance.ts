// 显式现场验收：使用真实工作台/API及现有扩展授权，不复制凭据，不注入链路。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { interviewStateSchema } from "@browser-capture/contracts/interview"
import { taskWorkspaceSnapshotSchema, taskChainDispatchResponseSchema, taskExecutionDetailSchema } from "@browser-capture/contracts"

if (process.env.BAT_RUN_LIVE_JD !== "1") throw Error("explicit_live_jd_validation_required")
const root = process.cwd(), origin = "http://127.0.0.1:4173"
const directory = path.join(root, "work", "content-capture-proof", `live-jd-${Date.now()}`)
await mkdir(directory, { recursive: true })
const log: unknown[] = [], taskId = process.env.BAT_LIVE_JD_TASK_ID ?? (await request("/api/tasks", {
  type: "create", requestId: randomUUID() }) as { id: string }).id
let latestStage = ""
async function request(route: string, body?: unknown): Promise<unknown> {
  const response = await fetch(origin + route, { method: body ? "POST" : "GET",
    headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) })
  const result: unknown = await response.json()
  if (!response.ok) throw Error(`live_api_${response.status}:${JSON.stringify(result).slice(0,400)}`)
  return result
}
async function workspace() { return taskWorkspaceSnapshotSchema.parse(await request(`/api/task-chain?taskId=${taskId}`)) }
function report(stage: string, detail: Record<string, unknown> = {}) {
  if (stage === latestStage) return
  latestStage = stage
  const entry = { at: new Date().toISOString(), stage, taskId, ...detail }; log.push(entry)
  console.log(JSON.stringify(entry))
}
async function settle() {
  const waitMs = Number(process.env.BAT_LIVE_JD_WAIT_MS ?? 420_000)
  assert.ok(Number.isInteger(waitMs) && waitMs >= 1_000 && waitMs <= 900_000, "live_wait_budget_invalid")
  const deadline = Date.now() + waitMs
  while (true) {
    const value = await workspace(), activity = value.activity, execution = value.execution
    const stage = activity ? `${activity.phase}/${activity.status}/${activity.build?.stepId ?? ""}` : execution?.status ?? "idle"
    report(stage, { jobId: activity?.id, executionId: execution?.id, reason: activity?.reason })
    if (activity?.status === "waiting_for_human" || execution?.status === "waiting_for_human") {
      throw Error("live_jd_human_action_required")
    }
    if (activity?.status === "failed") throw Error(`live_jd_preparation_failed:${activity.reason}`)
    if (!activity && !["queued", "running"].includes(execution?.status ?? "")) return value
    if (Date.now() > deadline) throw Error("live_jd_deadline_reached")
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
}
async function command(body: unknown) {
  return taskChainDispatchResponseSchema.parse(await request(`/api/task-chain?taskId=${taskId}`, body)).snapshot
}
async function verifiedContent() {
  const snapshot = await workspace(), execution = snapshot.execution
  assert.equal(execution?.status, "completed", "live_jd_execution_incomplete")
  const detail = taskExecutionDetailSchema.parse(await request(`/api/task-chain/execution?taskId=${taskId}&executionId=${execution!.id}`))
  const value = detail.execution.output?.kind === "value" ? detail.execution.output.value : null
  assert.ok(Array.isArray(value) && value.length > 0 && value.length <= 5, "live_jd_detail_outputs_required")
  const selected = detail.execution.steps.find(step => step.stepId === "sources")?.output
  assert.ok(Array.isArray(selected), "live_jd_selected_entries_required")
  assert.equal(value.length, selected.length, "live_jd_every_selected_entry_must_produce_content")
  assert.equal(detail.execution.steps.find(step => step.stepId === "item")?.invocationIds.length, selected.length)
  for (const item of value) {
    assert.ok(item && typeof item === "object" && !Array.isArray(item) && typeof item.content === "string")
    const content = JSON.parse(item.content) as { url: string; html: string; images: unknown[]; coverage: { complete: boolean } }
    assert.equal(content.coverage.complete, true)
    assert.ok(content.html.length > 100 && content.images.length > 0 && new URL(content.url).hostname.endsWith("jd.com"))
    // WHY：这是本任务的实际范围验收；只有图库不能冒充包含配置文字的完整详情区域。
    assert.ok(content.html.includes("品牌") && content.html.includes("型号"), "live_jd_configuration_region_missing")
  }
  assert.equal(detail.execution.consumed.llmCalls, 0)
  assert.equal(detail.execution.cleanup.status, "confirmed", "live_jd_owned_cleanup_unconfirmed")
  assert.ok(detail.calls.every(call => call.run.status === "completed"))
  const evidence = detail.calls.flatMap(call => call.run.outcome?.evidence ?? [])
  assert.ok(evidence.length >= value.length, "live_jd_artifacts_required")
  report("verified", { executionId: execution!.id, items: value.length, artifacts: evidence.length, modelCalls: 0 })
}
try {
  report("start", { directory })
  let state = interviewStateSchema.parse(await request(`/api/interview?taskId=${taskId}`))
  if (!state.confirmedVersion) {
    if (!state.drafts.length) {
      const failed = state.turns.at(-1)?.status === "failed"
      await request(`/api/interview?taskId=${taskId}`, { type: failed ? "retry" : "message", requestId: randomUUID(), expectedRevision: state.revision,
        ui: { schemaVersion: 1, packages: [CommonContentUIProtocol] },
        ...(!failed ? { text: "现场验收：京东洗碗机销量前5原始详情。来源 https://www.jd.com/ ，搜索洗碗机，按销量排序，只选择前5个真实商品详情入口；不足5个就保留实际数量。逐项进入商品详情，打开商品详情/配置所在区域，展开并滚动加载，整体保存这个相关区域的文字、表格及原图和来源，不逐个参数寻找、不清洗。输入无需参数。交付是页面内容，执行方式为逐项执行。每个入口复用同一单项流程。登录、验证码、访问限制由用户处理，不绕过。完成后无需保留任务窗口。请形成可确认的业务草稿。" } : {}) })
      const deadline = Date.now() + 180_000
      do {
        await new Promise(resolve => setTimeout(resolve, 1000))
        state = interviewStateSchema.parse(await request(`/api/interview?taskId=${taskId}`))
        if (Date.now() > deadline) throw Error("live_interview_deadline_reached")
      } while (state.active)
    }
    const draft = state.drafts.at(-1)
    assert.ok(draft && draft.revision === state.revision, "live_interview_confirmation_draft_missing")
    await request(`/api/interview?taskId=${taskId}`, { type: "confirm", version: draft.version,
      expectedRevision: state.revision, requestId: randomUUID() })
    state = interviewStateSchema.parse(await request(`/api/interview?taskId=${taskId}`))
  }
  let snapshot = await workspace()
  // WHY：明确重建时不拿旧失败草稿冒充新修复候选；仍保存旧版本和运行历史。
  if (process.env.BAT_LIVE_JD_REBUILD === "1") {
    assert.ok(process.env.BAT_LIVE_JD_TASK_ID, "rebuild_requires_explicit_existing_task")
    assert.ok(!snapshot.activity || !["queued", "running", "waiting_for_human"].includes(snapshot.activity.status), "rebuild_active_job")
    await command({ type: "prepare_task", requestId: randomUUID(), requirementVersion: state.confirmedVersion })
    snapshot = await settle()
  }
  if (!snapshot.draft) {
    // WHY：验收等待超时不等于产品运行失败；续查同一 active job，不能重启探索耗用模型。
    if (!snapshot.activity) {
      await command({ type: "prepare_task", requestId: randomUUID(), requirementVersion: state.confirmedVersion })
    }
    snapshot = await settle()
  }
  if (snapshot.activity || ["queued", "running"].includes(snapshot.execution?.status ?? "")) snapshot = await settle()
  await verifiedContent()
  const draft = snapshot.draft!
  if (!snapshot.release) {
    if (snapshot.draftReadiness?.phase !== "ready") {
      await command({ type: "trial_task_draft", requestId: randomUUID(), input: null,
        draftId: draft.id, expectedRevision: draft.revision, expectedChecksum: draft.checksum })
      snapshot = await settle(); await verifiedContent()
    }
    await command({ type: "publish_task_draft", requestId: randomUUID(), draftId: draft.id,
      expectedRevision: draft.revision, expectedChecksum: draft.checksum })
    snapshot = await workspace()
  }
  await command({ type: "run_task", requestId: randomUUID(), input: null, release: snapshot.release!.reference })
  await settle(); await verifiedContent()
  report("passed", { releaseId: snapshot.release!.reference.id })
} catch (error) {
  report("failed", { error: error instanceof Error ? error.message : "unknown" }); process.exitCode = 1
} finally { await writeFile(path.join(directory, "events.json"), JSON.stringify(log, null, 2)) }
