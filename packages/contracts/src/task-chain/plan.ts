import { z } from "zod"
import { budgetSchema, contractVersionSchema, entityVersionReferenceSchema, identitySchema, keySchema, taskIdentitySchema, textSchema } from "./common.js"
import { completionConditionSchema, valueBindingSchema, valuePathSchema, type ValueBinding } from "./binding.js"
import { invocationModeSchema, predicateBindings } from "./node.js"
import { requirementReferenceSchema } from "./requirement.js"
import { parseTaskValue, taskDataContractSchema, valueSchemaSchema, type TaskDataContract, type ValueSchema } from "./value.js"

const taskPlanBatchAggregateSchema = z.object({
  outputPath: valuePathSchema, stableKeyPath: valuePathSchema.optional(),
  stopAfterInputPath: valuePathSchema.optional(),
}).strict()
const taskPlanInvocationSchema = z.union([invocationModeSchema, z.object({ mode: z.literal("batch"),
  collection: valueBindingSchema, itemVariable: keySchema, stableKeyPath: valuePathSchema,
  // WHY：同一协议版本的早期 batch 记录没有 aggregates；读取时补空数组以保留导出能力，执行门仍会拒绝复跑。
  maxItems: z.number().int().positive(), aggregates: z.array(taskPlanBatchAggregateSchema).default([]) }).strict()])

export const resultSpecSchema = z.discriminatedUnion("mode", [
  z.object({ contractVersion: z.literal("bat-result-spec/v1"), mode: z.literal("execution") }).strict(),
  z.object({
    contractVersion: z.literal("bat-result-spec/v1"), mode: z.literal("data"), schema: valueSchemaSchema,
    fields: z.array(z.object({ path: valuePathSchema, description: textSchema, producerRef: keySchema }).strict()).min(1).max(100),
    derivations: z.array(z.object({ producerRef: keySchema, operation: z.literal("count"),
      sourceProducerRef: keySchema, sourcePath: valuePathSchema }).strict()).max(100).default([]),
    edgeCases: z.array(z.object({ description: textSchema, controlRef: keySchema }).strict()).max(20),
  }).strict().superRefine((spec, context) => {
    const paths = spec.fields.map((field) => field.path)
    for (const [index, path] of paths.entries()) {
      if (schemaAtPath(spec.schema, path) === undefined) {
        context.addIssue({ code: "custom", path: ["fields", index, "path"], message: "result_spec_path_missing" })
      }
      if (paths.some((other, otherIndex) => otherIndex !== index && pathPrefix(path, other))) {
        context.addIssue({ code: "custom", path: ["fields", index, "path"], message: "result_spec_path_conflict" })
      }
    }
    if (!requiredPathsCovered(spec.schema, paths)) {
      context.addIssue({ code: "custom", path: ["fields"], message: "result_spec_required_path_missing" })
    }
    if (!spec.edgeCases.length) {
      const optional = spec.fields.findIndex((field) => pathCrossesOptionalProperty(spec.schema, field.path))
      if (optional >= 0) context.addIssue({ code: "custom", path: ["edgeCases"],
        message: "result_spec_optional_field_edge_case_required" })
    }
    const derived = new Set<string>()
    for (const [index, derivation] of spec.derivations.entries()) {
      const targets = spec.fields.filter((field) => field.producerRef === derivation.producerRef)
      const sources = spec.fields.filter((field) => field.producerRef === derivation.sourceProducerRef
        && canonical(field.path) === canonical(derivation.sourcePath))
      const sourceSchema = schemaAtPath(spec.schema, derivation.sourcePath)
      const targetSchema = targets.length === 1 ? schemaAtPath(spec.schema, targets[0]!.path) : undefined
      if (derived.has(derivation.producerRef) || derivation.producerRef === derivation.sourceProducerRef
        || targets.length !== 1 || sources.length !== 1 || sourceSchema?.type !== "array" || targetSchema?.type !== "integer") {
        context.addIssue({ code: "custom", path: ["derivations", index], message: "result_spec_derivation_invalid" })
      }
      derived.add(derivation.producerRef)
    }
    for (const [index, derivation] of spec.derivations.entries()) {
      if (derived.has(derivation.sourceProducerRef)) {
        context.addIssue({ code: "custom", path: ["derivations", index, "sourceProducerRef"],
          message: "result_spec_derivation_chain_forbidden" })
      }
    }
  }),
])
export type ResultSpec = z.infer<typeof resultSpecSchema>

