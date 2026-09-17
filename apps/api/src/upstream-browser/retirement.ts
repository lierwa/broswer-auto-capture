import type { TaskChain } from "@browser-capture/contracts"
import { DomainError } from "../errors.js"

export const legacyWorkflowMediaType = "application/vnd.bat.workflow-use+json;version=1"
export const legacyWorkflowProvider = "browser.workflow-use"

export class LegacyWorkflowRetiredError extends DomainError {
  readonly readable = true
  readonly exportable = true
  readonly executable = false
  readonly replacement = "hybrid_compilation_v2_required"
  constructor(readonly reference: { artifactId?: string; chainId?: string } = {}) {
    super("legacy_workflow_use_v1_retired", "legacy_workflow_use_v1_retired")
  }
}

export function retireWorkflowV1(reference?: { artifactId?: string; chainId?: string }): void {
  throw new LegacyWorkflowRetiredError(reference)
}

/** WHY：先检查整个调用闭包，避免前面的普通节点已产生副作用才发现子链退休。 */
export function assertWorkflowRuntimeSupported(chains: readonly TaskChain[]) {
  if (chains.some((chain) => chain.nodes.some((node) => node.kind === "capability"
    && ["browser.workflow-step", "browser.read-fields"].includes(node.capability.name) && node.capability.version !== 2))) {
    throw new DomainError("hybrid_capability_version_unsupported", "hybrid_capability_version_unsupported")
  }
  const hybrid = chains.some((chain) => chain.nodes.some((node) => node.kind === "capability"
    && ["browser.workflow-step", "browser.read-fields"].includes(node.capability.name)))
  if (hybrid && chains.some((chain) => chain.nodes.some((node) => node.kind === "browser" || node.kind === "observe"
    || node.kind === "human" || node.kind === "capability" && node.capability.name.startsWith("browser.")
      && !["browser.workflow-step", "browser.read-fields"].includes(node.capability.name)))) {
    throw new DomainError("mixed_browser_runtime_unsupported", "mixed_browser_runtime_unsupported")
  }
  const legacy = chains.find((chain) => chain.nodes.some((node) =>
    node.kind === "llm" && "delegate" in node && node.delegate?.capability.name === legacyWorkflowProvider
    || node.kind === "capability" && node.capability.name === legacyWorkflowProvider))
  if (!legacy) return
  const mixed = chains.some((chain) => chain.nodes.some((node) => node.kind === "browser" || node.kind === "observe"
    || node.kind === "human" || node.kind === "capability" && node.capability.name.startsWith("browser.")
      && node.capability.name !== legacyWorkflowProvider))
  if (mixed) throw new DomainError("mixed_browser_runtime_unsupported", "mixed_browser_runtime_unsupported")
  retireWorkflowV1({ chainId: legacy.id })
}
