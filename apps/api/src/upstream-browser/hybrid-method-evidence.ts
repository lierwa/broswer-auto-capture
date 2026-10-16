import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema, parseTaskValue, valuePathSchema,
  type JsonValue, type TaskPlan, type ValueSchema } from "@browser-capture/contracts"
import { digestJson, readPath } from "@browser-capture/runtime"
import type { HybridSourceResult } from "./hybrid-captured-source.js"
import { naturalSourceContext } from "./hybrid-natural-payload.js"
import { hybridOutputAssemblyEvidenceSchema, readSpecificationSchema } from "./hybrid-schema.js"
import { contentValueSchema, isContentResult } from "./page-content-contract.js"
import { elementEntryValueSchema } from "./element-entry-contract.js"
import { contractReadPaths, contractOwnsValue } from "./hybrid-read-contract.js"

type ValuePath = Array<string | number>
type Source = Pick<HybridSourceResult, "request" | "canonicalRequest" | "output">
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const readRef = z.string().regex(/^r[1-9][0-9]*$/)
const actionSchema = z.object({ id: z.string(), name: z.string(), args: jsonValueSchema,
  status: z.literal("succeeded"), postObservationRef: z.string().nullable(),
  resultRef: z.object({ ref: z.string(), digest: hash }).strict() }).passthrough()
const doneSchema = z.object({ text: z.string(), success: z.literal(true).default(true),
  files_to_display: z.array(z.string()).nullable().optional() }).strict()
const methodFactSchema = z.object({ actionRef: z.string(), specification: readSpecificationSchema,
  outputPath: valuePathSchema, readPath: z.array(z.string()), output: jsonValueSchema,
  resultDigest: hash, urlDigest: hash, targetId: z.string().min(1), containerIdsDigest: hash,
  stable: z.literal(true), readRef, documentRootId: z.number().int().positive(),
  coverage: z.object({ scope: z.literal("current_dom_matches"), total: z.number().int().nonnegative(),
    sampled: z.number().int().positive(), sampleLimit: z.literal(3), runtimeTruncated: z.literal(false),
    matched: z.number().int().nonnegative().optional() }).strict(),
}).strict()
type MethodFact = z.infer<typeof methodFactSchema>
const methodArgsSchema = z.object({ outputPath: valuePathSchema, container: z.string(),
  fields: z.record(z.string(), z.record(z.string(), jsonValueSchema)),
  maxItems: z.number().int().min(1).max(300).optional(), take: z.number().int().min(1).max(300).optional() }).strict()
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
export function representativeSourceOutput(contract: TaskPlan["outputContract"], source: Source, input?: JsonValue) {
  const context = naturalSourceContext(source.canonicalRequest), request = context.ordinary
  if (!isDeepStrictEqual(context.request, source.request)) throw new Error("hybrid_method_source_mismatch")
  const done = actionSchema.parse(request.trace.actions.at(-1))
  if (request.trace.completed !== true || done.name !== "done") throw new Error("hybrid_method_done_required")
  if (new Set(request.trace.actions.map((action) => action.id)).size !== request.trace.actions.length) {
    throw new Error("hybrid_method_action_duplicate")
  }
  doneSchema.parse(done.args)
  if (request.plan.resultSpec.mode === "execution") {
    if (contract.schema.type !== "null") throw new Error("hybrid_method_execution_read_forbidden")
    return { output: parseTaskValue(contract, source.output), samplePaths: [] as ValuePath[], countPaths: [] as ValuePath[] }
  }
  if (!isDeepStrictEqual(request.plan.resultSpec.schema, contract.schema)) {
    throw new Error("hybrid_method_result_contract_mismatch")
  }
  const facts = methodFacts(request)
  const selected = assemblyMethodRefs(context, facts, contract.schema, done)
  if (new Set(facts.map(({ reference }) => reference)).size !== facts.length) {
    throw new Error("hybrid_method_read_ref_duplicate")
  }
  // WHY：重复读取也须验证真实方法来源；输出选择只消费宿主已证 assembly，不让模型抄引用。
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
    for (const name of value.specification.inheritFields ?? []) {
      const records = Array.isArray(value.output) ? value.output : [value.output]
      const outputSchema = value.specification.outputSchema.type === "array"
        ? value.specification.outputSchema.items : value.specification.outputSchema
      if (value.outputPath.length || request.runtimeInputSchema.type !== "object" || outputSchema.type !== "object"
        || !isDeepStrictEqual(request.runtimeInputSchema.properties[name], outputSchema.properties[name])
        || outputSchema.required.includes(name)
          && !request.runtimeInputSchema.required.includes(name) && !Object.hasOwn(value.specification.fields, name)
        || input === undefined || input === null || typeof input !== "object" || Array.isArray(input)
        || records.some(record => record === null || typeof record !== "object" || Array.isArray(record)
          || Object.hasOwn(input, name) && !isDeepStrictEqual(record[name], input[name])
          || !Object.hasOwn(input, name) && Object.hasOwn(record, name)
            && !Object.hasOwn(value.specification.fields, name))) throw new Error("hybrid_method_input_inheritance_mismatch")
    }
    if (outputs.some((path) => pathPrefix(path, value.outputPath) || pathPrefix(value.outputPath, path))) {
      throw new Error("hybrid_method_output_path_conflict")
    }
    outputs.push(value.outputPath)
    if (target?.type === "array" && value.outputPath.every((part) => typeof part === "string")) {
      samplePaths.push(value.outputPath)
    }
  }
  const countPaths = derivedCountPaths(request.plan.resultSpec, samplePaths, source.output)
  validateOutputOrigins(contract.schema, source.output, input, request.runtimeInputSchema, [...outputs, ...countPaths])
  const schema = representativeOutputSchema(contract.schema, samplePaths, countPaths)
  return { output: parseTaskValue({ ...contract, schema }, source.output), samplePaths, countPaths }
}

