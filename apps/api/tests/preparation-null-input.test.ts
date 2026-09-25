import assert from "node:assert/strict"
import test from "node:test"
import type { TaskAuthoringJob, TaskPlan, TaskRequirement } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { reusableCompilationPlan } from "../src/task-chain/preparation.js"

test("同一需求的编译失败重试复用 job 内候选计划而不制造另一用户版本", () => {
  const requirement = { id: "requirement", taskId: "task", version: 1, revision: 2 } as TaskRequirement
  const plan = { id: "plan", taskId: "task", version: 7,
    requirement: { id: requirement.id, version: requirement.version, revision: requirement.revision,
      digest: digestJson(requirement) } } as TaskPlan
  const failed = { id: "failed", taskId: "task", type: "prepare", status: "failed",
    authoring: { stage: "compiling" }, preparation: { candidatePlan: plan, requirementReturn: null } } as TaskAuthoringJob
  const repository = { jobs: () => [failed] }
  for (const stage of ["compiling", "compiled"] as const) {
    failed.authoring!.stage = stage
    assert.equal(reusableCompilationPlan(repository as never, "task", requirement), plan)
  }
  assert.equal(reusableCompilationPlan(repository as never, "task", { ...requirement, version: 2 }), undefined)
})
