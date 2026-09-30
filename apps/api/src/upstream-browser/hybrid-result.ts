import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { parseTaskValue, valueBindingSchema, type JsonValue, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { materializeOutputAssembly, type MaterializedOutput } from "./hybrid-output.js"
import type { BindingSchema } from "./hybrid-output-identity.js"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"
import { repeatForBinding, type ValidatedNaturalRepeat } from "./hybrid-natural-repeat.js"
import { hybridNaturalRequestSchema, hybridOutputAssemblyEvidenceSchema, hybridOutputAssemblySchema, hybridResultBindingSchema,
  hybridResultBranchSchema, readSpecificationSchema, type HybridCompilation, type HybridSegment } from "./hybrid-schema.js"

type NaturalCompilation = Extract<HybridCompilation, { compilerVersion: "bat-hybrid/2" }>

export function materializeNaturalResult(input: { compilation: NaturalCompilation;
  request: z.infer<typeof hybridNaturalRequestSchema>; payload: ReturnType<typeof naturalPayloadContext>;
  outputSchema: ValueSchema; repeats?: ValidatedNaturalRepeat[];
  rewrite: (binding: ValueBinding) => ValueBinding; sourceSchema?: BindingSchema }): MaterializedOutput | null {
  const { compilation, request, payload, outputSchema, rewrite } = input
  const repeats = input.repeats ?? []
  const assembly = compilation.outputAssembly, resultBinding = compilation.resultBinding
  if (request.plan.resultSpec.mode === "execution") {
    if (assembly || resultBinding || outputSchema.type !== "null") throw new Error("hybrid_execution_result_binding_forbidden")
    return null
  }
  if (!assembly || !resultBinding) throw new Error("hybrid_natural_result_binding_missing")
  assertOutputAssembly(assembly, compilation, request, payload, outputSchema, repeats)
  assertResultBinding(resultBinding, assembly, request, compilation, repeats)
  const branches = (compilation.resultBranches ?? []).map((raw) => assertResultBranch(
    hybridResultBranchSchema.parse(raw), resultBinding, request, compilation))
  const writeVariable = branches.length ? "result" : undefined
  const primary = materializeOutputAssembly({ fields: resultBinding.assignments.map((item) => ({
    path: item.to, binding: item.from })), schema: resultBinding.schema }, (binding) => {
      const repeated = repeatForBinding(repeats, binding)
      return repeated ? { source: "variable", name: repeated.variable, path: [] } : rewrite(binding)
    }, { sourceSchema: input.sourceSchema, ...(writeVariable ? { writeVariable } : {}) })
  return { ...primary, alternates: branches.map((branch) => ({ terminalId: branch.falseTerminalId,
    ...materializeOutputAssembly({ fields: branch.falseResult.assignments.map((item) => ({
      path: item.to, binding: item.from })), schema: branch.falseResult.schema }, rewrite, { idPrefix: branch.id,
      terminalId: "completed", sourceSchema: input.sourceSchema, ...(writeVariable ? { writeVariable } : {}) }) })) }
}

function assertResultBranch(branch: z.infer<typeof hybridResultBranchSchema>,
  resultBinding: z.infer<typeof hybridResultBindingSchema>, request: z.infer<typeof hybridNaturalRequestSchema>,
  compilation: NaturalCompilation) {
  const edge = request.plan.resultSpec.mode === "data"
    ? request.plan.resultSpec.edgeCases.find((item) => item.controlRef === branch.controlRef) : undefined
  const sourceIndex = compilation.segments.findIndex((item) => item.id === branch.sourceSegmentId)
  const consumerIndex = compilation.segments.findIndex((item) => item.id === branch.consumerSegmentId)
  const source = compilation.segments[sourceIndex], consumer = compilation.segments[consumerIndex]
  const missingProducerIndex = branch.missingProducerSegmentId
    ? compilation.segments.findIndex((item) => item.id === branch.missingProducerSegmentId) : -1
  const missingProducer = missingProducerIndex >= 0 ? compilation.segments[missingProducerIndex] : undefined
  const expectedSkipped = compilation.segments.slice(consumerIndex).map((item) => item.id)
  const sourceRow = compilation.coverage.find((item) => item.actionRef === branch.sourceActionRef)
  const incoming = compilation.controlGraph.edges.filter((item) => item.to === branch.id)
  const branchEdges = compilation.controlGraph.edges.filter((item) => item.from === branch.id)
  const missingProducerValid = branch.missingProducerSegmentId === undefined || (
    missingProducerIndex === sourceIndex - 1 && missingProducer?.kind === "deterministic"
    && missingProducer.operation.name === "browser.workflow-step" && missingProducer.target !== null
    && missingProducer.postconditions.some((item) => item.kind === "read_fields"
      && item.consumerRef === branch.sourceSegmentId)
    && compilation.controlGraph.edges.some((item) => item.from === branch.missingProducerSegmentId
      && item.outcome === "success" && item.to === branch.sourceSegmentId)
    && compilation.controlGraph.edges.some((item) => item.from === branch.missingProducerSegmentId
      && item.outcome === "missing" && item.to === branch.falseTerminalId))
  if (!edge || sourceIndex < 0 || consumerIndex <= sourceIndex || sourceRow?.ownerSegmentId !== branch.sourceSegmentId
    || source?.kind !== "deterministic" || source.operation.name !== "browser.read-fields"
    || consumer?.kind !== "deterministic" || !isDeepStrictEqual(branch.skippedSegmentIds, expectedSkipped)
    || branch.predicate.value.source !== "node" || branch.predicate.value.nodeId !== branch.sourceSegmentId
    || branch.predicate.minimum.source !== "constant" || typeof branch.predicate.minimum.value !== "number"
    || branch.predicate.minimum.value < 1 || !guardedConsumerBinding(consumer, source.outputs[0]?.schema, branch)
    || incoming.length !== 1 || branchEdges.length !== 2
    || !branchEdges.some((item) => item.outcome === "true" && item.to === branch.consumerSegmentId)
    || !branchEdges.some((item) => item.outcome === "false" && item.to === branch.falseTerminalId)
    || !missingProducerValid) {
    throw new Error("hybrid_natural_result_branch_mismatch")
  }
  const skippedActions = new Set(compilation.coverage.filter((item) => item.ownerSegmentId
    && branch.skippedSegmentIds.includes(item.ownerSegmentId)).map((item) => item.actionRef))
  const collectionPath = branch.predicate.value.source === "node" ? branch.predicate.value.path : []
  const expected = resultBinding.assignments.filter((item) => item.from.source !== "node"
    || !skippedActions.has(item.from.nodeId)).map((item) => branch.missingProducerSegmentId
      && item.from.source === "node" && item.from.nodeId === branch.sourceActionRef
      && isDeepStrictEqual(item.from.path, collectionPath)
      ? { ...item, from: { source: "constant" as const, value: [] } } : item)
  if (!expected.length || !isDeepStrictEqual(branch.falseResult, { ...resultBinding, assignments: expected })) {
    throw new Error("hybrid_natural_result_branch_output_mismatch")
  }
  assertRequiredCoverage(branch.falseResult.schema, branch.falseResult.assignments.map((item) => item.to))
  assertAssignmentSchemas(branch.falseResult, compilation, request.runtimeInputSchema)
  return branch
}

function guardedConsumerBinding(consumer: Extract<HybridSegment, { kind: "deterministic" }>, sourceSchema: ValueSchema | undefined,
  branch: z.infer<typeof hybridResultBranchSchema>) {
  if (!sourceSchema || branch.predicate.value.source !== "node" || branch.predicate.minimum.source !== "constant"
    || typeof branch.predicate.minimum.value !== "number") return false
  const collection = branch.predicate.value.path, minimum = branch.predicate.minimum.value
  if (schemaAtPath(sourceSchema, collection)?.type !== "array") return false
  return consumer.bindings.some((item) => {
    const parsed = valueBindingSchema.safeParse("binding" in item ? item.binding : undefined)
    return parsed.success && parsed.data.source === "node" && parsed.data.nodeId === branch.sourceActionRef
      && pathPrefix(collection, parsed.data.path) && parsed.data.path[collection.length] === minimum - 1
  })
}

function assertResultBinding(raw: unknown, assembly: z.infer<typeof hybridOutputAssemblySchema>,
  request: z.infer<typeof hybridNaturalRequestSchema>, compilation: NaturalCompilation, repeats: ValidatedNaturalRepeat[]) {
  const binding = hybridResultBindingSchema.parse(raw), spec = request.plan.resultSpec
  if (spec.mode !== "data" || !isDeepStrictEqual(binding.schema, spec.schema)
    || binding.sourceRef !== assembly.sourceRef || !isDeepStrictEqual(binding.proofRefs, assembly.proofRefs)) {
    throw new Error("hybrid_natural_result_binding_mismatch")
  }
  assertDistinctPaths(binding.assignments.map((item) => item.to))
  const expected: Array<{ to: Array<string | number>; from: ValueBinding; producerRef: string }> = []
  for (const field of assembly.fields) {
    const owners = spec.fields.filter((owner) => pathPrefix(owner.path, field.path))
    if (owners.length > 1) throw new Error("hybrid_natural_result_binding_owner_ambiguous")
    if (owners.length === 1) {
      expected.push({ to: field.path, from: field.binding, producerRef: owners[0]!.producerRef })
      continue
    }
    const covered = spec.fields.filter((owner) => pathPrefix(field.path, owner.path))
    if (!covered.length || field.binding.source !== "node") {
      throw new Error("hybrid_natural_result_binding_owner_ambiguous")
    }
    // WHY：完整根对象是已验证来源；host 必须逐字段重算子路径，不能把同一来源误判为所有权冲突。
    const source = field.binding
    for (const owner of covered) expected.push({ to: owner.path,
      from: { ...source, path: [...source.path, ...owner.path.slice(field.path.length)] },
      producerRef: owner.producerRef })
  }
  if (!isDeepStrictEqual(binding.assignments, expected)) throw new Error("hybrid_natural_result_binding_assignments_mismatch")
  if (spec.mode === "data") for (const derivation of spec.derivations) {
    const targets = binding.assignments.filter((item) => item.producerRef === derivation.producerRef)
    if (targets.length !== 1 || targets[0]!.from.source !== "node"
      || targets[0]!.from.nodeId !== `result-${derivation.producerRef}` || targets[0]!.from.path.length) {
      throw new Error("hybrid_natural_result_derivation_mismatch")
    }
  }
  assertAssignmentSchemas(binding, compilation, request.runtimeInputSchema, repeats)
}

function assertAssignmentSchemas(binding: z.infer<typeof hybridResultBindingSchema>, compilation: NaturalCompilation,
  runtimeInputSchema: ValueSchema, repeats: ValidatedNaturalRepeat[] = []) {
  for (const assignment of binding.assignments) {
    const targetSchema = schemaAtPath(binding.schema, assignment.to)
    if (assignment.from.source === "constant") {
      if (!targetSchema) throw new Error("hybrid_natural_result_binding_schema_mismatch")
      assertSchemaValue(targetSchema, assignment.from.value)
      continue
    }
    const sourceSchema = outputBindingSchema(assignment.from, compilation, runtimeInputSchema)
    if (!targetSchema || !executableSchemasCompatible(sourceSchema, targetSchema, Boolean(repeatForBinding(repeats, assignment.from)))) {
      throw new Error("hybrid_natural_result_binding_schema_mismatch")
    }
  }
}

function assertOutputAssembly(raw: unknown, compilation: NaturalCompilation,
  request: z.infer<typeof hybridNaturalRequestSchema>, payload: ReturnType<typeof naturalPayloadContext>,
  outputSchema: ValueSchema, repeats: ValidatedNaturalRepeat[]) {
  const assembly = hybridOutputAssemblySchema.parse(raw)
  if (!isDeepStrictEqual(assembly.schema, outputSchema)) throw new Error("hybrid_natural_output_schema_mismatch")
  assertDistinctPaths(assembly.fields.map((field) => field.path))
  const matches = request.trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.id === assembly.sourceRef && fact.kind === "verified_output_assembly")
    .map((fact) => ({ observation, fact })))
  if (matches.length !== 1) throw new Error("hybrid_natural_output_fact_missing")
  const { observation, fact } = matches[0]!, value = hybridOutputAssemblyEvidenceSchema.parse(fact.value)
  payload.assertFact(fact, observation.id)
  const executableFields = value.fields.map(({ sampleValue: _sampleValue, ...field }) => field)
  const finalResult = z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough().safeParse(request.trace.finalResultRef)
  if (!finalResult.success || value.outputDigest !== finalResult.data.digest
    || !isDeepStrictEqual(executableFields, assembly.fields) || !isDeepStrictEqual(value.schema, assembly.schema)
    || !isDeepStrictEqual(fact.sourceRefs, assembly.proofRefs)) throw new Error("hybrid_natural_output_fact_mismatch")
  for (const evidenceField of value.fields) {
    const { sampleValue: _sampleValue, ...field } = evidenceField
    const targetSchema = schemaAtPath(assembly.schema, field.path)
    if (!targetSchema) throw new Error("hybrid_natural_output_field_schema_mismatch")
    const hasSample = Object.hasOwn(evidenceField, "sampleValue")
    if (field.binding.source === "node") {
      if (hasSample) throw new Error("hybrid_natural_output_dynamic_sample_forbidden")
    } else {
      if (!hasSample) throw new Error("hybrid_natural_output_sample_proof_missing")
      assertSchemaValue(targetSchema, evidenceField.sampleValue as JsonValue)
      if (field.binding.source === "constant" && (!isDeepStrictEqual(field.binding.value, evidenceField.sampleValue)
        || typeof field.binding.value !== "string" || !field.binding.value
        || !request.requirement.text.includes(field.binding.value))) {
        throw new Error("hybrid_natural_output_constant_authority_mismatch")
      }
    }
    const sourceSchema = field.binding.source === "constant" ? targetSchema
      : outputBindingSchema(field.binding, compilation, request.runtimeInputSchema)
    const repeated = repeatForBinding(repeats, field.binding)
    if (!targetSchema || !executableSchemasCompatible(sourceSchema, targetSchema, Boolean(repeated))) {
      throw new Error("hybrid_natural_output_field_schema_mismatch")
    }
    if (!repeated) assertObservedReadCardinality(field.binding, sourceSchema, targetSchema, request)
    assertObservedCountCardinality(field.binding, targetSchema, request, compilation)
  }
}

