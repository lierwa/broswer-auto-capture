import type { TaskRun } from "@browser-capture/contracts"
import type { RuntimeState } from "./runtime.js"

export class BudgetError extends Error {}
export class UncertainEffectError extends Error {}

export function assertBudget(state: RuntimeState) {
  const { consumed, budget } = state.run, next = state.compiled.nodes.get(state.checkpoint.cursor)
  if (consumed.transitions >= budget.maxTransitions) throw new BudgetError("转换预算已用尽。")
  if ((next?.kind === "browser" || next?.kind === "capability" && next.capability.name.startsWith("browser."))
    && consumed.browserCommands >= budget.maxBrowserCommands) throw new BudgetError("浏览器命令预算已用尽。")
  if (consumed.activeMs >= budget.maxActiveMs) throw new BudgetError("自动化活动时间预算已用尽。")
  if (consumed.invocations >= budget.maxInvocations) throw new BudgetError("链路调用预算已用尽。")
  if (next?.kind === "llm" && consumed.llmCalls === null) throw new BudgetError("显式模型调用数未知，不能继续消耗预算。")
  if (consumed.llmCalls !== null && consumed.llmCalls >= budget.maxLlmCalls && next?.kind === "llm") throw new BudgetError("显式模型预算已用尽。")
}

export function executionStableKey(state: RuntimeState) {
  const active = Object.entries(state.checkpoint.loops).filter(([, frame]) => frame.activeStableKey !== null)
    .sort(([left], [right]) => left.localeCompare(right)).map(([id, frame]) => `${id}=${frame.activeStableKey}`)
  return active.length ? active.join("|") : null
}

export function now(state: RuntimeState) { return state.capabilities.now?.() ?? new Date() }
export function activeNow(state: RuntimeState) { return state.capabilities.activeElapsedMs?.() ?? Date.now() }
export function modelCount(run: TaskRun) {
  if (!run.auditComplete || run.modelCalls.some((audit) => audit.reportedInvocations === null)) return null
  return run.modelCalls.reduce((sum, audit) => sum + audit.reportedInvocations!, 0)
}
