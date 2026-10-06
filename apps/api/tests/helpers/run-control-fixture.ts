import { randomUUID } from "node:crypto"
import { CONTRACT_VERSION, taskPlanSchema } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { capabilityEffectChain } from "../../../../packages/runtime/tests/task-chain-fixtures.js"
import { extractionFixture } from "../../../../packages/contracts/tests/task-chain-fixtures.js"
import { createChainPresentation } from "../../src/task-chain/presentation.js"
import { releaseReference } from "../../src/task-chain/workspace-projection.js"
import type { ProductStore } from "../../src/database/store.js"
import type { TaskChainService } from "../../src/task-chain/service.js"

// WHY：复用已存在的零模型合同样本，直接种入隔离数据库；不重新生成用户业务任务。
export function seedRunControl(store: ProductStore, service: TaskChainService, origin: string) {
  const taskId = store.taskAction({ type: "create", requestId: randomUUID() }), stamp = new Date().toISOString()
  store.mutate(taskId, state => {
    state.revision = 1; state.confirmedVersion = 1
    state.drafts.push({ version: 1, revision: 1, title: "受控复跑样本", markdown: "# 受控复跑样本", brief: null })
    state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "受控测试夹具",
      messageId: null, questionId: null, draftVersion: 1, createdAt: stamp })
  })
  const chain = capabilityEffectChain()
  chain.id = randomUUID()
  let plan = structuredClone(extractionFixture.plan)
  plan.id = randomUUID()
  chain.taskId = taskId; chain.stepId = "perform"; chain.entry = "capability"
  chain.nodes = chain.nodes.filter(node => node.id !== "observe")
  chain.edges = chain.edges.filter(edge => edge.from !== "observe"); chain.budget.maxLlmCalls = 0
  const navigate = chain.nodes.find(node => node.id === "capability")!
  if (navigate.kind !== "capability") throw Error("fixture_capability_missing")
  navigate.input = { url: { source: "constant", value: `${origin}/fixture` }, new_tab: { source: "constant", value: false } }
  navigate.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }
  navigate.timeoutMs = 30000
  const input = structuredClone(extractionFixture.requirement)
  input.id = randomUUID(); plan.requirement.id = input.id
  input.taskId = taskId; input.goal = "受控复跑样本"; input.scope = origin
  input.inputContract = chain.inputContract; input.outputContract = chain.outputContract
  input.confirmation = { confirmedAt: stamp, requestId: randomUUID() }
  const requirement = service.repository.saveRequirement(input)
  plan.taskId = taskId; plan.summary = input.goal; plan.requirement.digest = digestJson(requirement)
  plan.inputContract = chain.inputContract; plan.outputContract = chain.outputContract
  plan.browserHandoff = "keep_open"; plan.budget = chain.budget
  plan.steps[0] = { ...plan.steps[0]!, inputContract: chain.inputContract, outputContract: chain.outputContract,
    chain: { id: chain.id, version: chain.version }, budget: chain.budget }
  plan = taskPlanSchema.parse(plan)
  chain.plan = { id: plan.id, version: plan.version, digest: digestJson(plan) }
  const release = service.repository.saveRelease({ contractVersion: CONTRACT_VERSION, kind: "release", id: randomUUID(),
    taskId, version: 1, requirement: plan.requirement, content: { plan,
      steps: [{ stepId: chain.stepId, chain, presentation: createChainPresentation(chain) }] },
    validation: ["sample", "verification"].map(phase => ({ phase, executionId: null, inputDigest: digestJson(null),
      steps: [{ stepId: chain.stepId, chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) },
        runIds: [], outputDigest: digestJson(null) }], modelCalls: 0, completedAt: stamp })), createdAt: stamp })
  return { taskId, release: releaseReference(release) }
}
