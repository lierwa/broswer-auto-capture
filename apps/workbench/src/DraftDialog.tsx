import { Button } from "@radix-ui/themes"
import { Check } from "lucide-react"
import { DetailPane } from "./DetailPane.js"
import { currentDraft, type InterviewState } from "./interviewContract.js"

export function DraftDialog({ state, version, open, onVersion, onConfirm, readOnly, pending = false }: { open: boolean; state: InterviewState; version: number | null; onVersion: (v: number | null) => void; onConfirm: (v: number) => Promise<void>; readOnly: boolean; pending?: boolean }) {
  const draft = state.drafts.find((item) => item.version === version)
  const current = Boolean(draft) && currentDraft(state)?.version === draft?.version
  return <DetailPane title="需求草稿" open={open} onClose={() => onVersion(null)}>
    <p className="detail-intro">对照需求审阅目标与边界。确认不会启动浏览器执行。</p>
    <label className="draft-version-label">版本记录<select aria-label="版本记录" value={version ?? ""} onChange={(event) => onVersion(Number(event.target.value))}>{state.drafts.map((item) => <option key={item.version} value={item.version}>v{item.version} · {item.title}</option>)}</select></label>
    <div className="draft-document">{draft?.markdown.split("\n").filter((line) => line.trim()).map((line, index) => line.startsWith("#") ? <h3 key={index}>{line.replace(/^#+\s*/, "")}</h3> : <p key={index}>{line.replace(/^[-*]\s/, "• ")}</p>)}</div>
    <div className="draft-dialog-footer"><span>{readOnly ? "归档任务，仅供查阅" : state.confirmedVersion === version ? "这个版本已确认" : pending ? "正在核对提交状态" : current ? "确认后进入来源调研" : "历史版本，仅供查阅"}</span><Button disabled={readOnly || pending || !current || state.active || state.confirmedVersion === version} onClick={() => { if (draft) void onConfirm(draft.version) }}><Check size={15} />确认需求草稿</Button></div>
  </DetailPane>
}
