import { z } from "zod"
import type { ChainRecord } from "@browser-capture/contracts/chain"
import type { AIModelResolver, PreparedAIModel } from "../ai/model.js"

export async function modelDecision<T>(input: { shared: AIModelResolver; schema: z.ZodType<T>; prompt: string;
  record: Pick<ChainRecord, "audits" | "consumed">; purpose: "exploration" | "explicit_llm" | "repair";
  phase: "exploration" | "sample" | "verification" | "execution"; nodeId: string | null; signal: AbortSignal; save: () => void }) {
  const { signal, record, purpose, save } = input, shared = await input.shared()
  const audit: ChainRecord["audits"][number] = { purpose, phase: input.phase, nodeId: input.nodeId,
    model: shared.selection.modelId, effort: shared.selection.reasoningEffort,
    invocations: null, reportedModel: null, reportedEffort: null, status: "intended", aiEvents: [] }
  record.audits.push(audit); record.consumed.modelCalls++; save()
  return sharedDecision(input, audit, shared)
}
async function sharedDecision<T>(input: Parameters<typeof modelDecision<T>>[0], audit: ChainRecord["audits"][number], shared: PreparedAIModel) {
  const { signal, save } = input
  try {
    const { $schema: _, ...jsonSchema } = structuredSchema(input.schema)
    const output = await shared.generateObject({ prompt: input.prompt, jsonSchema, parse: (value) => input.schema.parse(value), signal,
      onEvent: (event) => { audit.aiEvents.push(event); save() } })
    signal.throwIfAborted(); audit.invocations = 1; audit.reportedModel = shared.selection.modelId
    audit.reportedEffort = shared.selection.reasoningEffort; audit.status = "completed"; save(); return output
  } catch (error) { if (audit.status === "intended") audit.status = signal.aborted ? "interrupted" : "failed"; save(); throw error }
}
function structuredSchema<T>(schema: z.ZodType<T>) {
  return z.toJSONSchema(schema, { target: "draft-7", override: ({ jsonSchema }) => {
    for (const key of ["format", "pattern", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) delete jsonSchema[key]
  } })
}
