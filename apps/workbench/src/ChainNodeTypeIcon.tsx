import { AppWindow, BookmarkCheck, Braces, Database, Flag, GitBranch, Hand,
  Plug, Repeat2, ScanText, Send, Sparkles, Workflow, type LucideIcon } from "lucide-react"
import type { NodeTypePresentation } from "./chainNodePresentation.js"

const icons: Record<NodeTypePresentation["kind"], LucideIcon> = {
  browser: AppWindow, observe: ScanText, function: Braces, data: Database,
  branch: GitBranch, condition: GitBranch, loop: Repeat2, capability: Plug,
  invoke: Workflow, human: Hand, llm: Sparkles, checkpoint: BookmarkCheck,
  emit: Send, terminal: Flag,
}

export function ChainNodeTypeIcon({ action }: { action: NodeTypePresentation }) {
  // WHY：稳定节点的浏览器/数据能力也有真实类型；按能力引用映射，不能从动作名猜类型。
  const Icon = action.kind === "capability" && action.capabilityName === "browser.read-fields" ? ScanText
    : action.kind === "capability" && action.capabilityName?.startsWith("browser.") ? AppWindow
      : action.kind === "capability" && action.capabilityName === "data.transform" ? Database : icons[action.kind]
  return <span className="chain-node-type-icon" role="img" aria-label={action.type} title={action.type}
    data-kind={action.kind} data-capability={action.capabilityName}>
    <Icon size={14} aria-hidden="true" />
  </span>
}
