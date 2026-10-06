import { useEffect, useState } from "react"
import { Avatar, Button, DropdownMenu, IconButton, Spinner, TextField } from "@radix-ui/themes"
import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, Globe, LogIn, MoreHorizontal, Plus, RefreshCw, Search } from "lucide-react"
import type { AccountDirectory } from "@browser-capture/contracts/account-directory"
import { accountReason, statusLabels, type AccountItem } from "./accountClient.js"
import { useAccountDirectory } from "./useAccountDirectory.js"
import { AccountCustomView } from "./AccountCustomView.js"

export function useAccountViewport() {
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight })
  useEffect(() => { const change = () => setSize({ width: innerWidth, height: innerHeight })
    addEventListener("resize", change); return () => removeEventListener("resize", change) }, [])
  return { narrow: size.width < 640, short: size.height < 600 }
}
export function BrowserAccountView() {
  const { state, error, busy, act } = useAccountDirectory()
  const [selected, setSelected] = useState(""), [detail, setDetail] = useState(false), [remove, setRemove] = useState(false)
  const { narrow, short } = useAccountViewport()
  const item = state?.items.find(v => v.platform.id === selected) ?? state?.items[0]
  const custom = selected === "custom", operation = state?.operation
  useEffect(() => {
    if (custom && operation?.status === "completed" && ["custom_confirm", "custom_add"].includes(operation.intent)
      && state?.items.some(v => v.platform.id === operation.platformId && v.account)) {
      setSelected(operation.platformId); setDetail(true)
    }
  }, [custom, operation?.id, operation?.status, state?.items])
  const localOperation = operation?.platformId === item?.platform.id || custom && operation?.intent.startsWith("custom_")
  const working = busy || operation?.status === "running"
  const command = (type: string) => {
    if (type === "cancel" && operation) { void act({ type, requestId: operation.requestId }); return }
    if (!item) return
    setRemove(false)
    void act({ type, requestId: crypto.randomUUID(), platformId: item.platform.id, revision: item.revision })
  }
  const choose = (id: string) => { setSelected(id); setDetail(true); setRemove(false) }
  const failure = error || (localOperation && operation?.status === "failed" ? accountReason(operation.reason) : "") || accountReason(item?.account?.reason)
  if (!state) return <div className="account-load" role="status">{error || <><Spinner />正在读取账号</>}{error && <Button onClick={() => void act()}>重试</Button>}</div>
  return <div className={`account-layout ${detail ? "show-detail" : ""}`} aria-busy={working}>
    {(!narrow || !detail) && <PlatformGrid items={state.items} selected={custom ? "custom" : item?.platform.id ?? ""} choose={choose} short={short} />}
    {(!narrow || detail) && (custom ? <AccountCustomView state={state} busy={Boolean(working)} act={act} error={error} back={() => setDetail(false)} narrow={narrow} /> : item &&
      <AccountDetail item={item} state={state} working={Boolean(working)} remove={remove} failure={failure ?? ""}
        narrow={narrow} back={() => setDetail(false)} setRemove={setRemove} command={command} />)}
  </div>
}
function PlatformGrid({ items, selected, choose, short }: { items: AccountItem[]; selected: string; choose(id: string): void; short: boolean }) {
  const [query, setQuery] = useState(""), [page, setPage] = useState(0)
  const filtered = items.filter(v => `${v.platform.name} ${v.account?.displayIdentity ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  const count = short ? 6 : 13, pages = Math.max(1, Math.ceil(filtered.length / count)), current = Math.min(page, pages - 1)
  return <aside className="platform-pane"><TextField.Root aria-label="搜索平台" placeholder="搜索平台" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }}>
    <TextField.Slot><Search size={15} /></TextField.Slot></TextField.Root>
    <div className="platform-grid" aria-label="支持的平台">{filtered.slice(current * count, (current + 1) * count).map(item => {
      const status = item.account?.state ?? "empty"
      return <Button key={item.platform.id} variant="ghost" color="gray" className={`platform-option ${selected === item.platform.id ? "selected" : ""}`}
        aria-pressed={selected === item.platform.id} aria-label={`${item.platform.name}，${statusLabels[status]}`} onClick={() => choose(item.platform.id)}>
        <span className="platform-mark">{item.platform.name.slice(0, 1)}</span><span>{item.platform.name}</span><span className={`state-dot ${status}`} title={statusLabels[status]} /></Button>
    })}{!filtered.length && <p className="search-empty">没有匹配的平台</p>}</div>
    <div className="platform-footer"><Button size="1" variant="ghost" color="gray" className={selected === "custom" ? "selected" : ""} aria-pressed={selected === "custom"} onClick={() => choose("custom")}><Plus size={14} />其他网站</Button>
      {pages > 1 && <div className="pagination"><IconButton size="1" variant="ghost" color="gray" aria-label="上一页平台" disabled={!current} onClick={() => setPage(current - 1)}><ChevronLeft size={15} /></IconButton>
        <span>{current + 1}/{pages}</span><IconButton size="1" variant="ghost" color="gray" aria-label="下一页平台" disabled={current === pages - 1} onClick={() => setPage(current + 1)}><ChevronRight size={15} /></IconButton></div>}</div>
  </aside>
}
function AccountDetail({ item, state, working, remove, failure, narrow, back, setRemove, command }: {
  item: AccountItem; state: AccountDirectory; working: boolean; remove: boolean; failure: string; narrow: boolean;
  back(): void; setRemove(value: boolean): void; command(type: string): void
}) {
  const account = item.account, status = account?.state ?? "empty", op = state.operation
  const waiting = op?.platformId === item.platform.id && op.status === "running" && ["add", "relogin", "switch"].includes(op.intent)
  const loginOpened = item.custom && op?.platformId === item.platform.id && op.intent === "open" && op.status === "completed"
  const needsLogin = status === "expired" && !loginOpened
  const primary = status === "empty" ? item.custom ? "custom_add" : "add"
    : needsLogin ? item.custom ? "open" : "relogin" : item.custom ? "custom_check" : "check"
  return <section className="account-pane" aria-label={`${item.platform.name}账号`}><div className="detail-heading">
    {narrow && <IconButton size="1" variant="ghost" color="gray" aria-label="返回平台选择" onClick={back}><ArrowLeft size={18} /></IconButton>}
    <span className="platform-mark">{item.platform.name.slice(0, 1)}</span><h2>{item.platform.name}</h2></div>
    <div className="account-body">{remove ? <div className="inline-flow"><CircleAlert size={32} /><h3>移除这个账号？</h3><p>仅从本系统移除，网站保持登录。</p>
      <div className="action-row"><Button color="red" disabled={working} onClick={() => command("remove")}>移除账号</Button><Button color="gray" variant="soft" onClick={() => setRemove(false)}>取消</Button></div></div>
      : waiting ? <div className="inline-flow"><span className="login-symbol"><LogIn size={28} /></span><h3>{op.phase === "waiting" ? "请在网站完成登录" : "正在查找网站账号"}</h3>
        <p>登录成功后，账号会自动保存。</p><span className="waiting-status" role="status"><Spinner />{op.phase === "waiting" ? "等待网站登录" : "正在检查"}</span><Button size="1" variant="ghost" color="gray" onClick={() => command("cancel")}>取消</Button></div>
      : <><div className="identity-block">{account ? <Avatar size="6" radius="full" fallback={account.displayIdentity?.slice(0, 1) ?? <Globe size={28} />} color="amber" className="account-avatar" /> : <span className="empty-avatar"><Globe size={28} strokeWidth={1.3} /></span>}
        <h3 title={account?.displayIdentity ?? undefined}>{account ? account.displayIdentity ?? (status === "ready" ? "已登录，未取得账号名" : "未取得账号名") : "检查此网站的登录状态"}</h3>
        {account && <span className={`account-status ${status}`}><span className={`state-dot ${status}`} />{statusLabels[status]}</span>}
        {account?.checkedAt && <span className="account-checked-at">上次检查 {new Date(account.checkedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>}</div>
        <div className="action-row"><Button size="3" className="primary-action" disabled={working} onClick={() => command(primary)}>
          {working && op?.platformId === item.platform.id ? <><Spinner />正在处理</> : status === "empty" && !item.custom ? <><LogIn size={16} />检查并登录</> : needsLogin ? <><LogIn size={16} />去登录</> : <><RefreshCw size={16} />检查登录</>}</Button>
          {item.custom && !["ready", "expired"].includes(status) && <Button variant="soft" color="gray" disabled={working} onClick={() => command("open")}>去登录</Button>}
          {account && <>
            <DropdownMenu.Root><DropdownMenu.Trigger><IconButton size="2" variant="soft" color="gray" aria-label="更多账号操作" disabled={working}><MoreHorizontal size={18} /></IconButton></DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                {!item.custom && <DropdownMenu.Item onSelect={() => command("switch")}>切换账号</DropdownMenu.Item>}<DropdownMenu.Separator /><DropdownMenu.Item color="red" onSelect={() => setRemove(true)}>移除账号</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Root></>}
        </div>{failure && <div className="feedback-slot" aria-live="polite"><span className="feedback error"><CircleAlert size={14} /><span title={failure}>{failure}</span></span></div>}
        {state.notice && op?.platformId === item.platform.id && <div className="feedback-slot" role="status"><span className="feedback"><CircleAlert size={14} /><span>{state.notice}</span></span></div>}</>}
    </div></section>
}
