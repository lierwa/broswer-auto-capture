import { useEffect, useRef, useState } from "react"
import type { AccountDirectory } from "@browser-capture/contracts/account-directory"
import { accountRequest } from "./accountClient.js"

export function useAccountDirectory() {
  const [state, setState] = useState<AccountDirectory | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false)
  const generation = useRef(0), mounted = useRef(false), request = useRef(false)
  useEffect(() => {
    mounted.current = true; const abort = new AbortController(); let reading = false
    const load = async () => {
      if (reading || request.current) return
      reading = true; const version = generation.current
      try { const next = await accountRequest(undefined, abort.signal)
        if (mounted.current && version === generation.current) { setState(next); setError("") } }
      catch (e) { if (!abort.signal.aborted && mounted.current && version === generation.current) setError((e as Error).message) }
      finally { reading = false }
    }
    void load(); const subscription = setInterval(() => void load(), 750)
    // WHY：此计时器只订阅持久化事实；关闭 UI 不取消服务器的 LangGraph 登录等待。
    return () => { mounted.current = false; generation.current++; abort.abort(); clearInterval(subscription) }
  }, [])
  async function act(body?: unknown) {
    const version = ++generation.current; request.current = true; setBusy(true); setError("")
    try { const next = await accountRequest(body); if (mounted.current && version === generation.current) setState(next) }
    catch (e) { if (mounted.current && version === generation.current) setError((e as Error).message) }
    finally { request.current = false; if (mounted.current && version === generation.current) setBusy(false) }
  }
  return { state, error, busy, act }
}
