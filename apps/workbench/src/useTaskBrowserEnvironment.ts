import { useEffect, useState } from "react"
import { taskBrowserEnvironmentSchema, type BrowserMode } from "@browser-capture/contracts/browser-profile"
import { z } from "zod"

export function useTaskBrowserEnvironment(open: boolean, taskId: string) {
  const [state, setState] = useState<z.infer<typeof taskBrowserEnvironmentSchema> | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  const url = `/api/task-browser-environment?taskId=${encodeURIComponent(taskId)}`
  useEffect(() => {
    if (!open) return
    const abort = new AbortController(); setState(null); setBusy(true); setError("")
    void fetch(url, { signal: abort.signal }).then(async response => {
      if (!response.ok) throw Error("无法读取本任务浏览器选择。")
      const next = taskBrowserEnvironmentSchema.parse(await response.json())
      if (!abort.signal.aborted) setState(next)
    }).catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "读取失败。") })
      .finally(() => { if (!abort.signal.aborted) setBusy(false) })
    return () => abort.abort()
  }, [open, url])
  async function select(mode: BrowserMode | null) {
    if (!state || busy) return false
    setBusy(true); setError("")
    try {
      const response = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, mode, expectedRevision: state.revision }) })
      const value: unknown = await response.json()
      if (!response.ok) throw Error(z.object({ error: z.string() }).parse(value).error)
      setState(taskBrowserEnvironmentSchema.parse(value)); return true
    } catch (error) { setError(error instanceof Error ? error.message : "选择未保存。"); return false }
    finally { setBusy(false) }
  }
  return { state, busy, error, select }
}
