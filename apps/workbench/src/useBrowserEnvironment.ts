import { useEffect, useState } from "react"
import { browserEnvironmentSchema, type BrowserMode } from "@browser-capture/contracts/browser-profile"
import { z } from "zod"

const failure = z.object({ error: z.string() })
type Environment = z.infer<typeof browserEnvironmentSchema>

export function useBrowserEnvironment(open: boolean) {
  const [state, setState] = useState<Environment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    setState(null); setBusy(true); setError("")
    void fetch("/api/browser-environment", { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("无法读取浏览器选择，请检查本地服务。")
      const next = browserEnvironmentSchema.parse(await response.json())
      if (!abort.signal.aborted) setState(next)
    }).catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "读取浏览器选择失败。") })
      .finally(() => { if (!abort.signal.aborted) setBusy(false) })
    return () => abort.abort()
  }, [open])
  async function select(mode: BrowserMode) {
    if (!state || busy) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/browser-environment", { method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, expectedRevision: state.revision }) })
      const raw: unknown = await response.json()
      if (!response.ok) throw new Error(failure.parse(raw).error)
      setState(browserEnvironmentSchema.parse(raw))
    } catch (error) { setError(error instanceof Error ? error.message : "浏览器选择未能保存。") }
    finally { setBusy(false) }
  }
  return { state, busy, error, select }
}
