import type { JsonValue } from "@browser-capture/contracts"
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react"

export function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 size={18} />
  if (["failed", "blocked"].includes(status)) return <AlertTriangle size={18} />
  return <Clock3 size={18} />
}

export function ResultValue({ value }: { value: JsonValue | null }) {
  if (value === null) return <p>本次运行没有返回结构化数据。</p>
  if (Array.isArray(value)) return <ol className="context-value-list">{value.map((item, index) => <li key={index}><ResultValue value={item} /></li>)}</ol>
  if (typeof value === "object") return <dl className="context-value-record">{Object.entries(value).map(([key, item]) =>
    <div key={key}><dt>{key}</dt><dd><ResultValue value={item} /></dd></div>)}</dl>
  return <span>{String(value)}</span>
}

export function executionStatus(status: string) {
  return ({ queued: "已排队", running: "正在运行", completed: "运行完成", partial: "部分完成",
    waiting_for_human: "等待人工处理", paused: "已暂停", cleanup_required: "待清理",
    blocked: "运行受阻", failed: "运行失败", cancelled: "已取消", stale: "历史运行" } as Record<string, string>)[status] ?? status
}

export function cleanupStatus(status: string) {
  return ({ not_recorded: "未记录", pending: "清理中", confirmed: "已确认",
    unconfirmed: "待确认" } as Record<string, string>)[status] ?? status
}

export function historicalEventStatus(status: string, outcome: string | null) {
  if (status === "planned") return "已排队"
  if (status === "started") return "正在运行"
  return outcome === "success" ? "成功" : `已结束 · ${outcome ?? "未知出口"}`
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}
