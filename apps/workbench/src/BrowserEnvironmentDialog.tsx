import { useEffect, useRef, useState } from "react"
import { Badge, Button, Dialog, DropdownMenu, Flex, IconButton, Select } from "@radix-ui/themes"
import { Check, ChevronDown, X } from "lucide-react"
import { z } from "zod"
import { BrowserEnvironmentSelect } from "./BrowserEnvironmentSelect.js"
import { BrowserProfileDialog } from "./BrowserProfileDialog.js"
import { useBrowserEnvironment } from "./useBrowserEnvironment.js"

export function BrowserEnvironmentDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange(open: boolean): void
}) {
  const environment = useBrowserEnvironment(open)
  const [profileOpen, setProfileOpen] = useState(false)
  const [dailyBusy, setDailyBusy] = useState(false)
  const pending = environment.busy || profileOpen || dailyBusy
  return <>
    <Dialog.Root open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
      <Dialog.Content className="browser-environment-dialog dialog-scroll" maxWidth="560px">
        <div className="browser-environment-heading">
          <div><Dialog.Title>浏览器环境</Dialog.Title>
            <Dialog.Description>为下一次准备和运行选择浏览器。</Dialog.Description></div>
          <Dialog.Close><IconButton variant="ghost" color="gray" aria-label="关闭浏览器设置" disabled={pending}>
            <X size={19} /></IconButton></Dialog.Close>
        </div>
        <div className="browser-environment-body">
          {environment.state && <BrowserEnvironmentSelect value={environment.state.mode}
            presentation="choices" disabled={pending} onChange={mode => void environment.select(mode)} />}
          {!environment.state && <p role="status">{environment.busy ? "正在读取浏览器设置…" : "无法读取浏览器设置。"}</p>}
          {environment.error && <p className="browser-environment-error" role="alert">{environment.error}</p>}
          {environment.state?.mode === "daily" ? <DailyChromeAuthorization open={open} onBusy={setDailyBusy} /> : environment.state && <>
            <div className="browser-connection-panel">
              <strong>专属账号</strong><p>可见与无头模式共用登录状态。在可见窗口完成登录后，关闭账号窗口再运行任务。</p>
              <Button variant="soft" color="gray" disabled={pending} onClick={() => setProfileOpen(true)}>管理登录账号</Button>
            </div>
          </>}
        </div>
        <div className="browser-environment-footer">
          <span role="status" aria-live="polite">{environment.busy ? environment.state ? "正在保存选择…" : "正在读取设置…"
            : environment.error ? environment.state ? "更改未保存，仍使用原选择" : "设置未读取" : environment.state
              ? <><Check size={14} aria-hidden="true" />已自动保存</> : "设置未读取"}</span>
          <Dialog.Close><Button variant="soft" color="gray" disabled={pending}>完成</Button></Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
    <BrowserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
  </>
}

const authorizationSchema = z.object({ paired: z.boolean(), connected: z.boolean(), busy: z.boolean(),
  profileDirectory: z.string().nullable(), extensionDirectory: z.string(),
  profiles: z.array(z.object({ id: z.string(), name: z.string() })) })
type Authorization = z.infer<typeof authorizationSchema>
type AuthorizationAction = "authorize" | "connect" | "revoke"

function DailyChromeAuthorization({ open, onBusy }: { open: boolean; onBusy(value: boolean): void }) {
  const [state, setState] = useState<Authorization | null>(null)
  const [profile, setProfile] = useState("")
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<AuthorizationAction | null>(null)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const operation = useRef(0)
  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    setBusy(true); onBusy(true)
    let first = true, reading = false
    const load = async () => {
      if (reading) return
      reading = true
      try {
        const next = authorizationSchema.parse(await authorizationRequest("GET", undefined, abort.signal))
        if (!abort.signal.aborted) {
          setState(next); setLoadError("")
          setProfile(previous => next.profileDirectory ?? (previous || next.profiles[0]?.id || ""))
        }
      } catch (error) {
        if (!abort.signal.aborted) setLoadError(error instanceof Error ? error.message : "读取授权失败。")
      } finally {
        reading = false
        if (first && !abort.signal.aborted) { first = false; setBusy(false); onBusy(false) }
      }
    }
    void load()
    const timer = setInterval(() => void load(), 2500)
    return () => { abort.abort(); clearInterval(timer); operation.current++; onBusy(false) }
  }, [open, onBusy])
  async function act(nextAction: AuthorizationAction) {
    const current = ++operation.current
    setBusy(true); onBusy(true); setAction(nextAction); setError(""); setFeedback("")
    try {
      await authorizationRequest(nextAction === "revoke" ? "DELETE" : "POST",
        nextAction === "authorize" ? { profileDirectory: profile } : undefined, undefined,
        nextAction === "revoke" ? "" : `/${nextAction}`)
      const next = authorizationSchema.parse(await authorizationRequest("GET"))
      if (current === operation.current) { setState(next); setLoadError("") }
    } catch (error) {
      if (current === operation.current) setError(error instanceof Error ? error.message : "授权操作失败。")
    } finally {
      // WHY：取消沿服务端原 revoke 队列；迟到的批准/失败不能覆盖更新后的界面事实。
      if (current === operation.current) { setBusy(false); onBusy(false); setAction(null) }
    }
  }
  const pending = busy || Boolean(state?.busy)
  useEffect(() => { onBusy(pending) }, [pending, onBusy])
  return <section className="browser-connection-panel" aria-label="日常 Chrome 授权与连接" aria-busy={pending}>
    <DailyAuthorizationSummary state={state} action={action} loadError={loadError} />
    {state && !state.paired && <DailyChromeInstallation state={state} profile={profile}
      disabled={pending || Boolean(loadError)} onProfile={setProfile} onFeedback={setFeedback} onError={setError} />}
    {state && <DailyAuthorizationActions state={state} action={action} pending={pending}
      disabled={Boolean(loadError)} profile={profile} onAction={next => void act(next)} />}
    {feedback && <p className="browser-environment-feedback" role="status" aria-live="polite">{feedback}</p>}
    {error && <p className="browser-environment-error" role="alert">{error}</p>}
  </section>
}

