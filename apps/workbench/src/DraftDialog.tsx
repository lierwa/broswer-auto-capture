import { Button } from "@radix-ui/themes"
import { Check } from "lucide-react"
import { ResizableDrawer } from "./ResizableDrawer.js"
import { currentDraft, type InterviewState } from "./interviewContract.js"
import { projectDraftMarkdown } from "./draftProjection.js"

export function DraftDialog({ state, version, open, onVersion, onConfirm, readOnly, pending = false, confirming = false }: { open: boolean; state: InterviewState; version: number | null; onVersion: (v: number | null) => void; onConfirm: (v: number) => Promise<void>; readOnly: boolean; pending?: boolean; confirming?: boolean }) {
  const draft = state.drafts.find((item) => item.version === version)
  const current = Boolean(draft) && currentDraft(state)?.version === draft?.version
  const markdown = projectDraftMarkdown(draft)
  return <ResizableDrawer title="准备计划草案" open={open} onClose={() => onVersion(null)}>
    <p className="detail-intro">{current ? "请确认目标、来源与范围。" : draft ? `历史草案 v${draft.version}，仅供查阅。` : "草案不存在。"}</p>
    <div className="draft-document">{markdown.split("\n").filter((line) => line.trim()).map((line, index) => line.startsWith("#") ? <h3 key={index}>{line.replace(/^#+\s*/, "")}</h3> : <p key={index}>{line.replace(/^[-*]\s/, "• ")}</p>)}</div>
    <div className="draft-dialog-footer">
      {state.confirmedVersion === version ? <span>草案已确认</span>
        : readOnly ? <span>任务已归档，仅供查阅</span>
          : current && state.active ? <span>对话处理中，完成后可确认</span>
            : current && pending && !confirming ? <span>正在核对提交状态</span> : null}
      {!readOnly && current && !state.active && state.confirmedVersion !== version && <Button
        disabled={pending} onClick={() => { if (draft) void onConfirm(draft.version) }}>
        <Check size={15} />{confirming ? "正在确认…" : "确认草案"}
      </Button>}
    </div>
  </ResizableDrawer>
}
