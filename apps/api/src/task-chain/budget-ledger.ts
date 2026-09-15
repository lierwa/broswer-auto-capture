import type { TaskBudget, TaskConsumption } from "@browser-capture/contracts"
import { RuntimeBudgetExceededError } from "@browser-capture/runtime"

export type BudgetScope = Readonly<{ budget: TaskBudget; consumed: TaskConsumption }>
export type BudgetSnapshot = Readonly<{ total: TaskConsumption; scope: TaskConsumption }>

const numericKeys = ["transitions", "browserCommands", "activeMs", "invocations"] as const
const budgetLabel = { transitions: "图迁移", browserCommands: "浏览器命令", activeMs: "活动时间", invocations: "链路调用" }
const budgetKey = {
  transitions: "maxTransitions", browserCommands: "maxBrowserCommands",
  activeMs: "maxActiveMs", invocations: "maxInvocations",
} as const

export class TaskBudgetLedger {
  private total: TaskConsumption
  private readonly scopes: Map<string, { budget: TaskBudget; consumed: TaskConsumption }>

  constructor(private readonly budget: TaskBudget, consumed: TaskConsumption, scopes: ReadonlyMap<string, BudgetScope>,
    private readonly onChange?: (scopeId: string, snapshot: BudgetSnapshot) => void) {
    this.total = clone(consumed)
    this.scopes = new Map([...scopes].map(([id, scope]) => [id, { budget: scope.budget, consumed: clone(scope.consumed) }]))
  }

  account(scopeId: string, delta: Partial<TaskConsumption>, mode: "claim" | "settle" = "claim") {
    const scope = this.scope(scopeId)
    if (mode === "claim" && typeof delta.llmCalls === "number"
      && (this.total.llmCalls === null || scope.consumed.llmCalls === null)) {
      throw new RuntimeBudgetExceededError("显式模型调用数未知，不能继续授权模型调用。")
    }
    if (mode === "claim") this.assertWithin(scope)
    const nextTotal = apply(this.total, delta, mode), nextScope = apply(scope.consumed, delta, mode)
    if (mode === "claim") this.assertWithin({ budget: this.budget, consumed: nextTotal }, { budget: scope.budget, consumed: nextScope })
    if (same(this.total, nextTotal) && same(scope.consumed, nextScope)) return
    this.total = nextTotal; scope.consumed = nextScope
    this.onChange?.(scopeId, { total: clone(this.total), scope: clone(scope.consumed) })
  }

  remaining(scopeId: string) {
    const scope = this.scope(scopeId)
    const left = <K extends keyof TaskBudget>(key: K, consumedKey: keyof TaskConsumption) =>
      Math.max(0, Math.min(this.budget[key] - numeric(this.total[consumedKey]), scope.budget[key] - numeric(scope.consumed[consumedKey])))
    return {
      maxTransitions: left("maxTransitions", "transitions"),
      maxBrowserCommands: left("maxBrowserCommands", "browserCommands"),
      maxActiveMs: left("maxActiveMs", "activeMs"),
      maxLlmCalls: this.total.llmCalls === null || scope.consumed.llmCalls === null ? 0
        : Math.max(0, Math.min(this.budget.maxLlmCalls - this.total.llmCalls, scope.budget.maxLlmCalls - scope.consumed.llmCalls)),
      maxInvocations: left("maxInvocations", "invocations"),
      maxDepth: Math.min(this.budget.maxDepth, scope.budget.maxDepth),
    }
  }

  depthLimit(scopeId: string) { return Math.min(this.budget.maxDepth, this.scope(scopeId).budget.maxDepth) }
  scopeConsumption(scopeId: string) { return clone(this.scope(scopeId).consumed) }

  private scope(id: string) {
    const scope = this.scopes.get(id)
    if (!scope) throw new Error("task_budget_scope_unknown")
    return scope
  }

  private assertWithin(...values: Array<{ budget: TaskBudget; consumed: TaskConsumption }>) {
    const candidates = values.length ? values : [{ budget: this.budget, consumed: this.total }]
    for (const value of candidates) {
      for (const key of numericKeys) {
        if (value.consumed[key] > value.budget[budgetKey[key]]) throw new RuntimeBudgetExceededError(`${budgetLabel[key]}预算已用尽。`)
      }
      if (value.consumed.llmCalls !== null && value.consumed.llmCalls > value.budget.maxLlmCalls) {
        throw new RuntimeBudgetExceededError("任务授权的显式模型预算已用尽。")
      }
    }
  }
}

export function emptyConsumption(): TaskConsumption {
  return { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }
}

function clone(value: TaskConsumption): TaskConsumption { return { ...value } }
function same(left: TaskConsumption, right: TaskConsumption) { return JSON.stringify(left) === JSON.stringify(right) }
function numeric(value: TaskConsumption[keyof TaskConsumption]) { return value ?? Number.POSITIVE_INFINITY }
function apply(current: TaskConsumption, delta: Partial<TaskConsumption>, mode: "claim" | "settle"): TaskConsumption {
  const next = clone(current)
  for (const key of numericKeys) {
    const change = delta[key]
    if (change === undefined) continue
    if (!Number.isInteger(change) || mode === "claim" && change < 0 || next[key] + change < 0) {
      throw new Error("task_budget_delta_invalid")
    }
    next[key] += change
  }
  if (delta.llmCalls === null) next.llmCalls = null
  else if (delta.llmCalls !== undefined) {
    if (!Number.isInteger(delta.llmCalls) || next.llmCalls === null || next.llmCalls + delta.llmCalls < 0) {
      throw new Error("task_llm_budget_delta_invalid")
    }
    next.llmCalls += delta.llmCalls
  }
  return next
}
