import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema, parseTaskValue, valuePathSchema,
  type JsonValue, type TaskPlan, type ValueSchema } from "@browser-capture/contracts"
import { digestJson, readPath } from "@browser-capture/runtime"
import type { HybridSourceResult } from "./hybrid-captured-source.js"
import { naturalSourceContext } from "./hybrid-natural-payload.js"
import { readSpecificationSchema } from "./hybrid-schema.js"

type ValuePath = Array<string | number>
type Source = Pick<HybridSourceResult, "request" | "canonicalRequest" | "output">
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const readRef = z.string().regex(/^r[1-9][0-9]*$/)
const actionSchema = z.object({ id: z.string(), name: z.string(), args: jsonValueSchema,
  status: z.literal("succeeded"), postObservationRef: z.string().nullable(),
  resultRef: z.object({ ref: z.string(), digest: hash }).strict() }).passthrough()
const doneSchema = z.object({ success: z.literal(true), reason: z.string().min(1),
  readRefs: z.array(readRef) }).strict()
const methodFactSchema = z.object({ actionRef: z.string(), specification: readSpecificationSchema,
  outputPath: valuePathSchema, readPath: z.array(z.string()), output: jsonValueSchema,
  resultDigest: hash, urlDigest: hash, targetId: z.string().min(1), containerIdsDigest: hash,
  stable: z.literal(true), readRef, documentRootId: z.number().int().positive(),
  coverage: z.object({ scope: z.literal("current_dom_matches"), total: z.number().int().nonnegative(),
    sampled: z.number().int().positive(), sampleLimit: z.literal(3), runtimeTruncated: z.literal(false) }).strict(),
}).strict()
type MethodFact = z.infer<typeof methodFactSchema>
const methodArgsSchema = z.object({ outputPath: valuePathSchema, container: z.string(),
  fields: z.record(z.string(), z.record(z.string(), jsonValueSchema)),
  maxItems: z.number().int().min(1).max(300).optional() }).strict()
type MethodArgs = z.infer<typeof methodArgsSchema>
type MethodRequest = ReturnType<typeof naturalSourceContext>["ordinary"]

/** WHY：当前页方法预算与最终业务数量不同；字段结构及其余约束仍须严格相等。 */
function representativeReadSchemasCompatible(source: ValueSchema | null | undefined, target: ValueSchema) {
  if (source?.type !== "array" || target.type !== "array") return isDeepStrictEqual(source, target)
  const { minItems: _sourceMinimum, maxItems: _sourceMaximum, ...sourceShape } = source
  const { minItems: _targetMinimum, maxItems: _targetMaximum, ...targetShape } = target
  return isDeepStrictEqual(sourceShape, targetShape)
}

/** Validate one captured representative result without weakening a runtime contract. */
export function representativeSourceOutput(contract: TaskPlan["outputContract"], source: Source) {
  const context = naturalSourceContext(source.canonicalRequest), request = context.ordinary
  if (!isDeepStrictEqual(context.request, source.request)) throw new Error("hybrid_method_source_mismatch")
  const done = actionSchema.parse(request.trace.actions.at(-1))
  if (request.trace.completed !== true || done.name !== "done") throw new Error("hybrid_method_done_required")
  if (new Set(request.trace.actions.map((action) => action.id)).size !== request.trace.actions.length) {
    throw new Error("hybrid_method_action_duplicate")
  }
  const selected = doneSchema.parse(done.args).readRefs
  if (new Set(selected).size !== selected.length) throw new Error("hybrid_method_read_ref_duplicate")
  if (request.plan.resultSpec.mode === "execution") {
    if (selected.length || contract.schema.type !== "null") throw new Error("hybrid_method_execution_read_forbidden")
    return { output: parseTaskValue(contract, source.output), samplePaths: [] as ValuePath[], countPaths: [] as ValuePath[] }
  }
  if (!selected.length || !isDeepStrictEqual(request.plan.resultSpec.schema, contract.schema)) {
    throw new Error("hybrid_method_result_contract_mismatch")
  }
  const facts = methodFacts(request)
  if (new Set(facts.map(({ reference }) => reference)).size !== facts.length) {
    throw new Error("hybrid_method_read_ref_duplicate")
  }
  // WHY：重复读取即使不作为 done 的输出引用，也必须验证其方法来源；旧未选空观察仍不参与结果。
  for (const action of request.trace.actions) {
    if (action.name !== "bat_read_fields" || !isMethodReference(action.args)) continue
    const match = facts.find((fact) => z.object({ actionRef: z.string() }).parse(fact.raw).actionRef === action.id)
    if (!match) throw new Error("hybrid_method_read_ref_missing")
    validateMethodAction(actionSchema.parse(action), methodFactSchema.parse(match.raw), match.observation, request, facts)
  }
  const samplePaths: ValuePath[] = [], outputs: ValuePath[] = []
  for (const reference of selected) {
    const match = facts.find((fact) => fact.reference === reference)
    if (!match) throw new Error("hybrid_method_read_ref_missing")
    const value = methodFactSchema.parse(match.raw)
    const action = actionSchema.parse(request.trace.actions.find((item) => item.id === value.actionRef))
    validateMethodAction(action, value, match.observation, request, facts)
    if (request.trace.actions.findIndex((item) => item.id === action.id) >= request.trace.actions.length - 1) {
      throw new Error("hybrid_method_action_order_invalid")
    }
    const target = schemaAtPath(contract.schema, value.outputPath)
    validateMethodOutput(value, target, source.output)
    if (outputs.some((path) => pathPrefix(path, value.outputPath) || pathPrefix(value.outputPath, path))) {
      throw new Error("hybrid_method_output_path_conflict")
    }
    outputs.push(value.outputPath)
    if (target?.type === "array" && value.outputPath.every((part) => typeof part === "string")) {
      samplePaths.push(value.outputPath)
    }
  }
  const countPaths = derivedCountPaths(request.plan.resultSpec, samplePaths, source.output)
  const schema = representativeOutputSchema(contract.schema, samplePaths, countPaths)
  return { output: parseTaskValue({ ...contract, schema }, source.output), samplePaths, countPaths }
}

