import { z } from "zod"
import {
  CONTRACT_VERSION, jsonValueSchema, modelCallPurposeSchema, requiredNodeOutcomes, taskChainSchema,
  type ArtifactReference, type JsonValue, type TaskChain, type TaskPlan, type TaskPlanStep, type TaskRequirement,
  type ValueBinding, type ValueSchema,
} from "@browser-capture/contracts"
import { digestJson, stableUuid } from "@browser-capture/runtime"
import type { ModelCallReport } from "@browser-capture/runtime"
import type { UpstreamAuthorResult } from "./service.js"

export const workflowArtifactMediaType = "application/vnd.bat.workflow-use+json;version=1"
export const workflowDelegateConfigSchema = z.object({ artifactId: z.uuid(), digest: z.string().length(64),
  inputBindings: z.record(z.string().min(1), z.string().min(1)), definitionDigest: z.string().length(64) }).strict()
export const workflowArtifactSchema = z.object({
  mode: z.literal("workflow-use-artifact/v1"), status: z.literal("workflow_candidate"),
  upstream: z.object({ workflowUseVersion: z.literal("0.2.11"), workflowUseCommit: z.literal("5d2d19fe8835cc86f1bf3e04302a5000d590f249"),
    browserUseVersion: z.literal("0.13.8"), patches: z.array(z.string().length(64)).length(2) }).strict(),
  task: z.object({ requirementId: z.uuid(), requirementVersion: z.number().int().positive(), requirementDigest: z.string().length(64),
    planId: z.uuid(), planVersion: z.number().int().positive(), stepId: z.string().min(1), inputDigest: z.string().length(64) }).strict(),
  definition: jsonValueSchema, definitionDigest: z.string().length(64), inputBindings: z.record(z.string(), z.string()),
  stepTypes: z.array(z.string().min(1)).min(1), sourceSuccess: z.literal(true), sourceValidated: z.literal(true),
  history: z.object({ localRef: z.string().min(1), digest: z.string().length(64) }).strict(),
  rawResult: z.object({ localRef: z.string().min(1), digest: z.string().length(64) }).strict(),
  modelCalls: z.array(z.object({ callId: z.uuid(), purpose: modelCallPurposeSchema.exclude(["explicit_llm"]), model: z.string(),
    intendedAt: z.string().datetime(), status: z.enum(["intended", "completed", "failed", "interrupted"]),
    reportedInvocations: z.number().int().nonnegative().nullable() }).strict()),
}).strict()

export function workflowInputs(schema: ValueSchema, input: JsonValue) {
  if (schema.type !== "object" || !input || typeof input !== "object" || Array.isArray(input)
    || schema.additionalProperties || Object.keys(input).some((key) => !Object.hasOwn(schema.properties, key))) {
    throw new Error("workflow_primitive_input_object_required")
  }
  const bindings: Record<string, string> = {}, used = new Set<string>()
  for (const [name, property] of Object.entries(schema.properties)) {
    if (!schema.required.includes(name) || !Object.hasOwn(input, name) || !primitiveSchema(property)
      || !["string", "number", "boolean"].includes(typeof input[name])) throw new Error(`workflow_primitive_input_required:${name}`)
    const upstream = snakeCase(name)
    if (!upstream || used.has(upstream)) throw new Error("workflow_input_name_collision")
    used.add(upstream); bindings[name] = upstream
  }
  if (!Object.keys(bindings).length) throw new Error("workflow_primitive_input_required")
  return bindings
}

export function workflowValues(input: JsonValue, bindings: Record<string, string>) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("workflow_primitive_input_object_required")
  return Object.fromEntries(Object.entries(bindings).map(([source, target]) => {
    const value = input[source]
    if (!["string", "number", "boolean"].includes(typeof value)) throw new Error(`workflow_primitive_input_required:${source}`)
    return [target, value as string | number | boolean]
  }))
}

export function createWorkflowArtifact(input: { requirement: TaskRequirement; plan: TaskPlan; step: TaskPlanStep;
  stepInput: JsonValue; result: UpstreamAuthorResult }) {
  return workflowArtifactSchema.parse({ mode: "workflow-use-artifact/v1", status: "workflow_candidate",
    upstream: { workflowUseVersion: "0.2.11", workflowUseCommit: "5d2d19fe8835cc86f1bf3e04302a5000d590f249",
      browserUseVersion: "0.13.8", patches: [
        "b41b21da09efbe13e1082f8a722f10446ccbe4d4575349e9e65b38e24178fd06",
        "a196162065e6c80fca300bb1952caf3c44591f1c177151e41c3d77028158c585",
      ] },
    task: { requirementId: input.requirement.id, requirementVersion: input.requirement.version,
      requirementDigest: digestJson(input.requirement), planId: input.plan.id, planVersion: input.plan.version,
      stepId: input.step.id, inputDigest: digestJson(input.stepInput) },
    definition: input.result.definition, definitionDigest: digestJson(input.result.definition),
    inputBindings: input.result.workflowInputs, stepTypes: input.result.stepTypes,
    sourceSuccess: input.result.sourceSuccess, sourceValidated: input.result.sourceValidated,
    history: input.result.history, rawResult: input.result.rawResult, modelCalls: input.result.modelCalls,
  })
}

