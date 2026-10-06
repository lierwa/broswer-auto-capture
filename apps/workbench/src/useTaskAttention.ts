import { useEffect, useState } from "react"
import type { TaskSummary } from "./taskContract.js"
import { attentionKey, readAttentionReceipts, saveAttentionReceipts } from "./taskAttentionReceipts.js"

/** WHY：未读和待处理是两个事实；查看不会替用户完成任务，解决/归档后提醒自动退出。 */
export function useTaskAttention(tasks: TaskSummary[], ready: boolean) {
  const [read, setRead] = useState(readAttentionReceipts)
  const visible = ready ? tasks.filter(task => !task.archived && task.attention) : []
  const isUnread = (task: TaskSummary) => !read.has(attentionKey(task))
  const unreadCount = visible.filter(isUnread).length
  useEffect(() => saveAttentionReceipts(read), [read])
  useEffect(() => {
    document.title = unreadCount ? `(${unreadCount}) 浏览器工作台` : "浏览器工作台"
  }, [unreadCount])
  return { visible, unreadCount, isUnread,
    markRead: (task: TaskSummary) => setRead(previous => new Set([...previous, attentionKey(task)])),
    markAllRead: () => setRead(previous => new Set([...previous, ...visible.map(attentionKey)])) }
}