export const taskPlanEntryUrlsSchema = z.array(z.string().url().refine((value) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol) } catch { return false }
}, "plan_entry_url_protocol_invalid")).min(1).max(32)

export const taskPlanStepSchema = z.object({
  id: keySchema, title: textSchema, goal: textSchema, dependsOn: z.array(keySchema),
  inputContract: taskDataContractSchema, outputContract: taskDataContractSchema,
  input: valueBindingSchema, invocation: taskPlanInvocationSchema,
  chain: entityVersionReferenceSchema, budget: budgetSchema,
  completion: z.array(completionConditionSchema).min(1), risks: z.array(textSchema),
  // 旧计划允许缺失；新的语义计划 schema 会把它提升为必填，禁止从旧输出合同猜测结果形态。
  resultSpec: resultSpecSchema.optional(),
}).strict().superRefine((step, context) => {
  if (!step.resultSpec) return
  if (step.resultSpec.mode === "execution" && step.outputContract.schema.type !== "null") {
    context.addIssue({ code: "custom", path: ["resultSpec"], message: "execution_result_requires_null_output" })
  }
  if (step.resultSpec.mode === "data" && (step.outputContract.schema.type === "null"
    || canonical(step.resultSpec.schema) !== canonical(step.outputContract.schema))) {
    context.addIssue({ code: "custom", path: ["resultSpec", "schema"], message: "data_result_schema_mismatch" })
  }
})
export const taskPlanSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("plan"),
  id: identitySchema, taskId: taskIdentitySchema, version: z.number().int().positive(),
  requirement: requirementReferenceSchema, summary: textSchema,
  // WHY：入口由需求和规划确定，不是用户每次复跑填写的业务输入；optional 只用于读取旧计划。
  entryUrls: taskPlanEntryUrlsSchema.optional(),
  inputContract: taskDataContractSchema, outputContract: taskDataContractSchema,
  steps: z.array(taskPlanStepSchema).min(1).max(100), output: valueBindingSchema, budget: budgetSchema,
  completion: z.array(completionConditionSchema).min(1),
  evidence: z.array(z.object({ id: identitySchema, description: textSchema, observedAt: z.string().datetime(),
    artifactId: identitySchema }).strict()),
  authorizationScope: textSchema,
}).strict().superRefine((plan, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message })
  const seen = new Set<string>(), outputs = new Map<string, ValueSchema>()
  for (const step of plan.steps) {
    if (seen.has(step.id) || new Set(step.dependsOn).size !== step.dependsOn.length
      || step.dependsOn.some((id) => !seen.has(id))) issue("plan_dependency_order")
    // WHY：计划采用相同 binding 词汇；node 引用已完成步骤，each 的变量仅在逐项调用内可用。
    const bindings = [step.input, ...(step.invocation.mode === "once" ? [] : [step.invocation.collection])]
    for (const binding of bindings) {
      if (binding.source === "node" && !step.dependsOn.includes(binding.nodeId)) issue("plan_input_dependency")
      if (binding.source === "variable" && (binding !== step.input || step.invocation.mode !== "each"
        || binding.name !== step.invocation.itemVariable)) issue("plan_input_variable")
    }
    let itemSchema: ValueSchema | null | undefined
    if (step.invocation.mode !== "once") {
      const collection = bindingSchema(step.invocation.collection, plan.inputContract.schema, outputs, new Map())
      if (!collection || collection.type !== "array") issue("plan_each_collection_contract_required")
      else {
        itemSchema = collection.items
        const stableKey = schemaAtPath(itemSchema, step.invocation.stableKeyPath)
        if (!stableKey || !["string", "number", "integer", "boolean"].includes(stableKey.type)) {
          issue("plan_each_stable_key_contract_required")
        }
      }
    }
    const variables = step.invocation.mode === "each" && itemSchema
      ? new Map([[step.invocation.itemVariable, itemSchema]]) : new Map<string, ValueSchema>()
    // WHY：Chain 的 outputContract 描述单次调用；计划执行器会把 each 的多次结果聚合成数组，后续步骤和计划输出必须按运行时形状校验 binding。
    const runtimeOutputSchema = runtimeStepOutputSchema(step)
    validateBindingPath(step.input, plan.inputContract.schema, outputs, variables, issue)
    for (const binding of step.completion.flatMap((condition) => predicateBindings(condition.predicate))) {
      if (binding.source === "node" && binding.nodeId !== step.id && !step.dependsOn.includes(binding.nodeId)) issue("plan_completion_dependency")
      if (binding.source === "variable") issue("plan_completion_variable")
      validateBindingPath(binding, plan.inputContract.schema,
        new Map([...outputs, [step.id, runtimeOutputSchema]]), new Map(), issue)
    }
    if (step.invocation.mode === "each" && step.invocation.maxItems > step.budget.maxInvocations) {
      issue("plan_step_invocation_budget_exceeded")
    }
    if (step.invocation.mode === "batch") {
      const outputs = new Set<string>(), stopped = step.invocation.aggregates.filter((item) => item.stopAfterInputPath)
      if (stopped.length > 1) issue("plan_batch_stop_aggregate_ambiguous")
      for (const aggregate of step.invocation.aggregates) {
        const key = JSON.stringify(aggregate.outputPath), schema = schemaAtPath(step.outputContract.schema, aggregate.outputPath)
        if (outputs.has(key)) issue("plan_batch_aggregate_duplicate")
        outputs.add(key)
        if (!schema || schema.type !== "array") { issue("plan_batch_aggregate_array_required"); continue }
        if (aggregate.stableKeyPath) {
          const stableKey = schemaAtPath(schema.items, aggregate.stableKeyPath)
          if (!stableKey || !["string", "number", "integer", "boolean"].includes(stableKey.type)) {
            issue("plan_batch_aggregate_stable_key_required")
          }
        }
        if (aggregate.stopAfterInputPath) {
          const stop = schemaAtPath(step.inputContract.schema, aggregate.stopAfterInputPath)
          if (!stop || !["number", "integer"].includes(stop.type)) issue("plan_batch_stop_input_required")
        }
      }
    }
    seen.add(step.id); outputs.set(step.id, runtimeOutputSchema)
  }
  for (const binding of [plan.output, ...plan.completion.flatMap((condition) => predicateBindings(condition.predicate))]) {
    if (binding.source === "node" && !seen.has(binding.nodeId)) issue("plan_output_dependency")
    if (binding.source === "variable") issue("plan_output_variable")
    validateBindingPath(binding, plan.inputContract.schema, outputs, new Map(), issue)
  }
  for (const key of ["maxTransitions", "maxBrowserCommands", "maxActiveMs", "maxLlmCalls", "maxInvocations"] as const) {
    if (plan.steps.reduce((sum, step) => sum + step.budget[key], 0) > plan.budget[key]) issue("plan_budget_exceeded")
  }
  if (plan.steps.some((step) => step.budget.maxDepth > plan.budget.maxDepth)) issue("plan_depth_exceeded")
})
export type TaskPlan = z.infer<typeof taskPlanSchema>
export type TaskPlanStep = z.infer<typeof taskPlanStepSchema>