function derivedCountPaths(spec: Extract<ReturnType<typeof naturalSourceContext>["ordinary"]["plan"]["resultSpec"],
  { mode: "data" }>, samplePaths: ValuePath[], output: JsonValue) {
  const paths: ValuePath[] = []
  for (const derivation of spec.derivations) {
    if (!samplePaths.some((path) => isDeepStrictEqual(path, derivation.sourcePath))) continue
    const targets = spec.fields.filter((field) => field.producerRef === derivation.producerRef)
    const sources = spec.fields.filter((field) => field.producerRef === derivation.sourceProducerRef
      && isDeepStrictEqual(field.path, derivation.sourcePath))
    if (targets.length !== 1 || sources.length !== 1) throw new Error("hybrid_method_count_owner_invalid")
    const target = targets[0]!.path
    if (target.some((part) => typeof part === "number")) continue
    const values = readPath(output, derivation.sourcePath), count = readPath(output, target)
    if (derivation.operation !== "count" || schemaAtPath(spec.schema, derivation.sourcePath)?.type !== "array"
      || schemaAtPath(spec.schema, target)?.type !== "integer" || !Array.isArray(values)
      || typeof count !== "number" || !Number.isInteger(count) || count !== values.length) {
      throw new Error("hybrid_method_count_sample_mismatch")
    }
    paths.push(target)
  }
  return paths
}

function methodFacts(request: ReturnType<typeof naturalSourceContext>["ordinary"]) {
  return request.trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.kind === "verified_natural_read" && fact.value !== null
      && typeof fact.value === "object" && !Array.isArray(fact.value)
      && fact.value.readRef !== null && fact.value.readRef !== undefined)
    .map((fact) => ({ observation, raw: fact.value,
      reference: z.object({ readRef }).parse(fact.value).readRef })))
}

function validateMethodAction(action: z.infer<typeof actionSchema>, value: MethodFact,
  observation: MethodRequest["trace"]["observations"][number], request: MethodRequest,
  facts: ReturnType<typeof methodFacts>): MethodArgs {
  const args = isMethodReference(action.args)
    ? referencedMethodArgs(action, value, request, facts) : methodArgsSchema.parse(action.args)
  if (action.name !== "bat_read_fields" || action.postObservationRef !== observation.id
    || action.resultRef.digest !== value.resultDigest || value.targetId !== observation.tabId
    || typeof observation.url !== "string" || value.urlDigest !== digestJson(observation.url)
    || !isDeepStrictEqual(args.outputPath, value.outputPath) || args.container !== value.specification.container
    || !isDeepStrictEqual(Object.keys(args.fields).sort(), Object.keys(value.specification.fields).sort())) {
    throw new Error("hybrid_method_action_evidence_mismatch")
  }
  for (const [name, field] of Object.entries(args.fields)) {
    validateMethodField(field, value.specification.fields[name]!)
  }
  const source = schemaAtPath(value.specification.outputSchema, value.readPath)
  if (source?.type === "array" && source.maxItems !== (args.maxItems ?? 300)) {
    throw new Error("hybrid_method_read_budget_mismatch")
  }
  return args
}

function validateMethodField(field: Record<string, JsonValue>, actual: Record<string, unknown>) {
  const defaults: Record<string, JsonValue> = { attribute: null, optionalAttribute: false, resolveUrl: false,
    textSource: "rendered", textPrefix: null, textSuffix: null, normalizeWhitespace: false, normalizePresentation: false }
  const allowed = new Set(["selector", ...Object.keys(defaults)])
  if (Object.keys(field).some((key) => !allowed.has(key)) || field.selector !== actual.selector
    || Object.entries(defaults).some(([key, fallback]) => !isDeepStrictEqual(field[key] ?? fallback, actual[key] ?? fallback))) {
    throw new Error("hybrid_method_field_evidence_mismatch")
  }
}

