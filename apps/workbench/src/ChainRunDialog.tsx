import { useEffect, useRef, useState } from "react"
import { Button, Callout, Dialog, Flex } from "@radix-ui/themes"
import { executionBrowser, type BrowserMode } from "@browser-capture/contracts/browser-profile"
import { BrowserEnvironmentSelect } from "./BrowserEnvironmentSelect.js"
import { useBrowserEnvironment } from "./useBrowserEnvironment.js"
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
  const environment = useBrowserEnvironment(open)
  const [browserMode, setBrowserMode] = useState<BrowserMode>("daily")
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
    setInputError("")
  }, [open, sourceKey, plan?.inputContract.id, plan?.inputContract.version])
  useEffect(() => {
    if (environment.state) setBrowserMode(environment.state.mode)
  }, [environment.state])

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
            browser: executionBrowser(browserMode) })
          : false
      if (accepted) onOpenChange(false)
    } catch {
      setInputError("请按字段要求完成本次业务输入后再继续。")
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("input, button[role='combobox']")?.focus())
    }
  }

  return <Dialog.Root open={open} onOpenChange={(next) => {
    if (!next && connection.snapshot().busy) return
    onOpenChange(next)
  }}><Dialog.Content className="task-run-dialog dialog-scroll" maxWidth="620px">
    <Dialog.Title>{independent ? "独立复跑检查" : mode === "trial" ? "试跑当前草稿" : "运行已发布任务"}</Dialog.Title>
    <Dialog.Description size="2">{independent
      ? workspace.draftReadiness?.distinctInputRequired ? "请使用另一组不同的业务输入。" : "再次运行以完成独立复验。"
      : mode === "trial" ? "检查这条链路能否完成本次任务。" : "按当前发布版本运行。"}</Dialog.Description>
    {connection.snapshot().error && <Callout.Root color="red"><Callout.Text>{connection.snapshot().error}</Callout.Text>
      <Button type="button" onClick={() => void connection.retry()}>重试同一请求</Button></Callout.Root>}
    {!plan ? <p role="status">当前没有可执行内容。</p> : input !== undefined && <form ref={formRef}
      onSubmit={(event) => { event.preventDefault(); void submit() }}>
      {parameterized && <ValueSchemaForm contract={plan.inputContract} value={input}
        onChange={(value) => { setInput(value); setInputError("") }} disabled={connection.snapshot().busy} />}
      {inputError && <p className="error-text" role="alert">{inputError}</p>}
      {environment.error && <p className="error-text" role="alert">{environment.error}</p>}
      {mode === "run" && <details className="run-settings"><summary>运行设置</summary>
        <label className="run-browser-setting"><span>本次浏览器环境</span>
          <BrowserEnvironmentSelect value={browserMode} disabled={connection.snapshot().busy || environment.busy}
            visibleRequired={plan.browserHandoff === "keep_open"} onChange={mode => {
              setBrowserMode(mode); requestId.current = crypto.randomUUID()
            }} /></label>
        {plan.browserHandoff === "keep_open" && <p>当前发布版本需要交付原页面，请选择可见环境。</p>}
        <ReplayPacingControl value={pacing} disabled={connection.snapshot().busy} onValueChange={setPacing} /></details>}
      <Flex className="dialog-actions" gap="2"><Button type="button" variant="soft" color="gray"
        disabled={connection.snapshot().busy}
        onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={connection.snapshot().busy
          || environment.busy || !environment.state || mode === "run" && plan.browserHandoff === "keep_open" && browserMode === "dedicated-headless"}>
        {connection.snapshot().busy ? "正在提交…" : independent ? "开始独立复跑" : mode === "trial" ? "开始试跑" : "开始运行"}</Button></Flex>
    </form>}
  </Dialog.Content></Dialog.Root>
}

function requiresInput(schema: { type: string; properties?: Record<string, unknown> }) {
  return schema.type !== "null" && !(schema.type === "object" && Object.keys(schema.properties ?? {}).length === 0)
}
