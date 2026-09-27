import { Button } from "@radix-ui/themes"
import type { TaskChainConnection } from "./taskChainConnection.js"
import type { LiveChainModel } from "./useLiveChain.js"

type HandoffExecution = Pick<NonNullable<LiveChainModel["selectedExecution"]>,
  "id" | "sequence" | "status" | "browserHandoff">

export function BrowserHandoffActions({ execution, connection, onChanged }: {
  execution: HandoffExecution; connection: TaskChainConnection; onChanged?: () => void | Promise<void>
}) {
  const busy = connection.snapshot().busy
  const handoff = execution.browserHandoff
  const hasLease = Boolean(handoff.leaseId && handoff.ownerId)
  const message = handoff.status === "active"
    ? handoff.purpose === "human_wait" && ["waiting_for_human", "paused"].includes(execution.status)
      ? "请在原窗口处理后继续" : "原窗口已保留"
    : handoff.status === "unavailable" ? "原窗口暂不可用"
      : handoff.status === "pending" ? "原窗口待核验" : null
  async function control(action: "inspect" | "focus" | "end") {
    const accepted = await connection.controlHandoff(action, execution.id, execution.sequence)
    if (accepted) await onChanged?.()
  }
  if (!message) return null
  return <>
    <p>{message}</p>
    {handoff.status === "active" && <Button size="1" disabled={busy}
      onClick={() => void control("focus")}>打开原窗口</Button>}
    {hasLease && ["pending", "unavailable"].includes(handoff.status) && <Button size="1"
      disabled={busy} onClick={() => void control("inspect")}>核验原窗口</Button>}
    {hasLease && ["active", "unavailable"].includes(handoff.status) && <Button size="1"
      variant="soft" color="red" disabled={busy}
      onClick={() => { if (window.confirm("结束这次运行保留的原浏览器窗口？")) void control("end") }}>
      结束原窗口</Button>}
  </>
}

export function HistoricalBrowserHandoffActions({ execution, connection }: {
  execution: HandoffExecution; connection: TaskChainConnection
}) {
  if (!["active", "pending", "unavailable"].includes(execution.browserHandoff.status)) return null
  return <div className="context-actions">
    <BrowserHandoffActions execution={execution} connection={connection}
      onChanged={() => connection.reloadHistory("executions").then(() => undefined)} />
  </div>
}

export function ExecutionActions({ execution, connection }: {
  execution: NonNullable<LiveChainModel["selectedExecution"]>
  connection: TaskChainConnection
}) {
  const busy = connection.snapshot().busy
  return <div className="context-actions">
    <BrowserHandoffActions execution={execution} connection={connection} />
    {["waiting_for_human", "paused"].includes(execution.status)
      && (!execution.release || execution.browserHandoff.status === "active") && <Button size="1" disabled={busy}
      onClick={() => void connection.dispatch({ type: "resume_execution", requestId: crypto.randomUUID(),
        executionId: execution.id, expectedSequence: execution.sequence })}>处理后继续</Button>}
    {execution.status === "cleanup_required" && <Button size="1" disabled={busy}
      onClick={() => void connection.dispatch({ type: "cleanup_execution", requestId: crypto.randomUUID(),
        executionId: execution.id, expectedSequence: execution.sequence })}>重试清理</Button>}
    {["queued", "running", "waiting_for_human", "paused"].includes(execution.status) && <Button size="1" color="red"
      variant="soft" disabled={busy} onClick={() => void connection.dispatch({ type: "cancel_execution",
        executionId: execution.id })}>取消本次运行</Button>}
  </div>
}
