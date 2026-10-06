import { Button, Callout, Flex, IconButton, Spinner, Select, Text } from "@radix-ui/themes"
import { useEffect, useState } from "react"
import { z } from "zod"
import { ArrowLeft, ArrowUpRight, Globe } from "lucide-react"
import type { AccountDirectory } from "@browser-capture/contracts/account-directory"

export function AccountCustomView({ state, busy, act, error, back, narrow }: { state: AccountDirectory; busy: boolean;
  act(body: unknown): Promise<void>; error: string; back(): void; narrow: boolean }) {
  const page = state.customPage, marker = state.marker, operation = state.operation
  const [choices, setChoices] = useState<{ id: string; version: number; name: string }[]>([]), [selected, setSelected] = useState("")
  const [choicesError, setChoicesError] = useState("")
  useEffect(() => {
    setChoices([]); setSelected(""); setChoicesError(""); if (!page) return
    const abort = new AbortController()
    void fetch(`/api/browser/account-directory/chains?url=${encodeURIComponent(page.url)}`, { signal: abort.signal }).then(async response => {
      if (!response.ok) throw Error("暂时无法读取已有检查方法")
      const values = z.array(z.object({ id: z.uuid(), version: z.number().int(), name: z.string() }).strict()).parse(await response.json())
      if (!abort.signal.aborted) { setChoices(values); setSelected(values[0] ? `${values[0].id}:${values[0].version}` : "") }
    }).catch(e => { if (!abort.signal.aborted) setChoicesError(e.message) })
    return () => abort.abort()
  }, [page?.bindingId, page?.revision])
  const pending = operation?.status === "running" && operation.intent.startsWith("custom_")
  const failure = error || choicesError || (operation?.intent.startsWith("custom_") && operation.status === "failed" ? operation.reason : "")
  const send = (type: string) => void act({ type, requestId: crypto.randomUUID(), ...(type === "custom_pick" && page ? { platformId: page.bindingId, revision: page.revision } : {}),
    ...(type === "custom_confirm" && marker ? { reference: marker.reference } : {}) })
  return <section className="account-pane"><div className="detail-heading">{narrow && <IconButton variant="ghost" color="gray" aria-label="返回平台选择" onClick={back}><ArrowLeft size={18} /></IconButton>}<Globe size={20} /><h2>其他网站</h2></div>
    <Flex className="account-custom-body" direction="column" gap="4">
      <Flex direction="column" gap="2"><Text as="div" size="4" weight="bold">{marker ? "确认登录标识" : page ? page.name : "添加网站账号"}</Text>
      <Text as="p" size="2" color="gray">{marker ? marker.preview : page ? "在网站中选择登录后才出现的账号名。" : state.customWindow ? "在新窗口打开网站并登录，再读取页面。" : "先打开网站窗口，登录后添加账号。"}</Text></Flex>
      <Flex gap="3" align="center" wrap="wrap">
      {pending ? <><span className="waiting-status" role="status"><Spinner />{operation.intent === "custom_pick" ? "请在网站点击登录标识" : "正在读取"}</span><Button size="1" variant="ghost" color="gray" onClick={() => void act({ type: "cancel", requestId: operation.requestId })}>取消</Button></>
        : marker ? <Button size="3" disabled={busy} onClick={() => send("custom_confirm")}>使用这个标识</Button>
          : page ? <Button size="3" disabled={busy} onClick={() => send("custom_pick")}>选择登录标识<ArrowUpRight size={16} /></Button>
            : <Button size="3" disabled={busy} onClick={() => send(state.customWindow ? "custom_read" : "custom_open")}>{state.customWindow ? "读取当前页面" : "打开网站窗口"}<ArrowUpRight size={16} /></Button>}
      {page?.hasChain && <Button variant="soft" color="gray" disabled={busy} onClick={() => void act({ type: state.items.find(v => v.platform.id === page.bindingId)?.account ? "custom_check" : "custom_add", requestId: crypto.randomUUID(), platformId: page.bindingId,
        revision: state.items.find(v => v.platform.id === page.bindingId)?.revision ?? 0 })}>检查并添加账号</Button>}
      </Flex>
      {page && choices.length > 0 && <div className="custom-method"><Select.Root value={selected} onValueChange={setSelected} disabled={busy}><Select.Trigger aria-label="已有检查方法" placeholder="选择已有方法" />
        <Select.Content>{choices.map(c => <Select.Item key={`${c.id}:${c.version}`} value={`${c.id}:${c.version}`}>{c.name}</Select.Item>)}</Select.Content></Select.Root>
        <Button size="1" variant="soft" disabled={busy || !selected} onClick={() => { const choice = choices.find(c => `${c.id}:${c.version}` === selected)
          if (choice) void act({ type: "custom_attach", requestId: crypto.randomUUID(), platformId: page.bindingId, revision: page.revision, chainId: choice.id, chainVersion: choice.version }) }}>使用此方法</Button></div>}
      {failure && <Callout.Root color="amber" size="1" role="alert"><Callout.Text>{failure}</Callout.Text></Callout.Root>}
    </Flex></section>
}
