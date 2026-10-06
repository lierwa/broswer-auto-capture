import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import type { ValueSchema } from "@browser-capture/contracts"
import { naturalBindingFactValueSchema, readSpecificationSchema, type HybridSegment } from "./hybrid-schema.js"
import { hybridNaturalRequestSchema } from "./hybrid-schema.js"

type Read = z.infer<typeof readSpecificationSchema>
type Request = z.infer<typeof hybridNaturalRequestSchema>

/** WHY：数量输入沿原有 ValueBinding 传递；保存的方法只限定读取上限，不冻结样本数量。 */
export function boundReadSpecification(specification: Read, segment: Extract<HybridSegment, { kind: "deterministic" }>,
  request: Request, actionRef: string, outputPath: Array<string | number>) {
  const action = readMethodSource(request, actionRef)
  const pre = request.trace.observations.find(item => item.id === action?.preObservationRef)
  const candidates = pre?.facts.flatMap(item => {
    if (item.kind !== "natural_binding") return []
    const parsed = naturalBindingFactValueSchema.safeParse(item.value)
    return parsed.success && parsed.data.actionRef === action?.id && parsed.data.argumentPath === "take"
      && parsed.data.provenance === "runtime_input" ? [item] : []
  }) ?? []
  if (!segment.bindings.length && !candidates.length) return specification
  const decision = segment.bindings[0]
  if (segment.bindings.length !== 1 || !decision || !("binding" in decision)
    || decision.kind !== "runtime_input" || decision.argumentPath !== "take" || decision.actionRef !== action?.id
    || decision.binding?.source !== "input") throw new Error("hybrid_read_take_binding_invalid")
  let schema: ValueSchema | undefined = request.runtimeInputSchema
  for (const part of decision.binding.path) {
    if (schema?.type !== "object" || typeof part !== "string" || !schema.required.includes(part)) {
      throw new Error("hybrid_read_take_binding_invalid")
    }
    schema = schema.properties[part]
  }
  const fact = candidates.length === 1 && candidates[0]!.id === decision.sourceRef
    ? naturalBindingFactValueSchema.parse(candidates[0]!.value) : null
  let declared: ValueSchema | undefined = request.plan.resultSpec.mode === "data" ? request.plan.resultSpec.schema : undefined
  for (const part of outputPath) declared = declared?.type === "object" && typeof part === "string"
    ? declared.properties[part] : declared?.type === "array" && typeof part === "number" ? declared.items : undefined
  const take = z.object({ take: z.number().int().min(1).max(300) }).passthrough().parse(action?.args).take
  if (schema?.type !== "integer" || (schema.minimum ?? 0) < 1 || !Number.isInteger(schema.maximum)
    || schema.maximum! > 300 || take < schema.minimum! || take > schema.maximum!
    || specification.outputSchema.type !== "array" || declared?.type !== "array"
    || schema.maximum! > (declared.maxItems ?? 300) || schema.maximum! > specification.maxItems || specification.take !== take
    || fact?.provenance !== "runtime_input" || fact.argumentPath !== "take" || fact.actionRef !== action?.id
    || !isDeepStrictEqual(fact.binding, decision.binding)) throw new Error("hybrid_read_take_binding_invalid")
  return { ...specification, outputSchema: { ...specification.outputSchema, maxItems: schema.maximum! } }
}

function readMethodSource(request: Request, actionRef: string) {
  let action = request.trace.actions.find(item => item.id === actionRef)
  while (action) {
    const reference = z.object({ readRef: z.string() }).strict().safeParse(action.args)
    if (!reference.success) return action
    const prior = request.trace.observations.flatMap(item => item.facts)
      .filter(item => item.kind === "verified_natural_read").flatMap(item => {
        const parsed = z.object({ readRef: z.string(), actionRef: z.string() }).passthrough().safeParse(item.value)
        return parsed.success && parsed.data.readRef === reference.data.readRef ? [parsed.data.actionRef] : []
      })
    const source = prior.length === 1 ? request.trace.actions.find(item => item.id === prior[0]) : undefined
    if (!source || source.name !== "bat_read_fields" || source.status !== "succeeded"
      || request.trace.actions.indexOf(source) >= request.trace.actions.indexOf(action)) {
      throw new Error("hybrid_read_take_reference_invalid")
    }
    action = source
  }
  return action
}

export function materializeReadCommand(config: Record<string, unknown>, input: Record<string, unknown>) {
  const { readTakeInput, ...command } = config
  if (readTakeInput === undefined && !Object.hasOwn(input, "take")) return command
  if (readTakeInput !== "take") throw new Error("hybrid_read_take_input_invalid")
  const specification = readSpecificationSchema.parse(command.specification)
  const take = z.number().int().min(1).max(300).parse(input.take)
  if (specification.outputSchema.type !== "array" || take > (specification.outputSchema.maxItems ?? 300)
    || take > specification.maxItems) {
    throw new Error("hybrid_read_take_input_invalid")
  }
  return { ...command, specification: { ...specification, take } }
}