/** WHY：准备样本的数量豁免不能成为正式绑定规则；互斥值域没有任何合法运行结果。 */
function executableSchemasCompatible(source: ValueSchema | null | undefined, target: ValueSchema, repeated = false) {
  if (source?.type !== "array" || target.type !== "array") return isDeepStrictEqual(source, target)
  const { minItems: sourceMin = 0, maxItems: sourceMax = Infinity, ...sourceShape } = source
  const { minItems: targetMin = 0, maxItems: targetMax = Infinity, ...targetShape } = target
  if (!isDeepStrictEqual(sourceShape, targetShape)) return false
  // WHY：经过完整重复方法证据校验后，页内数量不代表最终数量；最终 assembly 仍使用原严格合同。
  if (repeated) return true
  if (Math.max(sourceMin, targetMin) > Math.min(sourceMax, targetMax)) {
    throw new Error("hybrid_natural_output_cardinality_disjoint")
  }
  return true
}

function assertObservedReadCardinality(binding: ValueBinding, source: ValueSchema | null | undefined,
  target: ValueSchema, request: z.infer<typeof hybridNaturalRequestSchema>) {
  if (source?.type !== "array" || target.type !== "array") return
  const total = observedReadTotal(binding, source, request)
  if (total === undefined) return
  if (total < (target.minItems ?? 0)) throw new Error("hybrid_natural_output_collection_incomplete")
  // WHY：直接绑定保留完整当前集合；目标要求的选择操作必须真实存在，不能靠小样本遮住超量。
  if (total > (target.maxItems ?? Infinity)) throw new Error("hybrid_natural_output_selection_required")
}