function assemblyMethodRefs(context: ReturnType<typeof naturalSourceContext>, facts: ReturnType<typeof methodFacts>,
  schema: ValueSchema, done: z.infer<typeof actionSchema>) {
  const { ordinary: request } = context
  const matches = request.trace.observations.flatMap(observation => observation.facts
    .filter(fact => fact.kind === "verified_output_assembly").map(fact => ({ observation, fact })))
  if (matches.length !== 1 || matches[0]!.observation.id !== done.postObservationRef) {
    throw new Error("hybrid_method_output_assembly_required")
  }
  const { observation, fact } = matches[0]!, assembly = hybridOutputAssemblyEvidenceSchema.parse(fact.value)
  context.assertFact(fact, observation.id)
  const finalResult = z.object({ digest: hash }).passthrough().parse(request.trace.finalResultRef)
  if (!isDeepStrictEqual(assembly.schema, schema) || assembly.outputDigest !== finalResult.digest) {
    throw new Error("hybrid_method_output_assembly_mismatch")
  }
  const selected: string[] = []
  for (const field of assembly.fields) {
    const binding = field.binding
    if (binding.source !== "node") continue
    const sources = facts.filter(candidate => {
      const value = methodFactSchema.parse(candidate.raw)
      return value.actionRef === binding.nodeId && isDeepStrictEqual(value.readPath, binding.path)
        && isDeepStrictEqual(value.outputPath, field.path)
    })
    if (!sources.length && request.plan.resultSpec.mode === "data" && request.plan.resultSpec.derivations.some(derivation =>
      binding.nodeId === `result-${derivation.producerRef}` && !binding.path.length
      && request.plan.resultSpec.mode === "data" && request.plan.resultSpec.fields.some(target =>
        target.producerRef === derivation.producerRef && isDeepStrictEqual(target.path, field.path)))) continue
    if (sources.length !== 1 || selected.includes(sources[0]!.reference)) {
      throw new Error("hybrid_method_output_assembly_ambiguous")
    }
    selected.push(sources[0]!.reference)
  }
  return selected
}

function validateOutputOrigins(schema: ValueSchema, output: JsonValue, input: JsonValue | undefined,
  inputSchema: ValueSchema, observed: ValuePath[]) {
  const visit = (value: JsonValue, target: ValueSchema, path: ValuePath) => {
    if (observed.some((owned) => pathPrefix(owned, path))) return
    if (contractOwnsValue(target, value)) return
    // WHY：单项方法只能继承同一输入的同一路径；相同值、不同记录或模型填值均不能证明来源。
    if (input !== undefined && requiredInputPath(inputSchema, path) && isDeepStrictEqual(schemaAtPath(inputSchema, path), target)) {
      try { if (isDeepStrictEqual(readPath(input, path), value)) return } catch { /* 缺字段不是来源证明。 */ }
    }
    if (target.type === "object" && value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length) {
      for (const [name, child] of Object.entries(value)) visit(child, target.properties[name]!, [...path, name])
      return
    }
    throw new Error("hybrid_method_output_origin_unverified")
  }
  visit(output, schema, [])
}