function isMethodReference(args: unknown) {
  return args !== null && typeof args === "object" && !Array.isArray(args) && Object.hasOwn(args, "readRef")
}

function referencedMethodArgs(action: z.infer<typeof actionSchema>, value: MethodFact,
  request: MethodRequest, facts: ReturnType<typeof methodFacts>): MethodArgs {
  const reference = z.object({ readRef }).strict().parse(action.args).readRef
  const previous = facts.find((fact) => fact.reference === reference)
  if (!previous) throw new Error("hybrid_method_read_ref_missing")
  const prior = methodFactSchema.parse(previous.raw)
  const currentIndex = request.trace.actions.findIndex((item) => item.id === action.id)
  const priorIndex = request.trace.actions.findIndex((item) => item.id === prior.actionRef)
  if (priorIndex < 0 || priorIndex >= currentIndex) throw new Error("hybrid_method_read_ref_order_invalid")
  if (!isDeepStrictEqual(prior.specification, value.specification)
    || !isDeepStrictEqual(prior.outputPath, value.outputPath) || !isDeepStrictEqual(prior.readPath, value.readPath)) {
    throw new Error("hybrid_method_read_ref_mismatch")
  }
  // WHY：只沿当前不可变 trace 中更早的成功事实回溯；跨来源、前向引用和配置覆盖不能变成方法复用。
  return validateMethodAction(actionSchema.parse(request.trace.actions[priorIndex]), prior,
    previous.observation, request, facts)
}

function validateMethodOutput(value: MethodFact, target: ValueSchema | null, output: JsonValue) {
  const { coverage, specification } = value
  const sourceSchema = schemaAtPath(specification.outputSchema, value.readPath)
  const maximum = sourceSchema?.type === "array" ? sourceSchema.maxItems : specification.maxItems
  const selected = readPath(value.output, value.readPath)
  if (!target || !sourceSchema || !representativeReadSchemasCompatible(sourceSchema, target)
    || specification.requireComplete !== true || coverage.sampled > coverage.total
    || maximum === undefined || coverage.sampled > coverage.sampleLimit || coverage.total > maximum
    || coverage.sampled !== Math.min(coverage.total, coverage.sampleLimit, maximum)) {
    throw new Error("hybrid_method_sample_evidence_mismatch")
  }
  if (sourceSchema.type === "array") {
    if (!Array.isArray(selected) || selected.length !== coverage.sampled) {
      throw new Error("hybrid_method_sample_count_mismatch")
    }
  } else if (coverage.sampled !== 1) throw new Error("hybrid_method_sample_count_mismatch")
  const readSchema = representativeOutputSchema(specification.outputSchema,
    specification.outputSchema.type === "array" ? [[]] : [])
  parseTaskValue({ id: "method-sample", version: 1, dialect: "bat-value-schema/v1", schema: readSchema }, value.output)
  if (!isDeepStrictEqual(readPath(value.output, value.readPath), readPath(output, value.outputPath))) {
    throw new Error("hybrid_method_sample_output_mismatch")
  }
}

/** Only validated source paths may reach this preparation-only projection. */
export function representativeOutputSchema(schema: ValueSchema, paths: ValuePath[], countPaths: ValuePath[] = []): ValueSchema {
  const result = structuredClone(schema)
  for (const path of paths) {
    if (path.some((part) => typeof part === "number")) throw new Error("hybrid_method_sample_path_unrepresentable")
    const selected = schemaAtPath(result, path)
    if (selected?.type !== "array") throw new Error("hybrid_method_sample_path_invalid")
    delete selected.minItems
  }
  for (const path of countPaths) {
    if (path.some((part) => typeof part === "number")) throw new Error("hybrid_method_sample_path_unrepresentable")
    const selected = schemaAtPath(result, path)
    if (selected?.type !== "integer") throw new Error("hybrid_method_count_path_invalid")
    // WHY：只对已证样本派生 count 免除准备下限；maximum、类型与正式结果合同保持不变。
    delete selected.minimum
  }
  return result
}

function schemaAtPath(schema: ValueSchema, path: ValuePath): ValueSchema | null {
  let current: ValueSchema | undefined = schema
  for (const part of path) {
    if (typeof part === "string" && current.type === "object") current = current.properties[part]
    else if (typeof part === "number" && current.type === "array" && Number.isInteger(part) && part >= 0
      && (current.maxItems === undefined || part < current.maxItems)) current = current.items
    else return null
    if (!current) return null
  }
  return current
}

function pathPrefix(left: ValuePath, right: ValuePath) {
  return left.length <= right.length && left.every((part, index) => part === right[index])
}
