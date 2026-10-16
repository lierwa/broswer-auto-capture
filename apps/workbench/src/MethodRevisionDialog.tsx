import { useEffect, useState } from "react"
import { Button, Dialog, Select, TextArea } from "@radix-ui/themes"
import { parseTaskValue, type JsonValue } from "@browser-capture/contracts"
import { ValueSchemaForm, initialValue } from "./ValueSchemaForm.js"
import type { TaskChainConnection } from "./taskChainConnection.js"
import type { LiveChainModel } from "./useLiveChain.js"

export function MethodRevisionDialog({ open, onOpenChange, model, connection }: {
  open: boolean; onOpenChange(open: boolean): void; model: LiveChainModel; connection: TaskChainConnection
}) {
  const [stepId, setStepId] = useState("")
  const [problem, setProblem] = useState("")
  const [input, setInput] = useState<JsonValue | undefined>(undefined)
  const [error, setError] = useState("")
  const plan = model.source?.plan
  const options = model.view.diagnostics?.methodRevision
  const selected = options?.steps.find(step => step.stepId === stepId)
  const busy = model.view.busy || model.activityRunning || model.executionRunning
  useEffect(() => {
    if (!open) return
    setStepId(model.scopeStepId ?? ""); setProblem(""); setError("")
    setInput(plan ? initialValue(plan.inputContract.schema) : undefined)
    void connection.reloadDiagnostics()
  }, [open, connection])
  async function submit() {
    if (!plan || !options || !selected?.available || !selected.source || input === undefined || busy) return
    try {
      const value = parseTaskValue(plan.inputContract, input)
      setError("")
      const nodeIds = stepId === model.scopeStepId && model.selectedNode
        && selected.nodeIds.includes(model.selectedNode.id) ? [model.selectedNode.id] : selected.nodeIds
      const accepted = await connection.dispatch({ type: "revise_task_method", requestId: crypto.randomUUID(),
        requirementVersion: plan.requirement.version, base: options.base, stepId, nodeIds,
        source: selected.source, problem: problem.trim(), input: value })
      if (accepted) { onOpenChange(false); model.openContext("preparation") }
    } catch { setError("请按原业务输入合同完成输入。") }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Content maxWidth="640px">
    <Dialog.Title>局部修订方法</Dialog.Title>
    <Dialog.Description>说明当前方法的问题。将用新观察修订所选步骤及必要依赖，保留已确认需求、旧版本和运行记录。</Dialog.Description>
    {model.view.diagnosticsBusy && <p role="status">正在核验原版本和来源…</p>}
    {options && <label>修订步骤<Select.Root value={stepId} onValueChange={setStepId} disabled={busy}>
      <Select.Trigger placeholder="选择方法所属步骤" /><Select.Content>
        {options.steps.map(step => <Select.Item key={step.stepId} value={step.stepId}>{step.title}</Select.Item>)}
      </Select.Content></Select.Root></label>}
    {selected && <p>{stepId === model.scopeStepId && model.selectedNode
      ? `问题位置：${model.selectedNode.label}。` : `问题位置：${selected.title}。`}
      {selected.reason ?? "修订范围按当前方法的依赖确定；未受影响步骤保持。"}</p>}
    {!model.view.diagnosticsBusy && !options && <p>当前还没有可修订的已保存方法。</p>}
    <TextArea aria-label="方法问题" placeholder="说明方法哪里执行或读取不正确" value={problem}
      onChange={event => setProblem(event.target.value)} maxLength={2000} disabled={busy} />
    {plan && input !== undefined && plan.inputContract.schema.type !== "null"
      && <ValueSchemaForm contract={plan.inputContract} value={input} onChange={setInput} disabled={busy} />}
    {(error || model.view.error) && <p role="alert" className="error-text">{error || model.view.error}</p>}
    {options && <details><summary>修订依据</summary><pre>{JSON.stringify({ base: options.base,
      source: selected?.source, selectedNode: stepId === model.scopeStepId ? model.selectedNode?.id : undefined }, null, 2)}</pre></details>}
    <div className="dialog-actions"><Button variant="soft" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
      <Button disabled={busy || model.view.diagnosticsBusy || !selected?.available || !problem.trim() || input === undefined}
        aria-busy={busy} onClick={() => void submit()}>{busy ? "正在提交…" : "用新观察修订并验证"}</Button></div>
  </Dialog.Content></Dialog.Root>
}
