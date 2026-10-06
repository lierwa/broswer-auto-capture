import { useEffect, useRef, useState } from "react"
import { Badge, Button, Dialog, Flex, IconButton, Select } from "@radix-ui/themes"
import { Check, ChevronRight, Chrome, KeyRound, X } from "lucide-react"
import { z } from "zod"
import { BrowserEnvironmentSelect, DedicatedBrowserVisibility } from "./BrowserEnvironmentSelect.js"
import { BrowserAccountView, useAccountViewport } from "./BrowserAccountView.js"
import "./browser-account.css"
import { useBrowserEnvironment } from "./useBrowserEnvironment.js"
import { canOpenDailyChromePopup } from "./useDailyChromePopupBridge.js"

export function BrowserEnvironmentDialog({ open, onOpenChange, doneLabel = "完成", onTask }: {
  open: boolean; onOpenChange(open: boolean): void; doneLabel?: string; onTask?(id: string): void
}) {
  const environment = useBrowserEnvironment(open)
  const [accountKind, setAccountKind] = useState<boolean>(false)
  const pending = environment.busy
  const viewport = useAccountViewport()
  useEffect(() => { if (!open) setAccountKind(false) }, [open])
  return <>
    <Dialog.Root open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
      <Dialog.Content className={accountKind ? `browser-environment-dialog account-dialog ${viewport.short ? "short" : ""}` : "browser-environment-dialog dialog-scroll"} maxWidth={accountKind ? "864px" : "560px"}>
        <div className="browser-environment-heading">
          <div>{accountKind && <IconButton variant="ghost" color="gray" aria-label="返回浏览器设置" onClick={() => setAccountKind(false)}>‹</IconButton>}<Dialog.Title>{accountKind ? "网站账号" : "浏览器设置"}</Dialog.Title>
            <Dialog.Description className={accountKind ? "account-sr-only" : ""}>{accountKind ? "检查登录状态，未登录时完成登录。" : "选择下次任务使用的浏览器。"}</Dialog.Description></div>
          <Dialog.Close><IconButton variant="ghost" color="gray" aria-label={accountKind ? "关闭网站账号" : "关闭浏览器设置"} disabled={pending}>
            <X size={19} /></IconButton></Dialog.Close>
        </div>
        {accountKind && <BrowserAccountView />}
        <div className="browser-environment-body" hidden={Boolean(accountKind)}>
          {environment.state && <BrowserEnvironmentSelect value={environment.state.mode}
            disabled={pending} onChange={mode => void environment.select(mode)} />}
          {!environment.state && <p role="status">{environment.busy ? "正在读取浏览器设置…" : "无法读取浏览器设置。"}</p>}
          {environment.error && <p className="browser-environment-error" role="alert">{environment.error}</p>}
          {environment.state && <div className="browser-settings-list"><div className="browser-mode-settings">
            <div className="browser-mode-option" hidden={environment.state.mode !== "daily"}>
              <DailyChromeAuthorization open={open && !accountKind && environment.state.mode === "daily"} />
            </div>
            {environment.state.mode !== "daily" && <DedicatedBrowserVisibility value={environment.state.mode}
              disabled={pending} onChange={mode => void environment.select(mode)} />}
          </div>
            <div className="browser-account-entry">
              <KeyRound size={21} aria-hidden="true" />
              <div><strong>网站账号</strong><p>检查登录，复用已有登录。</p></div>
              <Button variant="ghost" color="gray" disabled={pending} onClick={() => setAccountKind(true)}>管理账号<ChevronRight size={15} /></Button>
            </div>
          </div>}
        </div>
        <div className="browser-environment-footer" hidden={Boolean(accountKind)}>
          <span role="status" aria-live="polite">{environment.busy ? environment.state ? "正在保存选择…" : "正在读取设置…"
            : environment.error ? environment.state ? "更改未保存，仍使用原选择" : "设置未读取" : environment.state
              ? <><Check size={14} aria-hidden="true" />已自动保存</> : "设置未读取"}</span>
          <Dialog.Close><Button variant="soft" color="gray" disabled={pending}>{doneLabel}</Button></Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  </>
}

const authorizationSchema = z.object({ paired: z.boolean(), busy: z.boolean(),
  profileDirectory: z.string().nullable(), extensionDirectory: z.string(),
  profiles: z.array(z.object({ id: z.string(), name: z.string() })) })
type Authorization = z.infer<typeof authorizationSchema>
type AuthorizationAction = "authorize" | "revoke"

