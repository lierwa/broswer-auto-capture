import type { JsonValue, TaskAuthoringJob } from "@browser-capture/contracts"
import type { BrowserFailure } from "@browser-capture/browser"
import { digestJson } from "@browser-capture/runtime"
import { opensAccessCircuit } from "./runtime-host.js"
import { explorationTraceSchema, type ExplorationTrace } from "./exploration-trace.js"

export function reusableExploration(jobs: TaskAuthoringJob[], key: string, input: JsonValue,
  recoveredCleanup: (browserRunId: string) => boolean = () => false): ExplorationTrace | undefined {
  const candidate = jobs.findLast((job) => job.type === "chain" && job.key === key
    && !["queued", "running"].includes(job.status) && job.authoring?.exploration !== null)
  if (!candidate?.authoring?.exploration) return undefined
  const parsed = explorationTraceSchema.safeParse(candidate.authoring.exploration)
  if (!parsed.success || !parsed.data.result
    || JSON.stringify(parsed.data.input) !== JSON.stringify(input)) return undefined
  const trace = parsed.data.closed ? parsed.data
    : recoveredCleanup(parsed.data.browserRunId) ? { ...parsed.data, closed: true } : undefined
  if (!trace) return undefined
  // WHY：编译元数据失败可复用已完成 E1；不确定页面状态或同名动作未消歧都缺少可冻结事实，修复后必须重新探索。
  if (trace.events.some((event) => ["invalid_response", "target_ambiguous"].includes(event.error ?? "") || event.error
    && opensAccessCircuit(event.error as BrowserFailure, event.command.type))) return undefined
  return trace
}

export function reusableTaskExploration(jobs: TaskAuthoringJob[], key: string, input: JsonValue,
  stepIds: string[]): ExplorationTrace | undefined {
  const candidate = jobs.findLast((job) => job.type === "chain" && job.key === key
    && !["queued", "running"].includes(job.status) && job.authoring?.exploration !== null)
  if (!candidate?.authoring?.exploration) return undefined
  const parsed = explorationTraceSchema.safeParse(candidate.authoring.exploration)
  if (!parsed.success || !parsed.data.closed || JSON.stringify(parsed.data.input) !== JSON.stringify(input)) return undefined
  if (parsed.data.stepResults?.length !== stepIds.length
    || parsed.data.stepResults.some((step, index) => step.stepId !== stepIds[index])) return undefined
  // WHY：完整的跨步骤 E1 可重新计算计划输出并重编译；不确定页面状态或访问熔断仍必须重新探索。
  if (parsed.data.events.some((event) => ["invalid_response", "target_ambiguous"].includes(event.error ?? "") || event.error
    && opensAccessCircuit(event.error as BrowserFailure, event.command.type))) return undefined
  return parsed.data
}

export function reusableTaskAnnotations(jobs: TaskAuthoringJob[], key: string, exploration: ExplorationTrace | undefined,
  stepIds: string[]): JsonValue | undefined {
  if (!exploration) return undefined
  const candidate = jobs.findLast((job) => job.type === "chain" && job.key === key && job.status === "completed"
    && job.authoring?.stage === "compiled" && job.authoring.annotations !== null && job.authoring.exploration !== null)
  if (!candidate?.authoring?.annotations || !candidate.authoring.exploration
    || digestJson(candidate.authoring.exploration) !== digestJson(exploration)) return undefined
  const raw = candidate.authoring.annotations
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.mode !== "task" || !Array.isArray(raw.steps)) return undefined
  const steps = raw.steps as JsonValue[]
  if (steps.length !== stepIds.length || steps.some((value, index) => !value || typeof value !== "object" || Array.isArray(value)
    || value.stepId !== stepIds[index] || !value.annotations || typeof value.annotations !== "object" || Array.isArray(value.annotations))) return undefined
  // WHY：编译器或运行预算修复后复用同一 E1 和已校验语义注解；新版本仍重新跑 validateAnnotations，不能靠重复模型输出碰运气。
  return raw
}
