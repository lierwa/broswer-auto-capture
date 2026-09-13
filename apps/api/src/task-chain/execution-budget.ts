import type { TaskBudget, TaskChain, TaskPlan } from "@browser-capture/contracts"

export function executionBudget(plan: TaskPlan, chains: TaskChain[]) {
  const scopeBudgets = Object.fromEntries(plan.steps.map((step) => {
    const chain = chains.find((item) => item.stepId === step.id)
    if (!chain) throw new Error("execution_chain_missing")
    const count = step.invocation.mode === "each" ? step.invocation.maxItems : 1
    const budget = Object.fromEntries(Object.entries(chain.budget).map(([key, value]) => [key, key === "maxDepth" ? value : value * count])) as TaskBudget
    return [step.id, budget]
  }))
  const values = Object.values(scopeBudgets), budget = { ...values[0]! }
  for (const key of Object.keys(budget) as (keyof TaskBudget)[]) budget[key] = key === "maxDepth"
    ? Math.max(...values.map((value) => value[key])) : values.reduce((sum, value) => sum + value[key], 0)
  return { budget, scopeBudgets }
}