export function compileWorkflowChain(plan: TaskPlan, step: TaskPlanStep, version: number, model: string,
  artifact: ReturnType<typeof workflowArtifactSchema.parse>, reference: ArtifactReference): TaskChain {
  const workflowId = "run-workflow", completedId = "completed", failedId = "failed"
  const completion = step.completion.map((item) => ({ ...item, predicate: mapPredicate(item.predicate, step.id, workflowId) }))
  const extractionCalls = artifact.stepTypes.filter((type) => type === "extract" || type === "extract_page_content").length
  const delegate = { capability: { name: "browser.workflow-use", version: 1 }, effect: "external_write" as const,
    config: { artifactId: reference.artifactId, digest: reference.digest, inputBindings: artifact.inputBindings,
      definitionDigest: artifact.definitionDigest }, modelPurposes: ["extract", "output_conversion"] as const,
    maxInvocations: extractionCalls + 1, maxBrowserCommands: artifact.stepTypes.length }
  const workflow = { id: workflowId, label: "执行已验证的 workflow-use definition", kind: "llm" as const,
    instruction: step.goal, input: { source: "input" as const, path: [] }, model, timeoutMs: step.budget.maxActiveMs,
    delegate, outcomes: [...requiredNodeOutcomes.llm], outputContract: step.outputContract, writes: [] }
  const completed = { id: completedId, label: "步骤完成", kind: "terminal" as const, status: "completed" as const,
    reason: "workflow-use 输出及步骤完成条件均已通过。", result: { name: "result", output: { kind: "value" as const,
      value: { source: "node" as const, nodeId: workflowId, path: [] } }, contract: step.outputContract },
    evidence: [{ source: "node" as const, nodeId: workflowId, path: [] }], outcomes: [], outputContract: step.outputContract, writes: [] }
  const failed = { id: failedId, label: "步骤未完成", kind: "terminal" as const, status: "failed" as const,
    reason: "workflow-use 未完成全部动作或输出验证。", evidence: [{ source: "input" as const, path: [] }],
    outcomes: [], outputContract: { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const,
      schema: { type: "null" as const } }, writes: [] }
  return taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v1",
    id: step.chain.id, taskId: plan.taskId, version, plan: { id: plan.id, version: plan.version, digest: digestJson(plan) },
    stepId: step.id, name: step.title, inputContract: step.inputContract, outputContract: step.outputContract,
    variables: {}, entry: workflowId, nodes: [workflow, completed, failed],
    edges: workflow.outcomes.map((outcome) => ({ from: workflowId, outcome, to: outcome === "success" ? completedId : failedId })),
    completion, budget: step.budget, reuseBoundary: { description: "相同已确认业务步骤与 primitive 输入合同。",
      assumptions: ["workflow-use definition 与两份本地补丁版本保持一致。"],
      invalidationConditions: ["输入合同、完成标准或上游 definition 发生变化。"] },
    implementationSummary: "LangGraph 执行一个显式声明模型用途的 workflow-use 复合节点；内部步骤由上游 executor 负责。",
    validation: { status: "candidate", evidence: [] } })
}

export function completedModelInvocations(calls: ModelCallReport[]) {
  return calls.filter((call) => call.status !== "intended").reduce((sum, call) => sum + (call.reportedInvocations ?? 0), 0)
}

function primitiveSchema(schema: ValueSchema) { return ["string", "number", "integer", "boolean"].includes(schema.type) }
function snakeCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()
}
function mapBinding(binding: ValueBinding, stepId: string, workflowId: string): ValueBinding {
  if (binding.source !== "node") return binding
  if (binding.nodeId !== stepId) throw new Error("workflow_step_completion_dependency_unsupported")
  return { ...binding, nodeId: workflowId }
}
function mapPredicate(predicate: TaskPlanStep["completion"][number]["predicate"], stepId: string, workflowId: string) {
  if (predicate.operator === "exists") return { ...predicate, value: mapBinding(predicate.value, stepId, workflowId) }
  if (predicate.operator === "array_length_at_least") return { ...predicate,
    value: mapBinding(predicate.value, stepId, workflowId), minimum: mapBinding(predicate.minimum, stepId, workflowId) }
  return { ...predicate, left: mapBinding(predicate.left, stepId, workflowId), right: mapBinding(predicate.right, stepId, workflowId) }
}
