import { useEffect, useRef, useState } from "react"
import { Button, Callout, Checkbox, Dialog, Flex } from "@radix-ui/themes"
import { parseTaskValue, type JsonValue, type TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { ReplayPacingControl } from "./ReplayPacingControl.js"
import { initialValue, ValueSchemaForm } from "./ValueSchemaForm.js"
import type { TaskChainConnection } from "./taskChainConnection.js"

export function ChainRunDialog({ open, onOpenChange, workspace, connection, mode }: {
  open: boolean
  onOpenChange(open: boolean): void
  workspace: TaskWorkspaceSnapshot
  connection: TaskChainConnection
  mode: "trial" | "run"
}) {
  const source = mode === "trial" ? workspace.draft : workspace.release?.value
  const plan = source?.content.plan
  const [input, setInput] = useState<JsonValue | undefined>(undefined)
  const [pacing, setPacing] = useState(0)
  const [headless, setHeadless] = useState(false)
  const [inputError, setInputError] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const requestId = useRef(crypto.randomUUID())
  const sourceKey = source ? `${source.id}:${"revision" in source ? source.revision : source.version}` : ""
  const parameterized = plan ? requiresInput(plan.inputContract.schema) : false
  const independent = mode === "trial" && workspace.draftReadiness?.phase === "verification_needed"

  useEffect(() => {
    if (!open || !plan) return
    requestId.current = crypto.randomUUID()
    setInput(initialValue(plan.inputContract.schema))
    setPacing(0)
    setHeadless(false)
    setInputError("")
  }, [open, sourceKey, plan?.inputContract.id, plan?.inputContract.version])

  async function submit() {
    if (!plan || input === undefined) return
    try {
      const parsed = parseTaskValue(plan.inputContract, input)
      setInputError("")
      const accepted = mode === "trial" && workspace.draft
        ? await connection.dispatch({ type: "trial_task_draft", requestId: requestId.current,
          draftId: workspace.draft.id, expectedRevision: workspace.draft.revision,
          expectedChecksum: workspace.draft.checksum, input: parsed })
        : mode === "run" && workspace.release
          ? await connection.dispatch({ type: "run_task", requestId: requestId.current,
            release: workspace.release.reference, input: parsed, pacing: { nodeDelayMs: pacing },
            browser: { headless } })
          : false
      if (accepted) onOpenChange(false)
    } catch {
      setInputError("请按字段要求完成本次业务输入后再继续。")
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("input, button[role='combobox']")?.focus())
    }
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Content className="task-run-dialog dialog-scroll" maxWidth="620px">
    <Dialog.Title>{independent ? "独立复跑检查" : mode === "trial" ? "试跑当前草稿" : "运行已发布任务"}</Dialog.Title>
    <Dialog.Description size="2">{mode === "trial"
      ? independent ? `这次将独立检查同一草稿${workspace.draftReadiness?.distinctInputRequired ? "；请使用另一组不同的业务输入" : ""}。后续修改不会改写本次执行。`
        : "本次 execution 固定绑定当前草稿；后续修改不会改写它。"
      : "本次 execution 固定绑定当前发布内容；画布只显示这一轮的事件。"}</Dialog.Description>
    {connection.snapshot().error && <Callout.Root color="red"><Callout.Text>{connection.snapshot().error}</Callout.Text>
      <Button type="button" onClick={() => void connection.retry()}>重试同一请求</Button></Callout.Root>}
    {!plan ? <p role="status">当前没有可执行内容。</p> : input !== undefined && <form ref={formRef}
      onSubmit={(event) => { event.preventDefault(); void submit() }}>
      {parameterized && <ValueSchemaForm contract={plan.inputContract} value={input}
        onChange={(value) => { setInput(value); setInputError("") }} disabled={connection.snapshot().busy} />}
      {!parameterized && <p className="run-dialog-fixed-input">此任务没有运行参数，将直接使用画布中保存的动作配置。</p>}
      {inputError && <p className="error-text" role="alert">{inputError}</p>}
      {mode === "run" && <details className="run-settings"><summary>运行设置</summary>
        <label className="run-browser-setting"><Checkbox checked={headless} disabled={connection.snapshot().busy}
          onCheckedChange={(checked) => setHeadless(checked === true)} />
          <span><strong>无界面运行（Headless）</strong><small>关闭时打开可见的浏览器窗口；仅影响本次运行。</small></span>
        </label>
        <ReplayPacingControl value={pacing} disabled={connection.snapshot().busy} onValueChange={setPacing} /></details>}
      <Flex className="dialog-actions" gap="2"><Button type="button" variant="soft" color="gray"
        onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={connection.snapshot().busy}>
        {connection.snapshot().busy ? "正在提交…" : independent ? "开始独立复跑" : mode === "trial" ? "开始试跑" : "开始运行"}</Button></Flex>
    </form>}
  </Dialog.Content></Dialog.Root>
}

function requiresInput(schema: { type: string; properties?: Record<string, unknown> }) {
  return schema.type !== "null" && !(schema.type === "object" && Object.keys(schema.properties ?? {}).length === 0)
}
