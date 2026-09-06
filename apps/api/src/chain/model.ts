import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { createCodexAppServerClient, routeFor, type ModelPurpose } from "@browser-capture/model-runtime"
import type { ChainRecord } from "@browser-capture/contracts/chain"
import type { ModelSession, ModelSessionFactory } from "../interview/modelSession.js"

export function chainModelFactory(root: string, purpose: ModelPurpose): ModelSessionFactory {
  return async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "browser-chain-model-"))
    const client = createCodexAppServerClient({ cwd: directory, packageRoot: path.join(root, "packages/model-runtime"), purpose })
    return { client, dispose: async () => { try { await client.close() } finally { await rm(directory, { recursive: true, force: true }) } } }
  }
}
export async function modelDecision<T>(input: { factory: ModelSessionFactory; schema: z.ZodType<T>; prompt: string; record: ChainRecord;
  purpose: "exploration" | "explicit_llm"; phase: "exploration" | "sample" | "verification"; nodeId: string | null; signal: AbortSignal; save: () => void }) {
  const { signal, record, purpose, save } = input, route = routeFor(purpose)
  const audit: ChainRecord["audits"][number] = { purpose, phase: input.phase, nodeId: input.nodeId, model: route.model, effort: route.effort,
    invocations: null, reportedModel: null, reportedEffort: null, status: "intended" }
  record.audits.push(audit); record.consumed.modelCalls++; save()
  let session: ModelSession | undefined
  const abort = () => { void session?.client.close().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  try {
    signal.throwIfAborted(); session = await input.factory(); signal.throwIfAborted()
    const { $schema: _, ...schema } = z.toJSONSchema(input.schema, { target: "draft-7", override: ({ jsonSchema }) => {
      for (const key of ["format", "pattern", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) delete jsonSchema[key]
    } })
    let output: T | undefined
    for await (const event of session.client.runTurn(input.prompt, schema, signal)) {
      if (event.type !== "turn_succeeded" && event.type !== "interrupted") continue
      audit.invocations = event.audit.invocationCount; audit.reportedModel = event.audit.reportedModel; audit.reportedEffort = event.audit.reportedEffort
      audit.status = event.type === "turn_succeeded" ? "completed" : "interrupted"; save()
      if (event.audit.requestedModel !== route.model || event.audit.requestedEffort !== route.effort || event.audit.reportedModel !== route.model || event.audit.reportedEffort !== route.effort) throw new Error("model_route_mismatch")
      signal.throwIfAborted()
      if (event.type === "turn_succeeded") output = input.schema.parse(JSON.parse(event.outputText))
    }
    signal.throwIfAborted()
    if (!output) throw new Error("model_output_missing")
    return output
  } catch (error) { if (audit.status === "intended") audit.status = signal.aborted ? "interrupted" : "failed"; save(); throw error }
  finally { signal.removeEventListener("abort", abort); await session?.dispose() }
}