function requiredInputPath(schema: ValueSchema, path: ValuePath) {
  let current = schema
  for (const part of path) {
    if (typeof part === "string" && current.type === "object" && current.required.includes(part)) current = current.properties[part]!
    else if (typeof part === "number" && current.type === "array" && (current.minItems ?? 0) > part) current = current.items
    else return false
  }
  return current !== undefined
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
    ? referencedMethodArgs(action, value, request, facts) : contentMethodArgs(action.args, value, request)
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
  const record = source?.type === "array" ? source.items : source
  if (record?.type === "object") {
    for (const [name, field] of Object.entries(value.specification.fields)) {
      if (field.allowMissing === true && record.required.includes(name)) {
        throw new Error("hybrid_method_missing_policy_mismatch")
      }
    }
    const key = value.specification.keyField
    if (key && (source?.type !== "array" || key !== "__batRecordKey" || record.properties[key]?.type !== "string"
      || !record.required.includes(key) || Object.hasOwn(args.fields, key))) {
      throw new Error("hybrid_method_record_key_invalid")
    }
  }
  // WHY：标量数组由一个容器中的多值字段读取；容器预算为1，值预算仍独立且严格。
  const scalarArray = source?.type === "array" && source.items.type !== "object"
    && isDeepStrictEqual(value.readPath, ["value"]) && value.specification.outputSchema.type === "object"
  if (source?.type === "array" && (source.maxItems !== (args.take ?? args.maxItems ?? 300)
    || value.specification.maxItems !== (scalarArray ? 1 : args.maxItems ?? 300)
    || scalarArray && value.specification.fields.value?.maxValues !== source.maxItems
    || value.specification.take !== args.take)) {
    throw new Error("hybrid_method_read_budget_mismatch")
  }
  return args
}

function validateMethodField(field: Record<string, JsonValue>, actual: Record<string, unknown>) {
  const defaults: Record<string, JsonValue> = { attribute: null, optionalAttribute: false, resolveUrl: false,
    textSource: "rendered", textPrefix: null, textSuffix: null, normalizeWhitespace: false, normalizePresentation: false,
    ordinal: false, valueSource: null, parts: null }
  const allowed = new Set(["selector", ...Object.keys(defaults)])
  if (Object.keys(field).some((key) => !allowed.has(key)) || field.selector !== actual.selector
    || Object.entries(defaults).some(([key, fallback]) => !isDeepStrictEqual(field[key] ?? fallback, actual[key] ?? fallback))) {
    throw new Error("hybrid_method_field_evidence_mismatch")
  }
}

function contentMethodArgs(raw: JsonValue, value: MethodFact, request: MethodRequest): MethodArgs {
  if (value.specification.entryField) return entryMethodArgs(raw, value, request)
  const capture = Object.values(value.specification.fields).some(field => field.contentSource === "page-content")
  if (!capture) {
    const schema = request.plan.resultSpec.mode === "data" ? request.plan.resultSpec.schema : { type: "null" as const }
    const paths = contractReadPaths(schema)
    const args = raw && typeof raw === "object" && !Array.isArray(raw) && !Object.hasOwn(raw, "outputPath") && paths.length === 1
      ? { ...raw, outputPath: paths[0] } : raw
    return methodArgsSchema.parse(args)
  }
  const selected = z.union([z.object({ container: z.string().min(1) }).strict(),
    z.object({ regions: z.string().min(1), regionMode: z.literal("selected-regions").optional() }).strict()]).parse(raw)
  const args = { container: "regions" in selected ? selected.regions : selected.container }
  const confirmedContent = isContentResult(request.plan.resultSpec)
    || request.requirement.text.split(/\r?\n/u).some(line => line.trim() === "- 交付：页面内容")
  if (value.specification.contentRegion !== ("regions" in selected ? selected.regionMode ?? "common-ancestor" : undefined)
    || !confirmedContent || !isDeepStrictEqual(value.specification.outputSchema, contentValueSchema)
    || !isDeepStrictEqual(value.outputPath, []) || !isDeepStrictEqual(value.readPath, [])
    || value.specification.maxItems !== 1 || value.specification.inheritFields?.length
    || value.specification.take !== undefined || value.specification.keyField !== undefined
    || !isDeepStrictEqual(Object.keys(value.specification.fields), ["content"])) {
    throw new Error("hybrid_method_capture_contract_invalid")
  }
  const field = value.specification.fields.content!
  if (field.contentSource !== "page-content" || field.selector !== ":scope" || field.attribute !== null
    || field.valueType !== "string" || field.multiple || field.allowMissing) {
    throw new Error("hybrid_method_capture_contract_invalid")
  }
  return { ...args, outputPath: [], fields: { content: { selector: ":scope" } }, maxItems: 1 }
}

