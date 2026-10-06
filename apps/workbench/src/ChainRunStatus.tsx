import { Check, Circle, Clock, LoaderCircle, Minus, Pause, X } from "lucide-react"
import type { ChainRunTone } from "./chainWorkbenchProjection.js"

export function toneLabel(tone: ChainRunTone) {
  return { idle: "待运行", queued: "已排队", running: "运行中", success: "已完成",
    waiting: "等待人工", failure: "未完成", skipped: "已跳过", ended: "已结束", unselected: "本次未进入" }[tone]
}

export function StatusIcon({ tone, label }: { tone: ChainRunTone; label?: string | undefined }) {
  const Icon = { idle: Circle, queued: Clock, running: LoaderCircle, success: Check,
    waiting: Pause, failure: X, skipped: Minus, ended: Pause, unselected: Minus }[tone]
  return <span className="chain-status-icon" data-tone={tone} role="img" aria-label={label ?? toneLabel(tone)}
    title={label ?? toneLabel(tone)}><Icon className="chain-run-icon" size={12} aria-hidden="true" /></span>
}
