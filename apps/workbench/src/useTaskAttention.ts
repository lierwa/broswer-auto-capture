import { useEffect, useRef, useState } from "react"
import type { TaskSummary } from "./taskContract.js"

function key(task: TaskSummary) {
  const attention = task.attention
  return attention ? `${task.id}:${attention.source}:${attention.id}:${attention.kind}` : ""
}

/** WHY：提醒来自服务端持久事实；本地仅记已见终态，刷新后仍显示需要用户处理的等待。 */
export function useTaskAttention(tasks: TaskSummary[], ready: boolean) {
  const seen = useRef<Set<string> | null>(null)
  const [recent, setRecent] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!ready) return
    const current = new Set(tasks.filter((task) => task.attention).map(key))
    if (!seen.current) { seen.current = current; return }
    const newlyTerminal = tasks.filter((task) => task.attention?.kind !== "action_required"
      && task.attention && !seen.current!.has(key(task)))
    if (newlyTerminal.length) setRecent((previous) => new Set([...previous, ...newlyTerminal.map(key)]))
    // WHY：同一 execution 恢复后可能再次等待；只记当前可见状态，下一次等待仍需提示。
    seen.current = current
  }, [tasks, ready])
  const visible = tasks.filter((task) => task.attention
    && (task.attention.kind === "action_required" || recent.has(key(task))))
  const actionCount = visible.filter((task) => task.attention?.kind === "action_required").length
  useEffect(() => {
    document.title = actionCount ? `(${actionCount}) 浏览器工作台` : "浏览器工作台"
  }, [actionCount])
  return { visible, actionCount, dismiss: (task: TaskSummary) => setRecent((previous) => {
    const next = new Set(previous); next.delete(key(task)); return next
  }) }
}
