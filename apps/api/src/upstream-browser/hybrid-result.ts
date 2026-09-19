import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { valueBindingSchema, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { materializeOutputAssembly, type MaterializedOutput } from "./hybrid-output.js"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"
import { hybridNaturalRequestSchema, hybridOutputAssemblySchema, hybridResultBindingSchema,
  hybridResultBranchSchema, type HybridCompilation, type HybridSegment } from "./hybrid-schema.js"

type NaturalCompilation = Extract<HybridCompilation, { compilerVersion: "bat-hybrid/2" }>

export function materializeNaturalResult(input: { compilation: NaturalCompilation;
  request: z.infer<typeof hybridNaturalRequestSchema>; payload: ReturnType<typeof naturalPayloadContext>;
  outputSchema: ValueSchema; rewrite: (binding: ValueBinding) => ValueBinding }): MaterializedOutput | null {
  const { compilation, request, payload, outputSchema, rewrite } = input
  const assembly = compilation.outputAssembly, resultBinding = compilation.resultBinding
  if (request.plan.resultSpec.mode === "execution") {
    if (assembly || resultBinding || outputSchema.type !== "null") throw new Error("hybrid_execution_result_binding_forbidden")
    return null
  }
  if (!assembly || !resultBinding) throw new Error("hybrid_natural_result_binding_missing")
  assertOutputAssembly(assembly, compilation, request, payload, outputSchema)
  assertResultBinding(resultBinding, assembly, request, compilation)
  const branches = (compilation.resultBranches ?? []).map((raw) => assertResultBranch(
    hybridResultBranchSchema.parse(raw), resultBinding, request, compilation))
  const writeVariable = branches.length ? "result" : undefined
  const primary = materializeOutputAssembly({ fields: resultBinding.assignments.map((item) => ({
    path: item.to, binding: item.from })), schema: resultBinding.schema }, rewrite, writeVariable ? { writeVariable } : {})
  return { ...primary, alternates: branches.map((branch) => ({ terminalId: branch.falseTerminalId,
    ...materializeOutputAssembly({ fields: branch.falseResult.assignments.map((item) => ({
      path: item.to, binding: item.from })), schema: branch.falseResult.schema }, rewrite, { idPrefix: branch.id,
      terminalId: "completed", ...(writeVariable ? { writeVariable } : {}) }) })) }
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
  assertAssignmentSchemas(branch.falseResult, compilation)
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
  request: z.infer<typeof hybridNaturalRequestSchema>, compilation: NaturalCompilation) {
  const binding = hybridResultBindingSchema.parse(raw), spec = request.plan.resultSpec
  if (spec.mode !== "data" || !isDeepStrictEqual(binding.schema, spec.schema)
    || binding.sourceRef !== assembly.sourceRef || !isDeepStrictEqual(binding.proofRefs, assembly.proofRefs)) {
    throw new Error("hybrid_natural_result_binding_mismatch")
  }
  assertDistinctPaths(binding.assignments.map((item) => item.to))
  const expected = assembly.fields.map((field) => {
    const owners = spec.fields.filter((owner) => pathPrefix(owner.path, field.path))
    if (owners.length !== 1) throw new Error("hybrid_natural_result_binding_owner_ambiguous")
    return { to: field.path, from: field.binding, producerRef: owners[0]!.producerRef }
  })
  if (!isDeepStrictEqual(binding.assignments, expected)) throw new Error("hybrid_natural_result_binding_assignments_mismatch")
  if (spec.mode === "data") for (const derivation of spec.derivations) {
    const targets = binding.assignments.filter((item) => item.producerRef === derivation.producerRef)
    if (targets.length !== 1 || targets[0]!.from.source !== "node"
      || targets[0]!.from.nodeId !== `result-${derivation.producerRef}` || targets[0]!.from.path.length) {
      throw new Error("hybrid_natural_result_derivation_mismatch")
    }
  }
  assertAssignmentSchemas(binding, compilation)
}

function assertAssignmentSchemas(binding: z.infer<typeof hybridResultBindingSchema>, compilation: NaturalCompilation) {
  for (const assignment of binding.assignments) {
    const targetSchema = schemaAtPath(binding.schema, assignment.to)
    if (assignment.from.source === "constant") {
      if (!targetSchema || targetSchema.type !== "array" || !Array.isArray(assignment.from.value)
        || assignment.from.value.length !== 0) throw new Error("hybrid_natural_result_binding_schema_mismatch")
      continue
    }
    const sourceSchema = outputBindingSchema(assignment.from, compilation)
    if (!targetSchema || !isDeepStrictEqual(sourceSchema, targetSchema)) {
      throw new Error("hybrid_natural_result_binding_schema_mismatch")
    }
  }
}

function assertOutputAssembly(raw: unknown, compilation: NaturalCompilation,
  request: z.infer<typeof hybridNaturalRequestSchema>, payload: ReturnType<typeof naturalPayloadContext>, outputSchema: ValueSchema) {
  const assembly = hybridOutputAssemblySchema.parse(raw)
  if (!isDeepStrictEqual(assembly.schema, outputSchema)) throw new Error("hybrid_natural_output_schema_mismatch")
  assertDistinctPaths(assembly.fields.map((field) => field.path))
  const matches = request.trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.id === assembly.sourceRef && fact.kind === "verified_output_assembly")
    .map((fact) => ({ observation, fact })))
  if (matches.length !== 1) throw new Error("hybrid_natural_output_fact_missing")
  const { observation, fact } = matches[0]!, value = hybridOutputAssemblySchema.pick({ fields: true, schema: true }).extend({
    outputDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(fact.value)
  payload.assertFact(fact, observation.id)
  const finalResult = z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough().safeParse(request.trace.finalResultRef)
  if (!finalResult.success || value.outputDigest !== finalResult.data.digest
    || !isDeepStrictEqual(value.fields, assembly.fields) || !isDeepStrictEqual(value.schema, assembly.schema)
    || !isDeepStrictEqual(fact.sourceRefs, assembly.proofRefs)) throw new Error("hybrid_natural_output_fact_mismatch")
  for (const field of assembly.fields) {
    const sourceSchema = outputBindingSchema(field.binding, compilation)
    const targetSchema = schemaAtPath(assembly.schema, field.path)
    if (!targetSchema || !isDeepStrictEqual(sourceSchema, targetSchema)) {
      throw new Error("hybrid_natural_output_field_schema_mismatch")
    }
  }
}

function outputBindingSchema(binding: ValueBinding, compilation: NaturalCompilation) {
  if (binding.source !== "node") throw new Error("hybrid_natural_output_binding_dynamic_required")
  const direct = compilation.segments.find((item) => item.id === binding.nodeId)
  if (direct?.kind === "deterministic" && direct.operation.name === "data.transform") {
    const selected = direct.outputs[0] && schemaAtPath(direct.outputs[0].schema, binding.path)
    if (!selected) throw new Error("hybrid_natural_output_source_path_missing")
    return selected
  }
  const row = compilation.coverage.find((item) => item.actionRef === binding.nodeId)
  if (row?.disposition !== "compiled" || !row.ownerSegmentId) throw new Error("hybrid_natural_output_node_missing")
  const segment = compilation.segments.find((item) => item.id === row.ownerSegmentId)
  const schema = segment?.kind === "explicit_llm" ? segment.outputSchema : segment?.outputs[0]?.schema
  const selected = schema && schemaAtPath(schema, binding.path)
  if (!selected) throw new Error("hybrid_natural_output_source_path_missing")
  return selected
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
