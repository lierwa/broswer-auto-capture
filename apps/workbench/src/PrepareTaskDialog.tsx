import { Button, Dialog } from "@radix-ui/themes"
import { executionBrowser } from "@browser-capture/contracts/browser-profile"
import type { TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import type { TaskChainConnection } from "./taskChainConnection.js"
import { useTaskBrowserEnvironment } from "./useTaskBrowserEnvironment.js"
import { TaskBrowserSelect } from "./TaskBrowserSelect.js"

export function PrepareTaskDialog({ open, onOpenChange, workspace, connection }: {
  open: boolean; onOpenChange(open: boolean): void; workspace: TaskWorkspaceSnapshot; connection: TaskChainConnection
}) {
  const environment = useTaskBrowserEnvironment(open, workspace.taskId)
  const busy = connection.snapshot().busy
  const uncertain = connection.snapshot().pendingUncertain
  async function prepare() {
    if (connection.snapshot().pending?.type === "prepare_task" && (uncertain || connection.snapshot().error)) {
      if (await connection.retry()) onOpenChange(false)
      return
    }
    if (!environment.state || environment.busy || environment.error || !workspace.requirement) return
    const accepted = await connection.dispatch({ type: "prepare_task", requestId: crypto.randomUUID(),
      requirementVersion: workspace.requirement.version, browser: executionBrowser(environment.state.mode) })
    if (accepted) onOpenChange(false)
  }
  return <Dialog.Root open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}><Dialog.Content maxWidth="460px">
    <Dialog.Title>生成链路草案</Dialog.Title><Dialog.Description>确认本任务使用的浏览器，再开始试做和生成草案。</Dialog.Description>
    <TaskBrowserSelect environment={environment} disabled={busy || uncertain} onChange={() => connection.dismiss()} />
    {(environment.error || connection.snapshot().error) && <p className="error-text" role="alert">{environment.error || connection.snapshot().error}</p>}
    <div className="dialog-actions"><Button variant="soft" color="gray" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
      <Button disabled={busy || environment.busy || !environment.state || Boolean(environment.error)}
        onClick={() => void prepare()}>{busy ? "正在提交…" : uncertain ? "核验原请求" : "开始生成"}</Button></div>
  </Dialog.Content></Dialog.Root>
}
