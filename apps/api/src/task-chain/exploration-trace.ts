import { z } from "zod"
import { commandSchema, type BrowserCommand, type BrowserInspection } from "@browser-capture/browser"
import { keySchema, parseTaskValue, type JsonValue, type TaskDataContract } from "@browser-capture/contracts"
import { readPath } from "@browser-capture/runtime"

const path = z.array(z.union([z.string().refine((v) => !["__proto__", "constructor", "prototype"].includes(v)), z.number().int().nonnegative()])).max(32)
export const provenanceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("tool"), outputPath: path, eventId: z.string(), resultPath: path }).strict(),
  z.object({ source: z.literal("inference"), outputPath: path, eventIds: z.array(z.string()).min(1), instruction: z.string().min(1).max(2000)
    .describe("可用于不同输入复跑的推导方法。引用当前 runtimeInput 和工具结果，不把本次样本文本或结果写成固定答案。") }).strict(),
])
export const explorationResultSchema = z.object({ result: z.json(), provenance: z.array(provenanceSchema).min(1).max(1000) }).strict()
export const explorationStepSubmissionSchema = z.object({ stepId: keySchema, representativeInput: z.json(),
  result: z.json(), provenance: z.array(provenanceSchema).min(1).max(1000),
  aggregate: explorationResultSchema.optional() }).strict()
export const explorationStepResultSchema = z.object({ stepId: keySchema, input: z.json(), result: explorationResultSchema,
  runtimeResult: explorationResultSchema }).strict()
export type ExplorationStepResult = z.infer<typeof explorationStepResultSchema>
export const traceEventSchema = z.object({ id: z.string(), callId: z.string(), at: z.string().datetime(),
  command: commandSchema, output: z.json(), observation: z.object({ url: z.string(), text: z.string().max(6000),
    truncated: z.boolean(), observedAt: z.string().datetime() }).nullable(),
  status: z.enum(["completed", "failed"]), error: z.string().nullable() }).strict()
export type ExplorationEvent = z.infer<typeof traceEventSchema>
export type ExplorationResult = z.infer<typeof explorationResultSchema>
export const explorationTraceSchema = z.object({ jobId: z.string(), browserRunId: z.string(), input: z.json(),
  events: z.array(traceEventSchema), result: explorationResultSchema.nullable(), calls: z.number().int().nonnegative(),
  conclusion: z.string(), closed: z.boolean(), stepResults: z.array(explorationStepResultSchema).optional() }).strict()
export type ExplorationTrace = z.infer<typeof explorationTraceSchema>

export function validateExplorationResult(raw: unknown, contract: TaskDataContract, events: ExplorationEvent[]) {
  const value = explorationResultSchema.parse(raw)
  const indexed = new Map(events.map((event) => [event.id, event]))
  const paths = new Set<string>()
  let result = value.result
  for (const provenance of value.provenance) {
    const key = JSON.stringify(provenance.outputPath)
    if (paths.has(key)) throw new Error("provenance_duplicate_path")
    paths.add(key)
    if (provenance.source === "inference") {
      const evidence = provenance.eventIds.map((id) => indexed.get(id))
      if (evidence.some((event) => event?.status !== "completed")) throw new Error("provenance_event_missing")
      const inferred = readPath(result, provenance.outputPath)
      // TRADE-OFF：只把截短/去跟踪参数的 URL 对齐到所引事件中的唯一真实地址；多候选时保持原值并由 URL 证据门拒绝。
      result = writeResultPath(result, provenance.outputPath, canonicalizeInferredUrls(inferred,
        evidence.flatMap((event) => event ? exactUrls([event.output, event.observation?.url]) : [])))
      continue
    }
    const event = indexed.get(provenance.eventId)
    if (!event || event.status !== "completed") throw new Error("provenance_event_missing")
    // WHY：tool provenance 已经精确声明事实来源；由宿主投影真实值可避免模型手抄长 URL 或动态文本产生漂移。
    result = writeResultPath(result, provenance.outputPath, readPath(event.output, provenance.resultPath))
  }
  parseTaskValue(contract, result)
  // WHY：容器来源可覆盖所有叶字段；缺失、空集合和 null 也必须有明确可核验来源。
  for (const leaf of leafPaths(result)) {
    if (!value.provenance.some((item) => item.outputPath.every((part, index) => leaf[index] === part))) throw new Error("provenance_field_missing")
  }
  return { ...value, result }
}

function writeResultPath(root: JsonValue, path: (string | number)[], value: JsonValue): JsonValue {
  if (!path.length) return structuredClone(value)
  const result = structuredClone(root)
  let current: JsonValue = result
  for (const [index, segment] of path.entries()) {
    const last = index === path.length - 1
    if (Array.isArray(current)) {
      if (typeof segment !== "number" || segment >= current.length) throw new Error("binding_path_missing")
      if (last) current[segment] = structuredClone(value)
      else current = current[segment]!
      continue
    }
    if (!current || typeof current !== "object" || typeof segment !== "string") throw new Error("binding_path_missing")
    if (last) (current as Record<string, JsonValue>)[segment] = structuredClone(value)
    else {
      if (!(segment in current)) throw new Error("binding_path_missing")
      current = (current as Record<string, JsonValue>)[segment]!
    }
  }
  return result
}

function canonicalizeInferredUrls(value: JsonValue, evidence: string[]): JsonValue {
  if (typeof value === "string") {
    let submitted: URL
    try { submitted = new URL(value) } catch { return value }
    if (!["http:", "https:"].includes(submitted.protocol)) return value
    const matches = [...new Set(evidence)].filter((candidate) => compatibleObservedUrl(submitted, new URL(candidate)))
    return matches.length === 1 ? matches[0]! : value
  }
  if (Array.isArray(value)) return value.map((item) => canonicalizeInferredUrls(item, evidence))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, canonicalizeInferredUrls(child, evidence)]))
}

function compatibleObservedUrl(submitted: URL, observed: URL) {
  if (submitted.href === observed.href) return true
  if (submitted.origin !== observed.origin || submitted.pathname !== observed.pathname) return false
  if (submitted.hash && submitted.hash !== observed.hash) return false
  for (const [key, value] of submitted.searchParams) {
    if (!observed.searchParams.getAll(key).includes(value)) return false
  }
  return true
}

function exactUrls(values: unknown[]) {
  const urls = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      try {
        const url = new URL(value)
        if (["http:", "https:"].includes(url.protocol)) urls.add(url.href)
      } catch { /* 普通页面文本不是完整 URL。 */ }
      return
    }
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value && typeof value === "object") for (const item of Object.values(value)) visit(item)
  }
  for (const value of values) visit(value)
  return [...urls]
}

function leafPaths(value: JsonValue, prefix: (string | number)[] = []): (string | number)[][] {
  if (value === null || typeof value !== "object" || Object.keys(value).length === 0) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, [...prefix, Array.isArray(value) ? Number(key) : key]))
}

export function traceEvent(callId: string, command: BrowserCommand, output: JsonValue, inspection: BrowserInspection | null,
  error: string | null = null): ExplorationEvent {
  if ("target" in command && command.target && "selector" in command.target && /@e\d+/.test(command.target.selector)) throw new Error("temporary_target_ref")
  return traceEventSchema.parse({ id: callId, callId, at: new Date().toISOString(), command, output,
    observation: inspection ? { url: inspection.url, text: inspection.text.replace(/@e\d+/g, "[ref]").slice(0, 6000),
      truncated: inspection.truncated || inspection.text.length > 6000, observedAt: inspection.observedAt } : null,
    status: error ? "failed" : "completed", error })
}
