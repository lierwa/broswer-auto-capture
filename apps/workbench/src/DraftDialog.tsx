import { Button, Select } from "@radix-ui/themes"
import { Check } from "lucide-react"
import { ResizableDrawer } from "./ResizableDrawer.js"
import { currentDraft, type InterviewState } from "./interviewContract.js"
import { projectDraftMarkdown } from "./draftProjection.js"

export function DraftDialog({ state, version, open, onVersion, onConfirm, readOnly, pending = false }: { open: boolean; state: InterviewState; version: number | null; onVersion: (v: number | null) => void; onConfirm: (v: number) => Promise<void>; readOnly: boolean; pending?: boolean }) {
  const draft = state.drafts.find((item) => item.version === version)
  const current = Boolean(draft) && currentDraft(state)?.version === draft?.version
  const markdown = projectDraftMarkdown(draft)
  return <ResizableDrawer title="需求草稿" open={open} onClose={() => onVersion(null)}>
    <p className="detail-intro">确认后可前往来源调研，核验来源并制定抓取计划。</p>
    <div className="draft-version-label"><span>版本记录</span><Select.Root value={version === null ? "" : String(version)} onValueChange={(value) => onVersion(Number(value))}>
      <Select.Trigger aria-label="版本记录" placeholder="选择版本" /><Select.Content position="popper">{state.drafts.map((item) => <Select.Item key={item.version} value={String(item.version)}>v{item.version} · {item.title}</Select.Item>)}</Select.Content>
    </Select.Root></div>
    <div className="draft-document">{markdown.split("\n").filter((line) => line.trim()).map((line, index) => line.startsWith("#") ? <h3 key={index}>{line.replace(/^#+\s*/, "")}</h3> : <p key={index}>{line.replace(/^[-*]\s/, "• ")}</p>)}</div>
    <div className="draft-dialog-footer"><span>{readOnly ? "归档任务，仅供查阅" : state.confirmedVersion === version ? "这个版本已确认" : pending ? "正在核对提交状态" : current ? "确认并保存当前需求版本" : "历史版本，仅供查阅"}</span><Button disabled={readOnly || pending || !current || state.active || state.confirmedVersion === version} onClick={() => { if (draft) void onConfirm(draft.version) }}><Check size={15} />确认需求草稿</Button></div>
  </ResizableDrawer>
}