function assertObservedCountCardinality(binding: ValueBinding, target: ValueSchema,
  request: z.infer<typeof hybridNaturalRequestSchema>, compilation: NaturalCompilation) {
  if (binding.source !== "node" || binding.path.length || target.type !== "integer") return
  const segment = compilation.segments.find((item) => item.id === binding.nodeId)
  if (segment?.kind !== "deterministic" || segment.operation.name !== "data.transform"
    || segment.operation.dataOperation !== "count" || segment.bindings.length !== 1) return
  const decision = segment.bindings[0]!
  const selected = valueBindingSchema.safeParse("binding" in decision ? decision.binding : undefined)
  if (!selected.success) throw new Error("hybrid_natural_output_count_binding_invalid")
  const total = observedReadTotal(selected.data, outputBindingSchema(selected.data, compilation, request.runtimeInputSchema), request)
  if (total !== undefined && (total < (target.minimum ?? -Infinity) || total > (target.maximum ?? Infinity))) {
    throw new Error("hybrid_natural_output_count_cardinality_mismatch")
  }
}

function observedReadTotal(binding: ValueBinding, source: ValueSchema | null | undefined,
  request: z.infer<typeof hybridNaturalRequestSchema>) {
  if (binding.source !== "node" || source?.type !== "array") return undefined
  const facts = request.trace.observations.flatMap((observation) => observation.facts)
    .filter((fact) => fact.kind === "verified_natural_read" && fact.value !== null
      && typeof fact.value === "object" && !Array.isArray(fact.value)
      && fact.value.actionRef === binding.nodeId && fact.value.coverage !== null && fact.value.coverage !== undefined)
  for (const fact of facts) {
    const value = z.object({ specification: readSpecificationSchema, readPath: z.array(z.string()),
      coverage: z.object({ scope: z.literal("current_dom_matches"), total: z.number().int().nonnegative(),
        runtimeTruncated: z.boolean() }).passthrough() }).passthrough().parse(fact.value)
    if (!isDeepStrictEqual(value.readPath, binding.path)
      || !value.specification.requireComplete || value.coverage.runtimeTruncated) continue
    if (!isDeepStrictEqual(schemaAtPath(value.specification.outputSchema, value.readPath), source)) {
      throw new Error("hybrid_natural_output_read_schema_mismatch")
    }
    return value.coverage.total
  }
  return undefined
}

