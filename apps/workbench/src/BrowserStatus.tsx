import { useEffect, useState } from "react"
import { Button, Callout, Flex } from "@radix-ui/themes"
import { browserStatusSchema, type BrowserStatus as Status } from "@browser-capture/contracts/browser"

const labels = { running: "浏览器正在执行当前任务阶段", waiting_human: "浏览器自动化已暂停，请在 Agent Window 中完成人工处理。", succeeded: "上次浏览器操作已完成",
  failed: "浏览器操作未完成", cancelled: "浏览器操作已停止", manual_required: "人工处理窗口已结束；可从原来源继续并重新核验。",
  cleanup_required: "浏览器会话待清理", interrupted: "上次操作被中断，尚未提交完成结果" }
export function BrowserStatus({ taskId, active, readOnly = false, onResume }: {
  taskId: string; active: boolean; readOnly?: boolean; onResume?: (() => void) | undefined
}) {
  const [state, setState] = useState<Status | null>(null), [error, setError] = useState(""), [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const endpoint = `/api/browser?taskId=${encodeURIComponent(taskId)}`
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function reload() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal })
        if (!response.ok) throw new Error()
        const next = browserStatusSchema.parse(await response.json())
        if (next.taskId !== taskId) throw new Error()
        if (!controller.signal.aborted) { setState(next); setError("") }
      } catch { if (!controller.signal.aborted) setError("暂时无法读取浏览器状态，请重新连接。") }
      if (!controller.signal.aborted) timer = setTimeout(() => { void reload() }, 2000)
    }
    void reload()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [active, endpoint, taskId, revision])
  async function control(type: "cancel" | "cleanup") {
    if (!state?.record) return
    setPending(true)
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, runId: type === "cleanup" ? state.cleanupRunId : state.record.runId }) })
      if (!response.ok) throw new Error()
      const next = browserStatusSchema.parse(await response.json())
      if (next.taskId !== taskId) throw new Error()
      setState(next); setError("")
    } catch { setError("操作未完成，请刷新状态后重试。") }
    finally { setPending(false); setRevision((value) => value + 1) }
  }
  const record = state?.taskId === taskId ? state.record : null
  return <Callout.Root size="1" color={error || state?.cleanupRequired ? "amber" : "gray"} aria-label="浏览器状态">
    <div role="status"><Callout.Text>{error || (record ? labels[record.status] : state ? "浏览器尚未启动；链路探索、验证或运行时会按授权范围启用。" : "正在读取浏览器状态…")}</Callout.Text>
      {record?.waitpoint && <p>{record.waitpoint.status === "waiting" ? record.waitpoint.prompt
        : "本次人工处理窗口已经结束；恢复时系统会重新打开原来源并核验实际页面状态。"}<br />
        状态：{record.waitpoint.status} · 请求时间：{record.waitpoint.requestedAt}</p>}
      {state?.cleanupRequired && <p>存在尚未回收的会话，请在所属任务中清理后继续。若清理失败，请检查 BrowserSkill 连接后重试。</p>}
      <Flex gap="2" mt="2">
        {error && <Button size="1" variant="soft" onClick={() => setRevision((value) => value + 1)}>重新连接</Button>}
        {record && ["running", "waiting_human"].includes(record.status) && <Button size="1" variant="soft" disabled={pending} onClick={() => void control("cancel")}>停止浏览器操作</Button>}
        {record && onResume && (record.waitpoint && ["manual_required", "interrupted"].includes(record.status) || !record.waitpoint && record.status === "interrupted")
          && <Button size="1" disabled={pending || readOnly || Boolean(state?.cleanupRequired)} onClick={onResume}>继续原任务</Button>}
        {state?.cleanupRunId && record && <Button size="1" variant="soft" disabled={pending} onClick={() => void control("cleanup")}>清理所属会话</Button>}
      </Flex>
    </div>
  </Callout.Root>
}