function DailyAuthorizationSummary({ state, action, loadError }: { state: Authorization | null;
  action: AuthorizationAction | null; loadError: string }) {
  const profile = state?.profiles.find(item => item.id === state.profileDirectory)?.name ?? state?.profileDirectory
  const pending = action !== null || state?.busy
  const authorizing = action === "authorize" || (pending && !state?.paired)
  const label = loadError ? "状态未知" : action === "revoke" ? "撤销中" : authorizing ? "等待批准"
    : !state ? "读取中" : state.paired ? "已授权" : "未授权"
  const connection = loadError || !state ? "暂时无法确认" : action === "revoke" ? "正在断开…"
    : authorizing ? "请在 Chrome 点击「允许并保存授权」" : action === "connect" ? "正在连接…"
    : pending ? "正在处理…" : state.connected ? "已连接" : "未连接"
  return <div role="status" aria-live="polite">
    <div className="browser-connection-heading"><strong>Chrome 连接</strong>
      <Badge size="2" color={loadError || !state || pending || !state.paired ? "gray" : "green"}>{label}</Badge></div>
    {state?.paired && <dl className="browser-connection-facts"><div><dt>Chrome 用户</dt><dd>{profile}</dd></div>
      <div><dt>连接状态</dt><dd data-connected={state.connected && !pending && !loadError}>{connection}</dd></div></dl>}
    <p>{loadError ? "暂时无法读取状态，请检查本地服务。" : !state ? "正在读取授权状态…" : action === "revoke" ? "正在撤销授权并断开控制。" : authorizing ? connection
      : state.paired ? "授权已保存；运行时自动连接，无需再次授权。" : "首次授权在 Chrome 确认一次，之后自动复用。"}</p>
    {loadError && <p className="browser-environment-error" role="alert">{loadError}</p>}
  </div>
}

function DailyAuthorizationActions({ state, action, pending, disabled, profile, onAction }: {
  state: Authorization; action: AuthorizationAction | null; pending: boolean; disabled: boolean; profile: string
  onAction(action: AuthorizationAction): void
}) {
  // WHY：取消首次批准沿原 revoke；连接已保存授权时不把“取消连接”暗中解释为删除凭据。
  const cancellable = pending && (action === "authorize" || state.busy && !state.paired) && action !== "revoke"
  return <Flex className="browser-connection-actions" gap="3" align="center" justify="between">
    {cancellable ? <Button variant="ghost" color="gray" onClick={() => onAction("revoke")}>
      {state.paired ? "取消并撤销授权" : "取消授权"}</Button> : state.paired ? <DropdownMenu.Root>
      <DropdownMenu.Trigger><Button variant="ghost" color="gray" disabled={pending || disabled}>
        授权管理<ChevronDown size={14} aria-hidden="true" /></Button></DropdownMenu.Trigger>
      <DropdownMenu.Content><DropdownMenu.Item onSelect={() => onAction("authorize")}>重新授权</DropdownMenu.Item>
        <DropdownMenu.Separator /><DropdownMenu.Item color="red" onSelect={() => onAction("revoke")}>撤销授权</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root> : <span />}
    {(!state.connected || action === "authorize") && <Button disabled={pending || disabled || !profile}
      onClick={() => onAction(state.paired ? "connect" : "authorize")}>
      {action === "revoke" ? "正在撤销…" : pending ? action === "authorize" || state.busy && !state.paired ? "等待 Chrome 批准…"
        : action === "connect" ? "正在连接…" : "正在处理…"
        : state.paired ? "连接 Chrome" : "授权并连接"}</Button>}
  </Flex>
}

function DailyChromeInstallation({ state, profile, disabled, onProfile, onFeedback, onError }: {
  state: Authorization; profile: string; disabled: boolean; onProfile(value: string): void
  onFeedback(value: string): void; onError(value: string): void
}) {
  return <div className="browser-chrome-installation">
    <label><span>Chrome 用户</span><Select.Root value={profile} disabled={disabled} onValueChange={onProfile}>
      <Select.Trigger placeholder="选择 Chrome 用户" aria-label="日常 Chrome 用户" />
      <Select.Content>{state.profiles.map(item => <Select.Item key={item.id} value={item.id}>{item.name}</Select.Item>)}</Select.Content>
    </Select.Root></label>
    {!state.profiles.length && <p className="browser-environment-error">未找到 Chrome 用户，请先打开 Chrome。</p>}
    <details><summary>首次安装扩展</summary>
      <p>在所选 Chrome 打开 <code>chrome://extensions</code>，启用开发者模式，选择“加载已解压的扩展程序”，加载下面的文件夹。</p>
      <code className="browser-extension-directory">{state.extensionDirectory}</code>
      <Button size="1" variant="soft" color="gray" disabled={disabled} onClick={() => { void navigator.clipboard.writeText(state.extensionDirectory)
        .then(() => onFeedback("扩展目录已复制。"), () => onError("复制失败，请选择目录文字复制。")) }}>复制文件夹路径</Button>
    </details>
  </div>
}

async function authorizationRequest(method: string, body?: unknown, signal?: AbortSignal, suffix = ""): Promise<unknown> {
  const response = await fetch(`/api/browser/daily-chrome${suffix}`, {
    method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  })
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(value).error)
  return value
}
