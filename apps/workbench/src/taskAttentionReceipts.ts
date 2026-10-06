import type { TaskSummary } from "./taskContract.js"
const storageKey = "bat.task-attention.read.v1"

export function attentionKey(task: TaskSummary) {
  const a = task.attention
  return a ? `${task.id}:${a.source}:${a.id}:${a.kind}:${a.sequence}` : ""
}
export function readAttentionReceipts(storage?: Pick<Storage, "getItem">) {
  try {
    const value: unknown = JSON.parse((storage ?? localStorage).getItem(storageKey) ?? "[]")
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(-200) : [])
  } catch { return new Set<string>() }
}
export function saveAttentionReceipts(read: Set<string>, storage?: Pick<Storage, "setItem">) {
  try { (storage ?? localStorage).setItem(storageKey, JSON.stringify([...read].slice(-200))) } catch { /* 当前界面仍可标记已读。 */ }
}
