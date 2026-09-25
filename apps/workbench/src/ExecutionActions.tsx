import { Button } from "@radix-ui/themes"
import type { TaskChainConnection } from "./taskChainConnection.js"
import type { LiveChainModel } from "./useLiveChain.js"

export function ExecutionActions({ execution, connection }: {
  execution: NonNullable<LiveChainModel["selectedExecution"]>
  connection: TaskChainConnection
}) {
  const busy = connection.snapshot().busy
  return <div className="context-actions">
    {["waiting_for_human", "paused", "blocked"].includes(execution.status) && <Button size="1" disabled={busy}
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
