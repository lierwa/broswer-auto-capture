import { taskExecutionSchema, type TaskChainCommand, type TaskExecution } from "@browser-capture/contracts"
import { stableUuid } from "@browser-capture/runtime"
import { taskExecutions } from "../database/schema.js"
import type { ProductStore } from "../database/store.js"
type Dispatch = (taskId: string, command: TaskChainCommand) => Promise<unknown>
type Control = (taskId: string, command: { requestId: string; executionId: string; expectedSequence: number; action: "inspect" | "end" }) => Promise<unknown>

export function browserResourceRecords(store: ProductStore, kind?: "daily" | "dedicated") {
  return store.db.select({ body: taskExecutions.body }).from(taskExecutions).all().map(row => taskExecutionSchema.parse(row.body))
    .filter(record => !kind || (store.executionBrowser(record.browser).mode === "daily" ? "daily" : "dedicated") === kind)
}

/** WHY：只有原 owner 的核验才能释放历史占用；新运行与账号操作共用此适配，不复制浏览器生命周期。 */
export async function recoverExecutionResources(store: ProductStore, kind: "daily" | "dedicated", requestId: string,
  dispatch: Dispatch, control: Control,
  active: (taskId: string, executionId: string) => boolean = () => false) {
  for (const record of browserResourceRecords(store, kind)) {
    if (active(record.taskId, record.id)) continue
    // WHY：离线/未知资源保留原审计；单个历史 owner 不能中止其它 owner 的核验。
    await recoverRecord(store, record, kind, requestId, dispatch, control).catch(() => undefined)
  }
}

async function recoverRecord(store: ProductStore, record: TaskExecution, kind: "daily" | "dedicated", requestId: string,
  dispatch: Dispatch, control: Control) {
  if (record.status === "cleanup_required") {
    await dispatch(record.taskId, { type: "cleanup_execution", requestId: stableUuid(requestId, "cleanup-before-use", record.id),
      executionId: record.id, expectedSequence: record.sequence })
    return
  }
  if (!["active", "pending", "unavailable"].includes(record.browserHandoff.status) || !record.browserHandoff.leaseId) return
  await control(record.taskId, { requestId: stableUuid(requestId, "inspect-before-use", record.id),
    executionId: record.id, expectedSequence: record.sequence, action: "inspect" })
  const inspected = browserResourceRecords(store, kind).find(value => value.id === record.id)!
  if (inspected.browserHandoff.status === "active" && ["failed", "blocked", "cancelled", "stale"].includes(inspected.status))
    await control(record.taskId, { requestId: stableUuid(requestId, "release-before-use", record.id),
      executionId: record.id, expectedSequence: inspected.sequence, action: "end" })
}
