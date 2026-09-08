import { useCallback, useEffect, useMemo, useState } from "react"
import { createAIClient, parseModelSelection, type ModelAccountCatalogEntry, type ModelSelection } from "@agent-platform/ai-connect/client"

export function useModelSettings() {
  const client = useMemo(() => createAIClient({ baseURL: "/api/ai" }), [])
  const [accounts, setAccounts] = useState<readonly ModelAccountCatalogEntry[]>([])
  const [selection, setSelection] = useState<ModelSelection>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [response, catalog] = await Promise.all([fetch("/api/model-settings"), client.catalog()])
      if (!response.ok) throw new Error("load_failed")
      if (!catalog.data) throw catalog.error ?? new Error("catalog_load_failed")
      const value: unknown = await response.json()
      const selected = value && typeof value === "object" && "selection" in value ? value.selection : undefined
      setSelection(selected === null ? undefined : parseModelSelection(selected))
      setAccounts(catalog.data.data)
      setError("")
    } catch { setError("无法读取模型设置，请检查本地服务。") }
    finally { setLoading(false) }
  }, [client])
  useEffect(() => { void load(); return client.subscribeCatalog(() => { void load() }) }, [client, load])
  const save = async (value: ModelSelection) => {
    setSaving(true)
    try {
      const response = await fetch("/api/model-settings", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: value }),
      })
      if (!response.ok) throw new Error("save_failed")
      const result: unknown = await response.json()
      if (!result || typeof result !== "object" || !("selection" in result)) throw new Error("save_failed")
      setSelection(parseModelSelection(result.selection))
      setError("")
    } catch (cause) {
      setError("无法保存模型设置，请重试。")
      throw cause
    } finally { setSaving(false) }
  }
  return { client, accounts, selection, loading, saving, error,
    ready: modelInvocationReady({ selection, loading, error }), save, load }
}

export function modelInvocationReady(input: {
  selection: ModelSelection | undefined
  loading: boolean
  error: string
}) {
  return Boolean(input.selection) && !input.loading && !input.error
}
