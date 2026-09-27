import { useEffect, useState } from "react"
import { Badge, Button, Dialog } from "@radix-ui/themes"
import { browserProfileStateSchema, type BrowserProfileState } from "@browser-capture/contracts/browser-profile"
import { CircleUserRound } from "lucide-react"
import { z } from "zod"

const errorSchema = z.object({ error: z.string() })

function profileStatusLabel(state: BrowserProfileState | null, busy: boolean, error: boolean) {
  if (busy) return state?.status === "cleanup_required" ? "正在核验" : state?.status === "open" ? "正在关闭" : "正在打开"
  if (!state) return error ? "状态未知" : "正在读取状态"
  if (state.status === "closed") return error ? "状态待确认" : "可供任务使用"
  return { open: "浏览器已打开", opening: "正在打开", closing: "正在关闭",
    cleanup_required: "清理待确认" }[state.status]
}

export function BrowserProfileDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const [state, setState] = useState<BrowserProfileState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function load() {
    try {
      const response = await fetch("/api/browser-profile")
      if (!response.ok) throw new Error("无法读取专用浏览器状态。")
      setState(browserProfileStateSchema.parse(await response.json()))
    } catch { setState(null); setError("无法读取专用浏览器状态，请检查本地服务。") }
  }
  useEffect(() => {
    setState(null)
    if (open) { setError(""); void load() }
  }, [open])

  async function control(type: "open" | "close" | "recover") {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/browser-profile", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) })
      const raw: unknown = await response.json()
      if (!response.ok) throw new Error(errorSchema.parse(raw).error)
      const next = browserProfileStateSchema.parse(raw)
      setState(next)
      if (type === "close" || type === "recover") onOpenChange(false)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "专用浏览器操作未完成。"
      await load()
      setError(message)
    } finally { setBusy(false) }
  }

  const active = state ? state.status !== "closed" : false
  const statusLabel = profileStatusLabel(state, busy, Boolean(error))
  const changeOpen = (next: boolean) => {
    if (!next && (busy || state?.status === "opening" || state?.status === "closing")) {
      setError("浏览器正在处理，请稍后再关闭。"); return
    }
    if (!next && state?.status === "cleanup_required") { onOpenChange(false); return }
    if (!next && active) {
      setError("请先点击“完成账号操作并关闭”，让任务重新获得浏览器。"); return
    }
    onOpenChange(next)
  }
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Content className="browser-profile-dialog" maxWidth="560px">
      <div className="browser-profile-heading">
        <span className="browser-profile-mark"><CircleUserRound aria-hidden="true" size={23} /></span>
        <div><Dialog.Title>B-A-T 专用浏览器</Dialog.Title>
          <Dialog.Description>在网站完成登录后，关闭此窗口再运行任务。</Dialog.Description></div>
        <Badge color={state?.status === "closed" && !busy && !error ? "green" : active ? "amber" : "gray"}
          variant="soft">{statusLabel}</Badge>
      </div>
      {state?.status === "cleanup_required" && <div className="browser-profile-error" role="alert">
        专用浏览器清理尚未确认。核验会关闭本次拥有的窗口，保留账号登录状态。
      </div>}
      {error && <div className="browser-profile-error" role="alert">{error}</div>}
      <div className="browser-profile-actions">
        {(!active || state?.status === "cleanup_required") && <Dialog.Close>
          <Button variant="soft" color="gray" disabled={busy}>返回工作台</Button></Dialog.Close>}
        {((!state && error) || state?.status === "opening" || state?.status === "closing" || state?.status === "cleanup_required"
          || (state?.status === "closed" && error)) && <Button variant="soft" disabled={busy}
            onClick={() => { setState(null); setError(""); void load() }}>重新读取状态</Button>}
        {state?.status === "open" && <Button disabled={busy}
          onClick={() => void control("close")}>完成账号操作并关闭</Button>}
        {state?.status === "cleanup_required" && <Button disabled={busy}
          onClick={() => void control("recover")}>核验并关闭本次窗口</Button>}
        {state?.status === "closed" && !error && <Button disabled={busy}
          onClick={() => void control("open")}>打开专用浏览器</Button>}
      </div>
    </Dialog.Content>
  </Dialog.Root>
}
