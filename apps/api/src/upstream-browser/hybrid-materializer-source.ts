import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema, type JsonValue, type TaskPlan, type TaskPlanStep } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { hybridAuthoritySchema, hybridNaturalRequestSchema, type HybridCompilation } from "./hybrid-schema.js"
import type { naturalPayloadContext } from "./hybrid-natural-payload.js"

type Authority = z.infer<typeof hybridAuthoritySchema>
export type SourceContext = { version: 1; authority: Authority }
  | { version: 2; request: z.infer<typeof hybridNaturalRequestSchema>; payload: ReturnType<typeof naturalPayloadContext> }

export function sourceContext(compilation: HybridCompilation, request: Record<string, JsonValue>, plan: TaskPlan,
  step: TaskPlanStep, payload: ReturnType<typeof naturalPayloadContext> | null): { authority: Authority | null; context: SourceContext } {
  const authority = compilation.compilerVersion === "bat-hybrid/1"
    ? hybridAuthoritySchema.parse({ requirement: request.requirement, plan: request.plan }) : null
  if (authority && (authority.plan.id !== plan.id || authority.plan.version !== plan.version
    || authority.plan.stepId !== step.id || authority.requirement.id !== plan.requirement.id
    || authority.requirement.version !== plan.requirement.version || authority.requirement.digest !== compilation.sourceDigests[0]
    || authority.plan.digest !== compilation.sourceDigests[1]
    || !isDeepStrictEqual(request.runtimeInputSchema, step.inputContract.schema))) throw new Error("hybrid_authority_mismatch")
  if (authority) return { authority, context: { version: 1, authority } }
  const natural = hybridNaturalRequestSchema.parse(request)
  if (natural.plan.id !== plan.id || natural.plan.version !== plan.version || natural.plan.stepId !== step.id
    || natural.plan.sourceDigest !== digestJson(plan) || natural.requirement.id !== plan.requirement.id
    || natural.requirement.version !== plan.requirement.version || natural.requirement.sourceDigest !== plan.requirement.digest
    || natural.plan.inputSchemaDigest !== digestCanonicalJson(jsonValueSchema.parse(step.inputContract.schema))
    || natural.plan.outputSchemaDigest !== digestCanonicalJson(jsonValueSchema.parse(step.outputContract.schema))
    || !step.resultSpec || !isDeepStrictEqual(natural.plan.resultSpec, step.resultSpec)
    || !isDeepStrictEqual(natural.runtimeInputSchema, step.inputContract.schema)) throw new Error("hybrid_natural_source_mismatch")
  if (!payload) throw new Error("hybrid_natural_source_payloads_missing")
  return { authority: null, context: { version: 2, request: natural, payload } }
}


function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`
  return JSON.stringify(value)
}

export function digestCanonicalJson(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}
