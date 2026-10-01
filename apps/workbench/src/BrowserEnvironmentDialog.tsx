import { useEffect, useState } from "react"
import { Button, Dialog, Flex, Select, TextField } from "@radix-ui/themes"
import { z } from "zod"
import { BrowserEnvironmentSelect, browserModeLabels } from "./BrowserEnvironmentSelect.js"
import { BrowserProfileDialog } from "./BrowserProfileDialog.js"
import { useBrowserEnvironment } from "./useBrowserEnvironment.js"

export function BrowserEnvironmentDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange(open: boolean): void
}) {
  const environment = useBrowserEnvironment(open)
  const [profileOpen, setProfileOpen] = useState(false)
  const [dailyBusy, setDailyBusy] = useState(false)
  return <>
    <Dialog.Root open={open} onOpenChange={next => { if (!environment.busy && !profileOpen && !dailyBusy) onOpenChange(next) }}>
      <Dialog.Content maxWidth="560px">
        <Dialog.Title>浏览器环境</Dialog.Title>
        <Dialog.Description>保存后，下一次准备任务和运行使用此环境。切换环境无需重新验证已发布链路。</Dialog.Description>
        <Flex direction="column" gap="3" mt="4">
          {environment.state && <BrowserEnvironmentSelect value={environment.state.mode}
            disabled={environment.busy || dailyBusy} onChange={mode => void environment.select(mode)} />}
          <p role="status" aria-live="polite">{environment.busy ? "正在处理浏览器选择…" : environment.state
            ? `已保存：${browserModeLabels[environment.state.mode]}` : "浏览器选择未能读取。"}</p>
          {environment.error && <p className="error-text" role="alert">{environment.error}</p>}
          {environment.state?.mode === "daily" ? <DailyChromeAuthorization open={open} onBusy={setDailyBusy} /> : environment.state && <>
            <p>两种专属模式使用同一个 B-A-T Profile。完成账号登录后关闭账号窗口，再准备或运行任务。</p>
            <Button variant="soft" disabled={environment.busy} onClick={() => setProfileOpen(true)}>管理专属 Profile 账号</Button>
          </>}
          <Dialog.Close><Button variant="soft" color="gray" disabled={environment.busy || profileOpen || dailyBusy}>返回工作台</Button></Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
    <BrowserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
  </>
}

const authorizationSchema = z.object({ paired: z.boolean(), connected: z.boolean(), busy: z.boolean(),
  profileDirectory: z.string().nullable(), extensionDirectory: z.string(),
  profiles: z.array(z.object({ id: z.string(), name: z.string() })) })
type Authorization = z.infer<typeof authorizationSchema>

function DailyChromeAuthorization({ open, onBusy }: { open: boolean; onBusy(value: boolean): void }) {
  const [state, setState] = useState<Authorization | null>(null)
  const [profile, setProfile] = useState("")
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    setBusy(true); onBusy(true)
    void authorizationRequest("GET", undefined, abort.signal).then(value => {
      if (abort.signal.aborted) return
      const next = authorizationSchema.parse(value)
      setState(next); setProfile(next.profileDirectory ?? next.profiles[0]?.id ?? "")
    }).catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "读取授权失败。") })
      .finally(() => { if (!abort.signal.aborted) { setBusy(false); onBusy(false) } })
    return () => { abort.abort(); onBusy(false) }
  }, [open, onBusy])
  async function act(method: "POST" | "PUT" | "DELETE") {
    setBusy(true); onBusy(true); setError(""); setFeedback("正在处理授权…")
    try {
      await authorizationRequest(method, method === "POST" ? { profileDirectory: profile }
        : method === "PUT" ? { profileDirectory: profile, token } : undefined)
      const next = authorizationSchema.parse(await authorizationRequest("GET"))
      setState(next); setToken("")
      setFeedback(method === "POST" ? "已打开扩展授权页，请复制授权码。"
        : method === "PUT" ? "连接已验证，授权已保存。" : "授权已撤销，当前连接已断开。")
    } catch (error) { setFeedback(""); setError(error instanceof Error ? error.message : "授权操作失败。") }
    finally { setBusy(false); onBusy(false) }
  }
  return <Flex direction="column" gap="3">
    <p>只绑定一个日常 Chrome Profile；任务创建自己的窗口，保留你的日常标签页。</p>
    {state && <>
      <p role="status">{state.paired ? state.connected ? "持久授权已保存，扩展已连接。" : "持久授权已保存，运行时自动连接 Chrome。"
        : "尚未保存扩展授权。"}</p>
      <Select.Root value={profile} disabled={busy || state.paired} onValueChange={setProfile}>
        <Select.Trigger placeholder="选择日常 Chrome Profile" aria-label="日常 Chrome Profile" />
        <Select.Content>{state.profiles.map(item => <Select.Item key={item.id} value={item.id}>{item.name}</Select.Item>)}</Select.Content>
      </Select.Root>
      {!state.paired && <>
        <p>首次在 Chrome 的扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，加载以下文件夹：</p>
        <code style={{ overflowWrap: "anywhere" }}>{state.extensionDirectory}</code>
        <Button variant="soft" disabled={busy || !profile} onClick={() => void act("POST")}>打开 Chrome 扩展授权页</Button>
        <TextField.Root type="password" autoComplete="off" aria-label="扩展授权码" placeholder="粘贴扩展页的授权码"
          value={token} disabled={busy} onChange={event => setToken(event.target.value)} />
        <Button disabled={busy || !profile || !token.trim()} onClick={() => void act("PUT")}>连接并保存授权</Button>
      </>}
      {state.paired && <Button variant="soft" color="red" disabled={busy} onClick={() => void act("DELETE")}>撤销持久授权</Button>}
    </>}
    {feedback && <p role="status" aria-live="polite">{feedback}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </Flex>
}

async function authorizationRequest(method: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/browser/daily-chrome${method === "POST" ? "/authorize" : ""}`, {
    method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  })
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(value).error)
  return value
}
