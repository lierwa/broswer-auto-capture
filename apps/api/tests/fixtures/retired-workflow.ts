import { randomUUID } from "node:crypto"
import { requiredNodeOutcomes, taskChainSchema, type TaskPlan } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { extractionFixture } from "../../../../packages/contracts/tests/task-chain-fixtures.js"
import { workflowArtifactSchema } from "../../src/upstream-browser/workflow-artifact.js"

export function retiredFixture(taskId: string = randomUUID()) {
  const plan: TaskPlan = structuredClone(extractionFixture.plan)
  plan.taskId = taskId
  plan.budget.maxLlmCalls = 2
  plan.steps[0]!.budget.maxLlmCalls = 2
  const artifact = workflowArtifactSchema.parse({ mode: "workflow-use-artifact/v1", status: "workflow_candidate",
    upstream: { workflowUseVersion: "0.2.11", workflowUseCommit: "5d2d19fe8835cc86f1bf3e04302a5000d590f249",
      browserUseVersion: "0.13.8", patches: ["a".repeat(64), "b".repeat(64)] },
    task: { requirementId: plan.requirement.id, requirementVersion: 1, requirementDigest: plan.requirement.digest,
      planId: plan.id, planVersion: 1, stepId: "perform", inputDigest: "c".repeat(64) },
    definition: { steps: [{ type: "navigation", url: "{destination}" }] }, definitionDigest: "d".repeat(64),
    inputBindings: { destination: "destination" }, stepTypes: ["navigation"], sourceSuccess: true, sourceValidated: true,
    history: { localRef: "history.json", digest: "e".repeat(64) }, rawResult: { localRef: "result.json", digest: "f".repeat(64) }, modelCalls: [] })
  const outputContract = plan.outputContract
  const common = { outputContract, writes: [] }
  const node = { ...common, id: "workflow", label: "historical workflow", kind: "llm", instruction: "historical task",
    input: { source: "input", path: [] }, model: "fixture", timeoutMs: 1000, outcomes: [...requiredNodeOutcomes.llm],
    delegate: { capability: { name: "browser.workflow-use", version: 1 }, effect: "external_write",
      config: { artifactId: randomUUID(), digest: digestJson(artifact), definitionDigest: artifact.definitionDigest, inputBindings: artifact.inputBindings },
      modelPurposes: ["output_conversion"], maxInvocations: 1, maxBrowserCommands: 1 } }
  const terminal = (id: string, status: string) => ({ ...common, id, label: id, kind: "terminal", status,
    reason: "historical result", evidence: [{ source: "input", path: [] }], outcomes: [] })
  const chain = taskChainSchema.parse({ ...extractionFixture.chain, taskId, nodeModel: "stable/v1",
    inputContract: plan.inputContract, outputContract, budget: plan.budget, plan: { id: plan.id, version: 1, digest: digestJson(plan) },
    entry: "workflow", nodes: [node, terminal("done", "completed"), terminal("failed", "failed")],
    edges: node.outcomes.map((outcome) => ({ from: node.id, outcome, to: outcome === "success" ? "done" : "failed" })),
    completion: [{ id: "result", description: "historical output", predicate: { operator: "exists", value: { source: "node", nodeId: node.id, path: [] } } }],
    validation: { status: "verified", evidence: ["sample", "verification"].map((phase, index) => ({
      phase, runId: randomUUID(), chainDigest: "a".repeat(64), inputDigest: String(index).repeat(64),
      outputDigest: "b".repeat(64), passed: true, modelCalls: 1, at: "2026-09-15T00:00:00.000Z" })) } })
  return { plan, chain, artifact }
}
