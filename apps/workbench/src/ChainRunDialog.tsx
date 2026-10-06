import { useEffect, useRef, useState } from "react"
import { Button, Callout, Dialog, Flex } from "@radix-ui/themes"
import { executionBrowser } from "@browser-capture/contracts/browser-profile"
import { browserModeLabels } from "./BrowserEnvironmentSelect.js"
import { useTaskBrowserEnvironment } from "./useTaskBrowserEnvironment.js"
import { TaskBrowserSelect } from "./TaskBrowserSelect.js"
import { parseTaskValue, type JsonValue, type TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { ReplayPacingControl } from "./ReplayPacingControl.js"
import { readReplayPacing, saveReplayPacing } from "./replayPacingPreference.js"
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
  const [pacing, setPacing] = useState(readReplayPacing)
  const environment = useTaskBrowserEnvironment(open, workspace.taskId)
  const browserMode = environment.state?.mode
  const needsVisibleWindow = mode === "run" && plan?.browserHandoff === "keep_open" && browserMode === "dedicated-headless"
  const [inputError, setInputError] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const requestId = useRef<string>(crypto.randomUUID())
  const sourceKey = source ? `${source.id}:${"revision" in source ? source.revision : source.version}` : ""
  const parameterized = plan ? requiresInput(plan.inputContract.schema) : false
  const independent = mode === "trial" && workspace.draftReadiness?.phase === "verification_needed"
  const uncertain = connection.snapshot().pendingUncertain && Boolean(connection.snapshot().pending)
  const frozen = connection.snapshot().pending
  const locked = connection.snapshot().busy || uncertain

  useEffect(() => {
    if (!open || !plan) return
    if (uncertain) return
    const command = connection.snapshot().pending
    const pendingRun = command?.type === "run_task" || command?.type === "trial_task_draft" ? command : null
    requestId.current = pendingRun?.requestId ?? crypto.randomUUID()
    setInput(pendingRun ? pendingRun.input : initialValue(plan.inputContract.schema))
    setPacing(pendingRun?.type === "run_task" ? pendingRun.pacing?.nodeDelayMs ?? 0 : readReplayPacing())
    setInputError("")
  }, [open, sourceKey, plan?.inputContract.id, plan?.inputContract.version, uncertain])
  function changed() { requestId.current = crypto.randomUUID(); connection.dismiss(); setInputError("") }
  function close() { if (connection.snapshot().busy) return; if (!uncertain) connection.dismiss(); onOpenChange(false) }

  async function submit() {
    try {
      if (connection.snapshot().pending && (uncertain || connection.snapshot().error)) {
        if (await connection.retry()) onOpenChange(false)
        return
      }
      if (!plan || input === undefined || !browserMode || environment.busy || environment.error || needsVisibleWindow) return
      const parsed = parseTaskValue(plan.inputContract, input)
      setInputError("")
      const accepted = mode === "trial" && workspace.draft
        ? await connection.dispatch({ type: "trial_task_draft", requestId: requestId.current,
          draftId: workspace.draft.id, expectedRevision: workspace.draft.revision,
          expectedChecksum: workspace.draft.checksum, input: parsed, browser: executionBrowser(browserMode) })
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

  // WHY：任务偏好独立保存；派发时冻结实际模式，恢复或核验原请求仍使用原 command。
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close() }}>
    <Dialog.Content className="task-run-dialog run-confirmation" maxWidth="460px">
    <Dialog.Title>{independent ? "独立复跑检查" : mode === "trial" ? "试跑草稿" : "再次运行"}</Dialog.Title>
    <Dialog.Description size="2">{independent
      ? workspace.draftReadiness?.distinctInputRequired ? "请使用另一组不同的业务输入。" : "再次运行以完成独立复验。"
      : uncertain && frozen?.type === "run_task" ? `已发布 V${frozen.release.version}`
        : mode === "trial" ? "当前草稿" : `已发布 V${workspace.release?.value.version ?? 1}`}</Dialog.Description>
    {connection.snapshot().error && <Callout.Root color="red" size="1" role="alert"><Callout.Text>{connection.snapshot().error}</Callout.Text></Callout.Root>}
    {uncertain ? <><p>本次输入已保留。</p>
      {frozen?.type === "run_task" && <div className="run-browser-row"><span>浏览器</span>
        <strong>{browserModeLabels[frozen.browser?.mode ?? "daily"]}</strong></div>}
      <Flex className="dialog-actions" gap="2"><Button variant="soft" color="gray" onClick={close}>关闭</Button>
        <Button disabled={connection.snapshot().busy} onClick={() => void submit()}>核验原请求</Button></Flex></>
      : !plan ? <p role="status">当前没有可执行内容。</p> : input !== undefined && <form ref={formRef}
      onSubmit={(event) => { event.preventDefault(); void submit() }}>
      {parameterized && <ValueSchemaForm contract={plan.inputContract} value={input}
        onChange={(value) => { setInput(value); changed() }} disabled={locked} />}
      {inputError && <p className="error-text" role="alert">{inputError}</p>}
      {environment.error && <p className="error-text" role="alert">{environment.error}</p>}
      <TaskBrowserSelect environment={environment} disabled={locked} onChange={changed} />
      {needsVisibleWindow && <p className="error-text" role="alert">本任务需要保留页面，请选择显示窗口的浏览器。</p>}
      {mode === "run" && <ReplayPacingControl compact value={pacing} disabled={locked}
        onValueChange={value => { setPacing(value); saveReplayPacing(value); changed() }} />}
      <Flex className="dialog-actions" gap="2"><Button type="button" variant="soft" color="gray"
        disabled={connection.snapshot().busy}
        onClick={close}>取消</Button><Button type="submit" disabled={connection.snapshot().busy
          || environment.busy || !environment.state || Boolean(environment.error) || needsVisibleWindow}>
        {connection.snapshot().busy ? "正在提交…" : connection.snapshot().pending && connection.snapshot().error ? "重试" : independent ? "开始独立复跑" : mode === "trial" ? "开始试跑" : "开始运行"}</Button></Flex>
    </form>}
  </Dialog.Content></Dialog.Root>
}

function requiresInput(schema: { type: string; properties?: Record<string, unknown> }) {
  return schema.type !== "null" && !(schema.type === "object" && Object.keys(schema.properties ?? {}).length === 0)
}
