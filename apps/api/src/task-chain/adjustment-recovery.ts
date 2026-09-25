import type { TaskAuthoringJob } from "@browser-capture/contracts/api"
import { DomainError } from "../errors.js"
import { adjustmentSuggestionSchema, parseAdjustmentSuggestion } from "./adjustment-prompt.js"

export function savedAdjustmentSuggestion(job: TaskAuthoringJob) {
  const audit = job.audit
  if (job.type !== "adjustment" || job.status !== "failed" || job.adjustment?.decision !== "generating"
    || job.adjustment.candidate !== null || audit?.purpose !== "chain_adjustment" || audit.status !== "failed") {
    throw new DomainError("adjustment_recovery_unavailable", "当前失败记录没有可离线恢复的模型建议。", 409)
  }
  const starts = audit.events.filter((event) => event.type === "generation.started")
  const completions = audit.events.filter((event) => event.type === "generation.completed")
  const failures = audit.events.filter((event) => event.type === "generation.failed")
  if (starts.length !== 1 || completions.length !== 1 || failures.length
    || starts[0]!.invocationId !== completions[0]!.invocationId) {
    throw new DomainError("adjustment_recovery_incomplete", "原模型调用未完整成功结束，不能从残缺文本恢复。", 409)
  }
  const invocationId = starts[0]!.invocationId
  const first = audit.events.indexOf(starts[0]!), last = audit.events.indexOf(completions[0]!)
  const deltas = audit.events.slice(first + 1, last)
    .filter((event) => event.type === "text.delta" && event.invocationId === invocationId)
  if (first < 0 || last <= first || !deltas.length
    || audit.events.slice(0, first).some((event) => event.type === "text.delta" && event.invocationId === invocationId)
    || audit.events.slice(last + 1).some((event) => event.type === "text.delta" && event.invocationId === invocationId)
    || audit.events.some((event) => event.type === "text.delta" && event.invocationId !== invocationId)
    || deltas.some((event, index) => index > 0 && event.sequence < deltas[index - 1]!.sequence)) {
    throw new DomainError("adjustment_recovery_event_order", "已保存模型文本事件顺序不完整，不能离线恢复。", 409)
  }
  const text = deltas.map((event) => event.type === "text.delta" ? event.text : "").join("")
  if (text.length > 200_000) {
    throw new DomainError("adjustment_recovery_output_too_large", "已保存模型输出超过离线恢复上限。", 409)
  }
  let raw: unknown
  try { raw = JSON.parse(text) }
  catch { throw new DomainError("adjustment_recovery_output_invalid", "已保存模型输出不是完整 JSON。", 409) }
  const transport = adjustmentSuggestionSchema.parse(raw)
  const suggestion = parseAdjustmentSuggestion(transport)
  if (suggestion.decision !== "suggestion" || !suggestion.operations) {
    throw new DomainError("adjustment_recovery_no_candidate", "已保存模型输出要求澄清或返回需求，不能转成链路候选。", 409)
  }
  return suggestion
}