// 新的执行门比持久化读取更严格；旧计划仍可读取和导出，但不能进入新 authoring 或执行。
export function taskPlanExecutionIssues(raw: unknown): string[] {
  const plan = taskPlanSchema.parse(raw), outputs = new Map<string, ValueSchema>(), issues: string[] = []
  for (const step of plan.steps) {
    if (step.invocation.mode === "batch" && step.invocation.aggregates.length === 0) {
      issues.push("plan_batch_aggregate_required")
    }
    const collection = step.invocation.mode !== "once"
      ? bindingSchema(step.invocation.collection, plan.inputContract.schema, outputs, new Map()) : undefined
    const variables = step.invocation.mode === "each" && collection?.type === "array"
      ? new Map([[step.invocation.itemVariable, collection.items]]) : new Map<string, ValueSchema>()
    validateBindingContract(step.input, step.inputContract, plan.inputContract.schema, outputs, variables,
      () => issues.push("plan_input_contract_mismatch"))
    outputs.set(step.id, runtimeStepOutputSchema(step))
  }
  validateBindingContract(plan.output, plan.outputContract, plan.inputContract.schema, outputs, new Map(),
    () => issues.push("plan_output_contract_mismatch"))
  return [...new Set(issues)]
}

function validateBindingPath(binding: ValueBinding, input: ValueSchema, outputs: ReadonlyMap<string, ValueSchema>,
  variables: ReadonlyMap<string, ValueSchema>, issue: (message: string) => void) {
  if (binding.source === "constant") return
  if (bindingSchema(binding, input, outputs, variables) === undefined) issue("plan_binding_path_contract_mismatch")
}

