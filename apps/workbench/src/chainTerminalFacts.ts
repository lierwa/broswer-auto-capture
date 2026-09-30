import type { ChainNode, TaskExecution, TaskRun } from "@browser-capture/contracts"

type Terminal = Extract<ChainNode, { kind: "terminal" }>
type Call = Pick<TaskRun, "status" | "outcome">

/** WHY：接单成功不等于步骤开始，首连等前置失败不能仍显示等待输入，也不能伪造节点失败。 */
export function startFact(execution: (Pick<TaskExecution, "status"> & Partial<Pick<TaskExecution, "cleanupResume">>) | null,
  hasCall: boolean, accepted: boolean) {
  if (hasCall) return "bound"
  const status = execution?.cleanupResume?.status ?? execution?.status
  if (status && ["completed", "partial", "failed", "blocked", "cancelled", "stale"].includes(status)) return "not_entered"
  return execution || accepted ? "waiting" : "idle"
}

/** WHY：finished success 先于终点证据核验落盘，只有本次调用最终结论才能证明终点完成。 */
export function terminalFact(node: Terminal, event: TaskRun["events"][number] | undefined, call: Call | undefined) {
  if (!event) return "unreached"
  if (event.status !== "finished") return "pending"
  if (event.outcome !== "success") return "return_failed"
  if (!call?.outcome || call.status === "running") return "pending"
  if (call.status !== node.status || call.outcome.status !== node.status) return "return_failed"
  const outcome = call.outcome
  if (outcome.status === "completed" && !outcome.completionEvidence.includes(node.id)) return "return_failed"
  if (outcome.status === "failed" && outcome.code !== "terminal_failed") return "return_failed"
  if (outcome.status === "blocked" && outcome.code !== "terminal_blocked") return "return_failed"
  return "reached"
}