function entryMethodArgs(raw: JsonValue, value: MethodFact, request: MethodRequest): MethodArgs {
  const args = z.union([
    z.object({ container: z.string().min(1), take: z.number().int().min(1).max(300).optional() }).strict(),
    z.object({ indices: z.array(z.number().int().positive()).min(1).max(300),
      take: z.number().int().min(1).max(300).optional() }).strict(),
  ]).parse(raw)
  const container = "indices" in args ? nativeEntryContainer(args.indices, value, request) : args.container
  const schema = value.specification.outputSchema, confirmed = request.plan.resultSpec
  const field = value.specification.entryField!
  if (schema.type !== "array" || schema.items.type !== "object" || confirmed.mode !== "data"
    || confirmed.schema.type !== "array" || !isDeepStrictEqual(schema.items, confirmed.schema.items)
    || !isDeepStrictEqual(schema.items.properties[field], elementEntryValueSchema)
    || !isDeepStrictEqual(value.specification.fields, {}) || value.specification.maxItems !== 300
    || value.specification.requireComplete !== true || value.specification.keyField !== "__batRecordKey"
    || !isDeepStrictEqual(value.outputPath, []) || !isDeepStrictEqual(value.readPath, [])
    || value.specification.take !== (args.take ?? confirmed.schema.maxItems)
    || schema.maxItems !== value.specification.take) throw new Error("hybrid_entry_method_invalid")
  return { container, take: value.specification.take, outputPath: [], fields: {}, maxItems: 300 }
}

function nativeEntryContainer(indices: number[], value: MethodFact, request: MethodRequest) {
  const action = request.trace.actions.find(item => item.id === value.actionRef)
  const post = request.trace.observations.find(item => item.id === action?.postObservationRef)
  const facts = post?.facts.filter(fact => fact.kind === "native_entry_selection"
    && fact.value !== null && typeof fact.value === "object" && !Array.isArray(fact.value)
    && fact.value.actionRef === value.actionRef) ?? []
  if (facts.length !== 1) throw new Error("hybrid_entry_selection_missing")
  const fact = facts[0]!, selection = z.object({ actionRef: z.string(),
    indices: z.array(z.number().int().positive()).min(1).max(300),
    backendNodeIds: z.array(z.number().int().positive()).min(1).max(300),
    selectedBackendNodeIds: z.array(z.number().int().positive()).min(1).max(300).nullable().optional(),
    ancestorSteps: z.array(z.number().int().min(0)).min(1).max(300).nullable().optional(),
    container: z.string().min(1).max(2000), targetId: z.string(), urlDigest: hash,
    documentRootId: z.number().int().positive(), containerIdsDigest: hash }).strict().parse(fact.value)
  if (!isDeepStrictEqual(selection.indices, indices) || new Set(indices).size !== indices.length
    || selection.backendNodeIds.length !== indices.length || new Set(selection.backendNodeIds).size !== indices.length
    || selection.selectedBackendNodeIds != null && (selection.selectedBackendNodeIds.length !== indices.length
      || new Set(selection.selectedBackendNodeIds).size !== indices.length
      || selection.ancestorSteps?.length !== indices.length)
    || selection.targetId !== value.targetId || selection.urlDigest !== value.urlDigest
    || selection.documentRootId !== value.documentRootId || selection.containerIdsDigest !== value.containerIdsDigest
    || selection.container !== value.specification.container || !fact.sourceRefs.length
    || fact.sourceRefs.some(ref => ref.digest !== digestJson({ kind: fact.kind, value: fact.value }))) {
    throw new Error("hybrid_entry_selection_mismatch")
  }
  return selection.container
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
  if (specification.take !== undefined && (coverage.matched === undefined
    || coverage.matched > specification.maxItems || coverage.total !== Math.min(coverage.matched, specification.take))) {
    throw new Error("hybrid_method_take_coverage_mismatch")
  }
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
