import { Badge, Button } from "@radix-ui/themes"
import { FlaskConical, Send } from "lucide-react"
import type { TaskWorkspaceSnapshot } from "@browser-capture/contracts"

export function DraftControls({ readiness, busy, running, onTrial, onPublish }: {
  readiness: TaskWorkspaceSnapshot["draftReadiness"]
  busy: boolean
  running: boolean
  onTrial(): void
  onPublish(): void
}) {
  const phase = readiness?.phase ?? "sample_needed"
  const ready = phase === "ready"
  const verifying = phase === "verification_needed"
  return <div className="draft-controls" aria-label="草稿试跑与发布">
    <Badge color={ready ? "green" : "amber"} variant="soft">
      {running ? "正在试跑" : ready ? "双次验证有效" : verifying ? "待独立复跑检查" : "待代表试跑"}
    </Badge>
    <Button size="1" variant="soft" disabled={busy || running} onClick={onTrial}
      title={verifying && readiness?.distinctInputRequired ? "请用另一组不同的业务输入完成独立复跑检查。" : undefined}>
      <FlaskConical size={13} aria-hidden="true" />{verifying ? "独立复跑检查" : "试跑"}
    </Button>
    <Button size="1" disabled={busy || running || !ready} onClick={onPublish}>
      <Send size={13} aria-hidden="true" />发布
    </Button>
  </div>
}

export function nextCopyId(nodeId: string, nodes: Array<{ id: string }>) {
  const base = `${nodeId.slice(0, 55)}Copy`
  let candidate = base, index = 2
  while (nodes.some((node) => node.id === candidate)) candidate = `${base}${index++}`
  return candidate
}
