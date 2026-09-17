import type { TaskChainCommand, VersionReference } from "@browser-capture/contracts"
import type { TaskContractRepository } from "./repository.js"
import type { TaskRuntimeHost } from "./runtime-host.js"

/** WHY：版本准入先于幂等命中、排队和模型准备；旧数据读取不经过执行门。 */
export function assertCommandRuntime(taskId: string, command: TaskChainCommand,
  repository: TaskContractRepository, host: TaskRuntimeHost) {
  const check = (references: VersionReference[]) => host.assertExecutable(taskId, references.map((ref) =>
    repository.chain(taskId, ref.id, ref.version, ref.digest)))
  switch (command.type) {
    case "validate_chain":
      return check([command.chain])
    case "resume_validation":
      return check([repository.run(taskId, command.runId).binding.chain])
    case "resume_execution":
      return check(repository.execution(taskId, command.executionId).steps.map((step) => step.chain))
    case "authorize_plan": case "validate_plan": {
      const plan = repository.plan(taskId, command.plan.id, command.plan.version, command.plan.digest)
      const chains = plan.steps.flatMap((step) => {
        const chain = repository.latestChain(plan, step.id, command.type === "authorize_plan")
        return chain ? [chain] : []
      })
      return host.assertExecutable(taskId, chains)
    }
  }
}
