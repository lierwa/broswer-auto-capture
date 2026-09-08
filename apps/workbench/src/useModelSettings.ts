import { useCallback, useEffect, useMemo, useState } from "react"
import { createAIClient, parseModelSelection, type ModelSelection } from "@agent-platform/ai-connect/client"

export function useModelSettings() {
  const client = useMemo(() => createAIClient({ baseURL: "/api/ai" }), [])
  const [selection, setSelection] = useState<ModelSelection>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/model-settings")
      if (!response.ok) throw new Error("load_failed")
      const value: unknown = await response.json()
      const selected = value && typeof value === "object" && "selection" in value ? value.selection : undefined
      setSelection(selected === null ? undefined : parseModelSelection(selected))
      setError("")
    } catch { setError("无法读取模型设置，请检查本地服务。") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(); return client.subscribeCatalog(() => { void load() }) }, [client, load])
  const save = async (value: ModelSelection) => {
    const response = await fetch("/api/model-settings", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection: value }),
    })
    if (!response.ok) throw new Error("save_failed")
    const result: unknown = await response.json()
    if (!result || typeof result !== "object" || !("selection" in result)) throw new Error("save_failed")
    setSelection(parseModelSelection(result.selection))
    setError("")
  }
  return { client, selection, loading, error, save }
}
