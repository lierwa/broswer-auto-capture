import { useEffect, useState } from "react"
import { Button } from "@radix-ui/themes"
import { CheckCircle2 } from "lucide-react"
import type { TaskAdjustmentRecord, TaskWorkspaceSnapshot } from "@browser-capture/contracts"

export async function publishedAdjustmentVersion(workspace: TaskWorkspaceSnapshot | null,
  adjustment: TaskAdjustmentRecord): Promise<number | null> {
  const release = workspace?.release, accepted = adjustment.acceptedDraft, candidate = adjustment.candidate
  if (!release || workspace?.draft || !accepted || !candidate || adjustment.baseline.kind !== "release"
    || release.value.id !== release.reference.id || release.value.version !== release.reference.version
    || release.value.version <= adjustment.baseline.release.version
    || JSON.stringify(candidate.content) !== JSON.stringify(release.value.content)) return null
  // WHY：Release 不保存草稿 ID；其冻结内容、原基线与需求可重算接受时的草稿 checksum。
  const [releaseDigest, contentDigest, draftChecksum] = await Promise.all([
    hashJson(release.value), hashJson(release.value.content), hashJson({
      requirement: release.value.requirement, baseRelease: adjustment.baseline.release,
      content: release.value.content,
    }),
  ])
  return releaseDigest === release.reference.digest && contentDigest === candidate.digest
    && draftChecksum === accepted.checksum ? release.value.version : null
}

async function hashJson(value: unknown) {
  if (!globalThis.crypto?.subtle) return null
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function AdjustmentAcceptedState({ workspace, adjustment, onTrial, onRun }: {
  workspace: TaskWorkspaceSnapshot | null; adjustment: TaskAdjustmentRecord
  onTrial(): void; onRun(): void
}) {
  const [proof, setProof] = useState<{ key: string; version: number | null } | null>(null)
  const release = workspace?.release
  const proofKey = [release?.reference.digest, adjustment.acceptedDraft?.checksum,
    adjustment.candidate?.digest, adjustment.baseline.kind === "release" ? adjustment.baseline.release.digest : ""].join(":")
  useEffect(() => {
    if (!workspace?.release || workspace.draft) return
    let current = true
    void publishedAdjustmentVersion(workspace, adjustment).then((version) => {
      if (current) setProof({ key: proofKey, version })
    }).catch(() => { if (current) setProof({ key: proofKey, version: null }) })
    return () => { current = false }
  }, [proofKey, Boolean(workspace?.draft)])
  if (workspace?.draft) return <>
    <section className="context-status" data-tone="completed"><CheckCircle2 size={18} />
      <div><strong>修改已应用到工作草稿，等待重新验证</strong><small>原发布版本和原运行保持不变。</small></div>
    </section>
    <Button size="1" variant="soft" onClick={onTrial}>试跑修改后的链路</Button>
  </>
  if (!release) return <p>修改已接受，但当前没有活动草稿或发布版本；请查看历史记录。</p>
  const version = proof?.key === proofKey ? proof.version : undefined
  if (version === undefined) return <p role="status">正在核对已发布版本与已接受的草稿…</p>
  if (version === null) return <p>当前发布版本无法与这次已接受的修改对应；请查看发布和执行历史。</p>
  return <>
    <section className="context-status" data-tone="completed"><CheckCircle2 size={18} />
      <div><strong>修改已发布为 V{version}</strong><small>已接受的草稿与当前冻结版本一致，可再次运行。</small></div>
    </section>
    <Button size="1" variant="soft" onClick={onRun}>运行已发布 V{version}</Button>
  </>
}
