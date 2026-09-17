import { retireWorkflowV1 } from "./retirement.js"
import { z } from "zod"
import {
  jsonValueSchema, modelCallPurposeSchema,
  type ArtifactReference, type JsonValue, type TaskChain, type TaskPlan, type TaskPlanStep, type TaskRequirement,
  type ValueSchema,
} from "@browser-capture/contracts"
import type { ModelCallReport } from "@browser-capture/runtime"
import type { UpstreamAuthorResult } from "./service.js"

export const workflowArtifactMediaType = "application/vnd.bat.workflow-use+json;version=1"
export const workflowDelegateConfigSchema = z.object({ artifactId: z.uuid(), digest: z.string().length(64),
  inputBindings: z.record(z.string().min(1), z.string().min(1)), definitionDigest: z.string().length(64) }).strict()
export const workflowArtifactSchema = z.object({
  mode: z.literal("workflow-use-artifact/v1"), status: z.literal("workflow_candidate"),
  upstream: z.object({ workflowUseVersion: z.literal("0.2.11"), workflowUseCommit: z.literal("5d2d19fe8835cc86f1bf3e04302a5000d590f249"),
    browserUseVersion: z.literal("0.13.8"),
    // 历史产物的补丁数只用于只读解码；新执行路径不写 v1 产物。
    patches: z.array(z.string().length(64)).refine((items) => [2, 9, 10, 11, 12].includes(items.length)),
  }).strict(),
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
  stepInput: JsonValue; result: UpstreamAuthorResult }): ReturnType<typeof workflowArtifactSchema.parse> {
  retireWorkflowV1()
  throw new Error("legacy_workflow_use_v1_retired")
}

export function compileWorkflowChain(plan: TaskPlan, step: TaskPlanStep, version: number, model: string,
  artifact: ReturnType<typeof workflowArtifactSchema.parse>, reference: ArtifactReference): TaskChain {
  retireWorkflowV1({ artifactId: reference.artifactId })
  throw new Error("legacy_workflow_use_v1_retired")
}

export function completedModelInvocations(calls: ModelCallReport[]) {
  return calls.filter((call) => call.status !== "intended").reduce((sum, call) => sum + (call.reportedInvocations ?? 0), 0)
}

function primitiveSchema(schema: ValueSchema) { return ["string", "number", "integer", "boolean"].includes(schema.type) }
function snakeCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()
}
