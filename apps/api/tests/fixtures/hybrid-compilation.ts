import { execFileSync } from "node:child_process"
import path from "node:path"
import { type TaskPlan } from "@browser-capture/contracts"
import { extractionFixture } from "../../../../packages/contracts/tests/task-chain-fixtures.js"

export function hybridFixture(kind = "navigation", identities?: { requirementId: string; requirementVersion: number;
  planId: string; planVersion: number; stepId: string }, verifiedChild?: unknown) {
  const root = path.resolve(import.meta.dirname, "../../../..")
  const python = path.join(root, "work/upstream-browser-hybrid/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
  return JSON.parse(execFileSync(python, [path.join(root, "vendor/workflow-use/workflows/tests/hybrid_fixture.py"), kind,
    ...(identities || verifiedChild ? [JSON.stringify(identities ?? null)] : []), ...(verifiedChild ? [JSON.stringify(verifiedChild)] : [])], {
    cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, PYTHONPATH: [path.join(root, "vendor/workflow-use/workflows"),
      path.join(root, "apps/api/python")].join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false", BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" } }))
}
export function hybridPlan(raw: ReturnType<typeof hybridFixture>): TaskPlan {
  const plan = structuredClone(extractionFixture.plan)
  plan.inputContract = { ...plan.inputContract, schema: raw.request.runtimeInputSchema }
  const last = raw.response.compilation.segments.at(-1)
  const schema = raw.request.requirement.clauses.find((clause: { expression?: { assemble?: unknown } }) => clause.expression?.assemble)?.expression.assemble.schema
    ?? raw.request.control.loops.at(-1)?.accumulator.schema
    ?? (last?.kind === "explicit_llm" ? last.outputSchema : last?.outputs[0]?.schema ?? { type: "null" })
  plan.outputContract = { id: schema.type === "null" ? "unit" : "hybrid-result", version: 1, dialect: "bat-value-schema/v1", schema }
  plan.steps[0]!.inputContract = plan.inputContract
  plan.steps[0]!.outputContract = plan.outputContract
  plan.steps[0]!.completion = [{ id: "result", description: "动作完成", predicate: schema.type === "null" ? {
    operator: "equals", left: { source: "node", nodeId: "perform", path: [] }, right: { source: "constant", value: null } }
    : { operator: "exists", value: { source: "node", nodeId: "perform", path: [] } } }]
  plan.completion = structuredClone(plan.steps[0]!.completion)
  return plan
}