function DailyChromeAuthorization({ open }: { open: boolean }) {
  const [state, setState] = useState<Authorization | null>(null)
  const [profile, setProfile] = useState("")
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<AuthorizationAction | null>(null)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const operation = useRef(0)
  useEffect(() => {
    const feedback = (event: Event) => setFeedback(String((event as CustomEvent<string>).detail))
    window.addEventListener("bat-extension-feedback", feedback)
    return () => window.removeEventListener("bat-extension-feedback", feedback)
  }, [])
  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    setBusy(true)
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
        if (first && !abort.signal.aborted) { first = false; setBusy(false) }
      }
    }
    void load()
    const timer = setInterval(() => void load(), 2500)
    return () => { abort.abort(); clearInterval(timer); operation.current++ }
  }, [open])
  async function act(nextAction: AuthorizationAction) {
    const current = ++operation.current
    setBusy(true); setAction(nextAction); setError(""); setFeedback("")
    if (nextAction !== "revoke") setFeedback(canOpenDailyChromePopup()
      ? "请在 Chrome 右上角的 B-A-T 浮窗开启「允许连接」；浮窗关闭后可点击扩展图标继续。"
      : "请点击所选 Chrome 右上角的 B-A-T 扩展图标，开启「允许连接」。")
    try {
      await authorizationRequest(nextAction === "revoke" ? "DELETE" : "POST",
        nextAction === "authorize" ? { profileDirectory: profile } : undefined, undefined,
        nextAction === "revoke" ? "" : `/${nextAction}`)
      const next = authorizationSchema.parse(await authorizationRequest("GET"))
      if (current === operation.current) {
        setState(next); setLoadError("")
        setFeedback(nextAction === "revoke" ? "授权已撤销。" : "授权已保存，所有任务可复用。")
      }
    } catch (error) {
      if (current === operation.current) {
        // WHY：用户主动拒绝是正常结果，不应渲染为技术故障；真实连接错误仍显示错误反馈。
        const declined = error instanceof AuthorizationRequestError && error.code === "daily_chrome_authorization_rejected"
        setFeedback(declined ? state?.paired ? "已取消本次授权，原授权仍有效。" : "已取消授权，未保存授权。" : "")
        setError(declined ? "" : error instanceof Error ? error.message : "授权操作失败。")
      }
    } finally {
      // WHY：取消沿服务端原 revoke 队列；迟到的批准/失败不能覆盖更新后的界面事实。
      if (current === operation.current) { setBusy(false); setAction(null) }
    }
  }
  const pending = busy || Boolean(state?.busy)
  return <section className="browser-connection-panel" aria-label="日常 Chrome 授权" aria-busy={pending}>
    <div className="browser-authorization-row">
      <DailyAuthorizationSummary state={state} action={action} loadError={loadError} />
      {state && <DailyAuthorizationActions state={state} action={action} pending={pending}
        disabled={Boolean(loadError)} profile={profile} onAction={next => void act(next)} />}
    </div>
    {state && !state.paired && <DailyChromeInstallation state={state} profile={profile}
      disabled={pending || Boolean(loadError)} onProfile={setProfile} onFeedback={setFeedback} onError={setError} />}
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
  return <div className="browser-authorization-summary" role="status" aria-live="polite">
    <Chrome size={21} aria-hidden="true" />
    <div><div className="browser-connection-heading"><strong>Chrome 授权</strong>
      <Badge size="1" color={loadError || !state || pending || !state.paired ? "gray" : "green"}>{label}</Badge></div>
    <p className={state?.paired && !pending && !loadError ? "browser-authorized-profile" : undefined} title={state?.paired ? profile ?? undefined : undefined}>{loadError ? "暂时无法读取状态，请检查本地服务。" : !state ? "正在读取授权状态…" : action === "revoke" ? "正在撤销授权并断开控制。"
      : authorizing ? "请在 Chrome 扩展浮窗开启「允许连接」。"
      : state.paired ? profile ?? "您的 Chrome" : "通过扩展授权此 Chrome"}</p></div>
    {loadError && <p className="browser-environment-error" role="alert">{loadError}</p>}
  </div>
}

function DailyAuthorizationActions({ state, action, pending, disabled, profile, onAction }: {
  state: Authorization; action: AuthorizationAction | null; pending: boolean; disabled: boolean; profile: string
  onAction(action: AuthorizationAction): void
}) {
  // WHY：此处只管理全局授权；传输连接状态不能让授权操作出现/消失。
  const cancellable = pending && (action === "authorize" || state.busy && !state.paired) && action !== "revoke"
  return <Flex className="browser-connection-actions" gap="2" align="center">
    {cancellable ? <Button variant="ghost" color="gray" onClick={() => onAction("revoke")}>
      取消授权</Button> : state.paired ? <Button variant="ghost" color="gray" disabled={pending || disabled}
      onClick={() => onAction("revoke")}>{action === "revoke" ? "正在撤销…" : "撤销授权"}</Button> : <span />}
    {!state.paired && <Button disabled={pending || disabled || !profile} onClick={() => onAction("authorize")}>
      {action === "revoke" ? "正在取消…" : pending ? "等待 Chrome 批准…" : "授权 Chrome"}</Button>}
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
      <p>将 B-A-T 固定到工具栏，在同一个 Chrome 打开工作台。点击“授权 Chrome”后，在右上角扩展浮窗开启“允许连接”。</p>
      <code className="browser-extension-directory">{state.extensionDirectory}</code>
      <Button size="1" variant="soft" color="gray" disabled={disabled} onClick={() => { void navigator.clipboard.writeText(state.extensionDirectory)
        .then(() => onFeedback("扩展目录已复制。"), () => onError("复制失败，请选择目录文字复制。")) }}>复制文件夹路径</Button>
    </details>
  </div>
}

class AuthorizationRequestError extends Error {
  constructor(readonly code: string | undefined, message: string) { super(message) }
}

async function authorizationRequest(method: string, body?: unknown, signal?: AbortSignal, suffix = ""): Promise<unknown> {
  const response = await fetch(`/api/browser/daily-chrome${suffix}`, {
    method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  })
  const value: unknown = await response.json()
  if (!response.ok) {
    const failure = z.object({ error: z.string(), code: z.string().optional() }).parse(value)
    throw new AuthorizationRequestError(failure.code, failure.error)
  }
  return value
}
