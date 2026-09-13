import { z } from "zod"
import { budgetSchema, contractVersionSchema, digestSchema, identitySchema, keySchema, taskIdentitySchema, textSchema, versionReferenceSchema } from "./common.js"
import { completionConditionSchema } from "./binding.js"
import { chainNodeSchema, nodeBindings, nodeOutcomeSchema, predicateBindings, requiredNodeOutcomes } from "./node.js"
import { taskDataContractSchema } from "./value.js"

export const chainEdgeSchema = z.object({ from: keySchema, outcome: nodeOutcomeSchema, to: keySchema }).strict()
export const chainValidationEvidenceSchema = z.object({
  phase: z.enum(["sample", "verification"]), runId: identitySchema, chainDigest: digestSchema,
  inputDigest: digestSchema, outputDigest: digestSchema, passed: z.boolean(),
  modelCalls: z.number().int().nonnegative().nullable(), at: z.string().datetime(),
}).strict()
export const taskChainSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("chain"),
  id: identitySchema, taskId: taskIdentitySchema, version: z.number().int().positive(),
  plan: versionReferenceSchema, stepId: keySchema, name: textSchema,
  inputContract: taskDataContractSchema, outputContract: taskDataContractSchema,
  variables: z.record(keySchema, taskDataContractSchema), entry: keySchema,
  nodes: z.array(chainNodeSchema).min(1).max(500), edges: z.array(chainEdgeSchema).max(5000),
  completion: z.array(completionConditionSchema).min(1), budget: budgetSchema,
  reuseBoundary: z.object({ description: textSchema, assumptions: z.array(textSchema), invalidationConditions: z.array(textSchema) }).strict(),
  implementationSummary: textSchema,
  validation: z.object({ status: z.enum(["candidate", "verified"]), evidence: z.array(chainValidationEvidenceSchema) }).strict(),
}).strict().superRefine((chain, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message })
  const nodes = new Map(chain.nodes.map((node) => [node.id, node]))
  if (nodes.size !== chain.nodes.length || !nodes.has(chain.entry)) issue("chain_identity")
  if (!chain.nodes.some((node) => node.kind === "terminal")) issue("chain_terminal_missing")
  const edgeKeys = new Set<string>()
  for (const edge of chain.edges) {
    const from = nodes.get(edge.from), edgeKey = `${edge.from}:${edge.outcome}`
    if (!from || !nodes.has(edge.to) || !from.outcomes.includes(edge.outcome) || edgeKeys.has(edgeKey)) issue("chain_edge")
    edgeKeys.add(edgeKey)
  }
  for (const node of chain.nodes) {
    const required = requiredNodeOutcomes[node.kind]
    if (new Set(node.outcomes).size !== node.outcomes.length || required.length !== node.outcomes.length
      || required.some((outcome) => !node.outcomes.includes(outcome))) issue("node_outcomes")
    if (node.outcomes.some((outcome) => !edgeKeys.has(`${node.id}:${outcome}`))) issue("unbound_outcome")
    if (node.writes.some((write) => !Object.hasOwn(chain.variables, write.variable))) issue("unknown_write_variable")
    if (new Set(node.writes.map((write) => write.variable)).size !== node.writes.length) issue("duplicate_write_variable")
    if (node.kind === "loop" && !Object.hasOwn(chain.variables, node.cursorVariable)) issue("unknown_cursor_variable")
    if ((node.kind === "loop" || node.kind === "invoke") && node.iteration.mode === "each"
      && !Object.hasOwn(chain.variables, node.iteration.itemVariable)) issue("unknown_item_variable")
    if (node.kind === "invoke" && node.iteration.mode === "each"
      && node.iteration.maxItems > chain.budget.maxInvocations) issue("chain_invocation_budget_exceeded")
    if (node.kind === "browser" && ["click", "hover", "fill", "select", "drag", "upload"].includes(node.operation) && !node.target) issue("browser_target_missing")
  }
  if (chain.nodes.some((node) => node.kind === "browser" || node.kind === "observe" || node.kind === "human")
    && (chain.budget.maxBrowserCommands < 1 || chain.budget.maxActiveMs < 1000)) issue("chain_browser_budget_required")
  const bindings = [...chain.nodes.flatMap(nodeBindings), ...chain.completion.flatMap((condition) => predicateBindings(condition.predicate))]
  for (const binding of bindings) {
    if (binding.source === "node" && !nodes.has(binding.nodeId)) issue("unknown_binding_node")
    if (binding.source === "variable" && !Object.hasOwn(chain.variables, binding.name)) issue("unknown_binding_variable")
  }
  if (chain.validation.status !== "verified") return
  const passed = chain.validation.evidence.filter((evidence) => evidence.passed && evidence.modelCalls !== null)
  // WHY：不同输入和独立 run 的实测证据才支持 verified；摘要真实性与图可执行性由 M2/M4 核验。
  const verified = passed.some((sample) => sample.phase === "sample" && passed.some((verification) =>
    verification.phase === "verification" && sample.runId !== verification.runId
    && sample.inputDigest !== verification.inputDigest && sample.chainDigest === verification.chainDigest))
  if (!verified) issue("distinct_input_validation_required")
})
export type TaskChain = z.infer<typeof taskChainSchema>
export type ChainEdge = z.infer<typeof chainEdgeSchema>
