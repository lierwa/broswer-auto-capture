import { useEffect, useState } from "react"
import { Button, Callout, Flex } from "@radix-ui/themes"
import { browserStatusSchema, type BrowserStatus as Status } from "@browser-capture/contracts/browser"

const labels = { running: "浏览器正在为计划核验来源", succeeded: "上次浏览器操作已完成", failed: "浏览器操作失败，可重新制定计划后再试", cancelled: "浏览器操作已停止",
  manual_required: "页面要求人工处理。请在浏览器中完成登录或访问验证，再重新制定计划。", cleanup_required: "浏览器会话待清理", interrupted: "上次操作被中断，尚未提交完成结果" }
export function BrowserStatus({ taskId, active }: { taskId: string; active: boolean }) {
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
    <div role="status"><Callout.Text>{error || (record ? labels[record.status] : state ? "浏览器尚未启动；计划需要来源证据时会按任务范围启用。" : "正在读取浏览器状态…")}</Callout.Text>
      {state?.cleanupRequired && <p>存在尚未回收的会话，请在所属任务中清理后继续。若清理失败，请检查 BrowserSkill 连接后重试。</p>}
      <Flex gap="2" mt="2">
        {error && <Button size="1" variant="soft" onClick={() => setRevision((value) => value + 1)}>重新连接</Button>}
        {record?.status === "running" && <Button size="1" variant="soft" disabled={pending} onClick={() => void control("cancel")}>停止浏览器操作</Button>}
        {state?.cleanupRunId && record && <Button size="1" variant="soft" disabled={pending} onClick={() => void control("cleanup")}>清理所属会话</Button>}
      </Flex>
    </div>
  </Callout.Root>
}