function outputBindingSchema(binding: ValueBinding, compilation: NaturalCompilation, runtimeInputSchema: ValueSchema) {
  if (binding.source === "input") {
    const selected = schemaAtPath(runtimeInputSchema, binding.path)
    if (!selected) throw new Error("hybrid_natural_output_source_path_missing")
    return selected
  }
  if (binding.source === "constant") throw new Error("hybrid_natural_output_constant_schema_requires_target")
  if (binding.source !== "node") throw new Error("hybrid_natural_output_binding_source_unsupported")
  const direct = compilation.segments.find((item) => item.id === binding.nodeId)
  if (direct?.kind === "deterministic" && direct.operation.name === "data.transform") {
    const selected = direct.outputs[0] && schemaAtPath(direct.outputs[0].schema, binding.path)
    if (!selected) throw new Error("hybrid_natural_output_source_path_missing")
    return selected
  }
  const row = compilation.coverage.find((item) => item.actionRef === binding.nodeId)
  if (row?.disposition !== "compiled" || !row.ownerSegmentId) throw new Error("hybrid_natural_output_node_missing")
  const segment = compilation.segments.find((item) => item.id === row.ownerSegmentId)
  const schema = segment?.kind === "explicit_llm" ? segment.outputSchema
    : segment?.kind === "function" ? segment.draft.outputSchema : segment?.outputs[0]?.schema
  const selected = schema && schemaAtPath(schema, binding.path)
  if (!selected) throw new Error("hybrid_natural_output_source_path_missing")
  return selected
}

