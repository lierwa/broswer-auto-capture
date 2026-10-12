import type { ResultSpec, TaskPlanStep, ValueBinding, ValueSchema } from "@browser-capture/contracts"
import { stableUuid } from "@browser-capture/runtime"
import { taskInputSchemaAtPath, type DraftBusinessStep } from "../interview/business-steps.js"
import { contentDelivery } from "../interview/content-delivery.js"
import { entryItemGoal, sourceEntryStep, recordEntry, recordKey } from "./record-plan.js"
import { planningEnvelope } from "./preparation-plan-projection.js"

type Draft = { steps: DraftBusinessStep[] | undefined; resultSource: number | undefined; maximum: number | undefined;
  inputSchema: ValueSchema; outputSchema: ValueSchema; resultSpec: ResultSpec }

/** WHY：业务步骤来自同一确认版本；代码只补稳定 ID、类型、绑定及技术预算，不再次规划。 */
export function projectBusinessPlanSteps(base: TaskPlanStep, draft: Draft): TaskPlanStep[] {
  const outputs = new Map<string, ValueSchema>(), steps: TaskPlanStep[] = []
  for (const [index, definition] of draft.steps!.entries()) {
    const id = `step-${index + 1}`, sourceId = definition.input.kind === "step" ? `step-${definition.input.step}` : undefined
    const binding: ValueBinding = sourceId ? { source: "node", nodeId: sourceId, path: [] }
      : { source: "input", path: definition.input.kind === "task" ? definition.input.path : [] }
    const input = sourceId ? outputs.get(sourceId) : taskInputSchemaAtPath(draft.inputSchema, binding.path)
    if (!input) throw Error("preparation_step_input_path_missing")
    // WHY：最终交付上限不缩小前置处理范围；其他步骤只有宿主技术预算。
    const each = definition.execution === "逐项执行"
    const maximum = index === (draft.resultSource ?? draft.steps!.length - 1) ? draft.maximum ?? 10_000 : 10_000
    const item = each ? input.type === "array" ? input.items : undefined : input
    if (!item) throw Error("preparation_step_collection_required")
    const output = stepOutput(definition, draft, each)
    const dependencies = [...new Set([...(steps.length ? [steps.at(-1)!.id] : []), ...(sourceId ? [sourceId] : [])])]
    const step: TaskPlanStep = { ...base, id, title: definition.title, goal: definition.goal,
      dependsOn: dependencies, inputContract: { ...base.inputContract, id: `${id}-input`, schema: item },
      outputContract: { ...base.outputContract, id: `${id}-output`, schema: output.schema }, resultSpec: output.spec,
      input: each ? { source: "variable", name: "item", path: [] } : binding,
      invocation: each ? { mode: "each", collection: binding, itemVariable: "item", stableKeyPath: stableKey(item),
        maxItems: maximum, onItemFailure: "stop" } : { mode: "once" },
      budget: planningEnvelope(each ? maximum : 1), chain: { id: stableUuid(base.chain.id, id), version: 1 },
      completion: base.completion.map(condition => ({ ...condition, description: definition.goal })) }
    if (definition.output === "入口集合") {
      const source = sourceEntryStep(step, definition.goal, maximum)
      step.goal = source.goal; step.outputContract = { ...source.outputContract, id: `${id}-output` }
      step.resultSpec = source.resultSpec
    }
    if (each && isEntry(item)) {
      step.goal = entryItemGoal(step.goal)
    }
    outputs.set(id, each ? { type: "array", items: step.outputContract.schema, maxItems: maximum } : step.outputContract.schema)
    steps.push(step)
  }
  return steps
}

function stepOutput(step: DraftBusinessStep, draft: Draft, each: boolean): { schema: ValueSchema; spec: ResultSpec } {
  if (step.output === "页面内容") {
    const content = contentDelivery(false)
    return { schema: content.outputSchema, spec: content.resultSpec }
  }
  if (step.output !== "最终结果") return { schema: { type: "null" }, spec: { contractVersion: "bat-result-spec/v1", mode: "execution" } }
  const schema = each && draft.outputSchema.type === "array" ? draft.outputSchema.items : draft.outputSchema
  if (each && draft.outputSchema.type !== "array" && draft.outputSchema.type !== "null") {
    throw Error("preparation_step_result_shape_mismatch")
  }
  const spec = draft.resultSpec.mode === "execution" ? draft.resultSpec : { ...draft.resultSpec, schema,
    fields: draft.resultSpec.fields.map(field => ({ ...field,
      path: each && typeof field.path[0] === "number" ? field.path.slice(1) : field.path })),
    derivations: draft.resultSpec.derivations.map(derivation => ({ ...derivation,
      sourcePath: each && typeof derivation.sourcePath[0] === "number" ? derivation.sourcePath.slice(1) : derivation.sourcePath })) }
  return { schema, spec }
}

function isEntry(schema: ValueSchema) {
  return schema.type === "object" && Object.hasOwn(schema.properties, recordEntry) && Object.hasOwn(schema.properties, recordKey)
}
function stableKey(schema: ValueSchema): (string | number)[] {
  if (isEntry(schema)) return [recordKey]
  if (["string", "number", "integer", "boolean"].includes(schema.type)) return []
  throw Error("preparation_step_stable_key_required")
}