function validateBindingContract(binding: ValueBinding, contract: TaskDataContract, input: ValueSchema,
  outputs: ReadonlyMap<string, ValueSchema>, variables: ReadonlyMap<string, ValueSchema>, issue: () => void) {
  if (binding.source === "constant") {
    try { parseTaskValue(contract, binding.value) } catch { issue() }
    return
  }
  const actual = bindingSchema(binding, input, outputs, variables)
  if (actual && !schemaAssignable(actual, contract.schema)) issue()
}

function runtimeStepOutputSchema(step: TaskPlanStep): ValueSchema {
  return step.invocation.mode === "each"
    ? { type: "array", items: step.outputContract.schema, maxItems: step.invocation.maxItems }
    : step.outputContract.schema
}

function bindingSchema(binding: ValueBinding, input: ValueSchema, outputs: ReadonlyMap<string, ValueSchema>,
  variables: ReadonlyMap<string, ValueSchema>) {
  if (binding.source === "constant") return null
  const root = binding.source === "input" ? input
    : binding.source === "node" ? outputs.get(binding.nodeId)
      : variables.get(binding.name)
  return root ? schemaAtPath(root, binding.path) : undefined
}

function schemaAtPath(root: ValueSchema, path: (string | number)[]) {
  let schema: ValueSchema | null = root
  for (const segment of path) {
    if (schema === null) return null
    if (typeof segment === "number") {
      if (schema.type !== "array") return undefined
      schema = schema.items; continue
    }
    if (schema.type !== "object") return undefined
    schema = schema.properties[segment] ?? (schema.additionalProperties ? null : undefined)!
    if (schema === undefined) return undefined
  }
  return schema
}

function pathPrefix(left: (string | number)[], right: (string | number)[]) {
  return left.length <= right.length && left.every((part, index) => part === right[index])
}

function pathCrossesOptionalProperty(root: ValueSchema, path: (string | number)[]) {
  let schema: ValueSchema = root
  for (const segment of path) {
    if (typeof segment === "number") {
      if (schema.type !== "array") return false
      schema = schema.items; continue
    }
    if (schema.type !== "object") return false
    if (!schema.required.includes(segment)) return true
    const child = schema.properties[segment]
    if (!child) return false
    schema = child
  }
  return false
}

function requiredPathsCovered(schema: ValueSchema, owners: (string | number)[][], path: (string | number)[] = []): boolean {
  if (owners.some((owner) => pathPrefix(owner, path))) return true
  if (schema.type !== "object") return false
  return schema.required.every((name) => {
    const child = schema.properties[name]
    return child !== undefined && requiredPathsCovered(child, owners, [...path, name])
  })
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
  return JSON.stringify(value)
}

function schemaAssignable(actual: ValueSchema, expected: ValueSchema): boolean {
  if (actual.type === "integer" && expected.type === "number") return numericBoundsAssignable(actual, expected)
  if (actual.type !== expected.type) return false
  if (actual.type === "null" || actual.type === "boolean") return true
  if (actual.type === "string" && expected.type === "string") {
    const enumAssignable = !expected.enum || Boolean(actual.enum?.every((value) => expected.enum!.includes(value)))
    return enumAssignable && lowerBoundAssignable(actual.minLength, expected.minLength)
      && upperBoundAssignable(actual.maxLength, expected.maxLength)
  }
  if ((actual.type === "number" || actual.type === "integer")
    && (expected.type === "number" || expected.type === "integer")) return numericBoundsAssignable(actual, expected)
  if (actual.type === "array" && expected.type === "array") {
    return schemaAssignable(actual.items, expected.items) && lowerBoundAssignable(actual.minItems, expected.minItems)
      && upperBoundAssignable(actual.maxItems, expected.maxItems)
  }
  if (actual.type !== "object" || expected.type !== "object") return false
  if (expected.required.some((key) => !actual.required.includes(key))) return false
  if (actual.additionalProperties && !expected.additionalProperties) return false
  return Object.entries(actual.properties).every(([key, schema]) => {
    const target = expected.properties[key]
    return target ? schemaAssignable(schema, target) : expected.additionalProperties
  })
}

function numericBoundsAssignable(actual: Extract<ValueSchema, { type: "number" | "integer" }>,
  expected: Extract<ValueSchema, { type: "number" | "integer" }>) {
  return lowerBoundAssignable(actual.minimum, expected.minimum) && upperBoundAssignable(actual.maximum, expected.maximum)
}
function lowerBoundAssignable(actual: number | undefined, expected: number | undefined) {
  return expected === undefined || actual !== undefined && actual >= expected
}
function upperBoundAssignable(actual: number | undefined, expected: number | undefined) {
  return expected === undefined || actual !== undefined && actual <= expected
}
