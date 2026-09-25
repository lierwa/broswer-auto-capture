import { useEffect, useState } from "react"
import { Badge, Button, Dialog } from "@radix-ui/themes"
import { browserProfileStateSchema, type BrowserProfileState } from "@browser-capture/contracts/browser-profile"
import { CheckCircle2, CircleUserRound, MonitorUp, ShieldCheck } from "lucide-react"
import { z } from "zod"

const errorSchema = z.object({ error: z.string() })

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
      setState(browserProfileStateSchema.parse(await response.json())); setError("")
    } catch { setError("无法读取专用浏览器状态，请检查本地服务。") }
  }
  useEffect(() => { if (open) void load() }, [open])

  async function control(type: "open" | "close") {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/browser-profile", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) })
      const raw: unknown = await response.json()
      if (!response.ok) throw new Error(errorSchema.parse(raw).error)
      const next = browserProfileStateSchema.parse(raw)
      setState(next)
      if (type === "close") onOpenChange(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "专用浏览器操作未完成。")
      await load()
    } finally { setBusy(false) }
  }

  const active = state ? state.status !== "closed" : false
  const changeOpen = (next: boolean) => {
    if (!next && active) { setError("请先点击“完成账号操作并关闭”，让任务重新获得浏览器。") ; return }
    onOpenChange(next)
  }
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Content className="browser-profile-dialog" maxWidth="560px">
      <div className="browser-profile-heading">
        <span className="browser-profile-mark"><CircleUserRound aria-hidden="true" size={23} /></span>
        <div><Dialog.Title>B-A-T 专用浏览器</Dialog.Title>
          <Dialog.Description>在独立于日常 Chrome 的本机空间里管理网站登录状态。</Dialog.Description></div>
        <Badge color={active ? "amber" : "green"} variant="soft">
          {state?.status === "open" ? "浏览器已打开" : state?.status === "opening" ? "正在打开"
            : state?.status === "closing" ? "正在关闭" : "可供任务使用"}
        </Badge>
      </div>
      <div className="browser-profile-principles">
        <div><ShieldCheck aria-hidden="true" size={18} /><span><strong>登录态只存本机</strong><small>任务共享这个专用空间，不读取或同步密码。</small></span></div>
        <div><MonitorUp aria-hidden="true" size={18} /><span><strong>账号切换由网站完成</strong><small>打开后，在网站内退出或切换账号；完成后关闭窗口。</small></span></div>
        <div><CheckCircle2 aria-hidden="true" size={18} /><span><strong>关闭后再运行任务</strong><small>准备和复跑会自动使用刚保存的登录状态。</small></span></div>
      </div>
      {error && <div className="browser-profile-error" role="alert">{error}</div>}
      <div className="browser-profile-actions">
        {!active && <Dialog.Close><Button variant="soft" color="gray" disabled={busy}>返回工作台</Button></Dialog.Close>}
        {state?.status === "open"
          ? <Button disabled={busy} onClick={() => void control("close")}>{busy ? "正在关闭…" : "完成账号操作并关闭"}</Button>
          : <Button disabled={busy || !state || state.status === "opening" || state.status === "closing"}
              onClick={() => void control("open")}>{busy ? "正在打开…" : "打开专用浏览器"}</Button>}
      </div>
    </Dialog.Content>
  </Dialog.Root>
}
