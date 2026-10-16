import { taskExecutionSchema, type TaskChainCommand, type TaskExecution } from "@browser-capture/contracts"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { executionResourcePredicate, authoringResourcePredicate } from "../database/execution-resource-index.js"
import { stableUuid } from "@browser-capture/runtime"
import { taskExecutions, taskAuthoringJobs } from "../database/schema.js"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { settleAuthoringCleanup } from "./authoring-cleanup.js"
type Dispatch = (taskId: string, command: TaskChainCommand) => Promise<unknown>
export function authoringResourceRecords(store: ProductStore) {
  return store.db.select({ id: taskAuthoringJobs.id, taskId: taskAuthoringJobs.taskId })
    .from(taskAuthoringJobs).where(sql.raw(authoringResourcePredicate)).all()
}
export async function recoverAuthoringResources(store: ProductStore, repository: TaskContractRepository,
  upstream: UpstreamBrowserRuntime, kind: "daily" | "dedicated", active: (key: string) => boolean, inFlight: Set<string>) {
  for (const record of authoringResourceRecords(store)) {
    const key = `${record.taskId}:${record.id}`, job = repository.job(record.taskId, record.id)
    if ((job.browser?.mode === "daily" ? "daily" : "dedicated") !== kind || active(key) || inFlight.has(key)) continue
    inFlight.add(key)
    try { await settleAuthoringCleanup(repository, upstream, job, false) }
    catch { /* 原始清理证据保留；一个损坏来源不能阻止其它 owner 核验。 */ }
    finally { inFlight.delete(key) }
  }
}
type Control = (taskId: string, command: { requestId: string; executionId: string; expectedSequence: number; action: "inspect" | "end" }) => Promise<unknown>

type ResourceRecord = Pick<TaskExecution, "id" | "taskId" | "status" | "sequence" | "browser" | "browserHandoff">
const resourceSchema = z.object({ id: taskExecutionSchema.shape.id, taskId: taskExecutionSchema.shape.taskId,
  status: taskExecutionSchema.shape.status, sequence: taskExecutionSchema.shape.sequence,
  browser: taskExecutionSchema.shape.browser, browserHandoff: taskExecutionSchema.shape.browserHandoff })
const resourceFields = { id: taskExecutions.id, taskId: taskExecutions.taskId,
  status: sql<string>`json_extract(body,'$.status')`, sequence: sql<number>`json_extract(body,'$.sequence')`,
  browser: sql<string | null>`json_extract(body,'$.browser')`,
  browserHandoff: sql<string | null>`json_extract(body,'$.browserHandoff')` }

function parseResource(row: {
  id: string; taskId: string; status: string; sequence: number; browser: string | null; browserHandoff: string | null;
}): ResourceRecord {
  return resourceSchema.parse({ ...row, browser: row.browser === null ? undefined : JSON.parse(row.browser),
    browserHandoff: row.browserHandoff === null ? undefined : JSON.parse(row.browserHandoff) })
}

export function browserResourceRecords(store: ProductStore, kind?: "daily" | "dedicated") {
  // WHY：巡检只查询索引中的待清理owner与小字段，不能同步解码所有历史输出/截图/事件。
  return store.db.select(resourceFields).from(taskExecutions).where(sql.raw(executionResourcePredicate)).all()
    .map(parseResource).filter(record => !kind || (store.executionBrowser(record.browser).mode === "daily" ? "daily" : "dedicated") === kind)
}

/** WHY：只有原 owner 的核验才能释放历史占用；新运行与账号操作共用此适配，不复制浏览器生命周期。 */
export async function recoverExecutionResources(store: ProductStore, kind: "daily" | "dedicated", requestId: string,
  dispatch: Dispatch, control: Control,
  active: (taskId: string, executionId: string) => boolean = () => false) {
  for (const record of browserResourceRecords(store, kind)) {
    if (active(record.taskId, record.id)) continue
    // WHY：离线/未知资源保留原审计；单个历史 owner 不能中止其它 owner 的核验。
    await recoverRecord(store, record, requestId, dispatch, control).catch(() => undefined)
  }
}

async function recoverRecord(store: ProductStore, record: ResourceRecord, requestId: string,
  dispatch: Dispatch, control: Control) {
  if (record.status === "cleanup_required") {
    await dispatch(record.taskId, { type: "cleanup_execution", requestId: stableUuid(requestId, "cleanup-before-use", record.id),
      executionId: record.id, expectedSequence: record.sequence })
    return
  }
  if (!["active", "pending", "unavailable"].includes(record.browserHandoff.status) || !record.browserHandoff.leaseId) return
  await control(record.taskId, { requestId: stableUuid(requestId, "inspect-before-use", record.id),
    executionId: record.id, expectedSequence: record.sequence, action: "inspect" })
  // inspect可以已关闭窗口；定点读原记录，不再从待恢复候选反查，也不重读其它历史。
  const row = store.db.select(resourceFields).from(taskExecutions).where(eq(taskExecutions.id, record.id)).get()
  if (!row) return
  const inspected = parseResource(row)
  if (inspected.browserHandoff.status === "active" && ["failed", "blocked", "cancelled", "stale"].includes(inspected.status))
    await control(record.taskId, { requestId: stableUuid(requestId, "release-before-use", record.id),
      executionId: record.id, expectedSequence: inspected.sequence, action: "end" })
}