function assertSchemaValue(schema: ValueSchema, value: JsonValue) {
  parseTaskValue({ id: "hybrid-result-evidence", version: 1, dialect: "bat-value-schema/v1", schema }, value)
}

function assertRequiredCoverage(schema: ValueSchema, owners: Array<Array<string | number>>, path: Array<string | number> = []) {
  if (owners.some((owner) => pathPrefix(owner, path))) return
  if (schema.type !== "object") throw new Error("hybrid_natural_result_required_path_missing")
  for (const name of schema.required) {
    const child = schema.properties[name]
    if (!child) throw new Error("hybrid_natural_result_required_path_missing")
    assertRequiredCoverage(child, owners, [...path, name])
  }
}

function schemaAtPath(schema: ValueSchema, path: Array<string | number>): ValueSchema | null {
  let current: ValueSchema | undefined = schema
  for (const part of path) {
    if (typeof part === "string" && current.type === "object") current = current.properties[part]
    else if (typeof part === "number" && current.type === "array") {
      if (current.maxItems !== undefined && part >= current.maxItems) return null
      current = current.items
    } else return null
    if (!current) return null
  }
  return current
}

function assertDistinctPaths(paths: Array<Array<string | number>>) {
  for (let left = 0; left < paths.length; left++) for (let right = left + 1; right < paths.length; right++) {
    if (pathPrefix(paths[left]!, paths[right]!) || pathPrefix(paths[right]!, paths[left]!)) {
      throw new Error("hybrid_natural_output_path_conflict")
    }
  }
}

function pathPrefix(left: Array<string | number>, right: Array<string | number>) {
  return left.length <= right.length && left.every((part, index) => part === right[index])
}
