import { useEffect, useRef, useState } from "react"
import { z } from "zod"
import { taskIdSchema, taskListSchema, type TaskAction, type TaskSummary } from "./taskContract.js"

const responseSchema = z.object({ id: taskIdSchema, tasks: taskListSchema })
export function useTasks() {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [visited, setVisited] = useState<string[]>([])
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingCreate, setPendingCreate] = useState<string | null>(null)
  const createId = useRef<string | null>(null)
  const selection = useRef<string | null>(null)
  const mutating = useRef(false)
  const mutationEpoch = useRef(0)
  function select(id: string | null) {
    selection.current = id
    setSelected(id)
    if (id) setVisited((current) => current.includes(id) ? current : [...current, id])
    try { if (id) localStorage.setItem("browser-capture.selected-task", id); else localStorage.removeItem("browser-capture.selected-task") } catch { /* 禁用浏览器存储不阻塞服务端任务。 */ }
  }
  useEffect(() => {
    let disposed = false
    let restoring = true
    async function refresh() {
      const epoch = mutationEpoch.current
      try {
        const response = await fetch("/api/tasks")
        if (!response.ok) throw new Error("任务服务不可用")
        const value = taskListSchema.parse(await response.json())
        if (disposed || mutating.current || epoch !== mutationEpoch.current) return
        setTasks(value); setReady(true); setLoadError("")
        if (restoring) {
          let saved: string | null = null
          try { saved = localStorage.getItem("browser-capture.selected-task") } catch { /* 内存选择仍可用。 */ }
          select(value.find((task) => task.id === saved && !task.archived)?.id ?? value.find((task) => !task.archived)?.id ?? null)
          restoring = false
        }
      } catch { if (!disposed) setLoadError("无法读取本地任务列表，请检查服务后刷新。") }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 1500)
    return () => { disposed = true; clearInterval(timer) }
  }, [reloadKey])

  async function action(input: TaskAction) {
    if (mutating.current) return false
    mutationEpoch.current += 1
    mutating.current = true; setBusy(true); setError("")
    try {
      // WHY：新建响应丢失时沿用同一幂等键，恢复请求不会创建第二个任务。
      if (input.type === "create") createId.current ??= crypto.randomUUID()
      const command = input.type === "create" ? { ...input, requestId: createId.current } : input
      const response = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) })
      const value: unknown = await response.json()
      if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(value).error)
      const result = responseSchema.parse(value)
      setTasks(result.tasks)
      if (input.type === "create") { select(result.id); createId.current = null; setPendingCreate(null) }
      if (input.type === "archive" && input.archived && selection.current === input.id) select(result.tasks.find((task) => !task.archived)?.id ?? null)
      return true
    } catch (failure) { if (input.type === "create") setPendingCreate(createId.current); setError(failure instanceof Error ? failure.message : "任务操作未完成。"); return false }
    finally { mutating.current = false; setBusy(false) }
  }
  return { tasks, selected, visited, ready, busy, pendingCreate, error: error || loadError, select, action, reload: () => setReloadKey((value) => value + 1) }
}
