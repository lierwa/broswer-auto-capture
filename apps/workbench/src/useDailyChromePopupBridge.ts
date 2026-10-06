import { useEffect } from "react"
import { z } from "zod"

type Reply = { success?: boolean; resumeRequested?: boolean }
type Runtime = { lastError?: { message?: string }; sendMessage(extensionId: string, message: unknown,
  callback: (result?: Reply) => void): void }
function runtime(): Runtime | undefined {
  return (window as Window & { chrome?: { runtime?: Runtime } }).chrome?.runtime
}
export function canOpenDailyChromePopup() { return Boolean(runtime()?.sendMessage) }
const stateSchema = z.object({ paired: z.boolean(), connected: z.boolean(), busy: z.boolean(),
  extensionId: z.string().regex(/^[a-p]{32}$/), profileDirectory: z.string().nullable(),
  profiles: z.array(z.object({ id: z.string(), name: z.string() })),
  popupRequest: z.object({ url: z.string().url(), extensionId: z.string(),
    profileName: z.string(), profileDirectory: z.string(), openPopup: z.boolean() }).nullable() })

function send(chrome: Runtime, id: string, message: unknown) {
  return new Promise<Reply | undefined>(resolve => chrome.sendMessage(id, message, result => {
    resolve(chrome.lastError ? undefined : result)
  }))
}

// WHY：原同源工作台消费一次恢复意图；扩展不绕过 Origin/Fetch Metadata，不持有服务端写权限。
export function useDailyChromePopupBridge() {
  useEffect(() => {
    const chrome = runtime()
    if (!chrome?.sendMessage) return
    const abort = new AbortController()
    let reading = false, forwarded = ""
    const resume = async (extensionId: string) => {
      try {
        const response = await fetch("/api/browser/daily-chrome/connect", { method: "POST",
          headers: { "content-type": "application/json" }, body: JSON.stringify({ openPopup: false }), signal: abort.signal })
        if (!response.ok) throw new Error("connect_failed")
      } catch {
        if (!abort.signal.aborted) await send(chrome, extensionId, { type: "bat.resumeFailed" })
      }
    }
    const poll = async () => {
      if (reading) return
      reading = true
      try {
        const response = await fetch("/api/browser/daily-chrome", { signal: abort.signal })
        if (!response.ok) return
        const state = stateSchema.parse(await response.json())
        const feedback = await send(chrome, state.extensionId, { type: "bat.syncWorkbench", state: {
          paired: state.paired, connected: state.connected, busy: state.busy,
          profileName: state.profiles.find(profile => profile.id === state.profileDirectory)?.name ?? null,
        } })
        if (abort.signal.aborted) return
        // 不等待连接 POST 完成；后续轮询必须继续转发原私有票据。
        if (feedback?.success && feedback.resumeRequested) void resume(state.extensionId)
        const request = state.popupRequest
        if (!request || request.url === forwarded) return
        forwarded = request.url
        const result = await send(chrome, state.extensionId, { type: "bat.connectPopup", request })
        if (!result?.success && !abort.signal.aborted) window.dispatchEvent(new CustomEvent("bat-extension-feedback", {
          detail: "请在 Chrome 扩展管理页重新加载 B-A-T 扩展，再点击右上角扩展图标继续。",
        }))
      } catch { /* 状态暂不可读时等待下一次读取，不触发授权或切换浏览器。 */ }
      finally { reading = false }
    }
    void poll()
    const timer = setInterval(() => void poll(), 800)
    return () => { abort.abort(); clearInterval(timer) }
  }, [])
}
