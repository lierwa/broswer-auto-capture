import { Button, Select } from "@radix-ui/themes"
import type { ChainNode } from "@browser-capture/contracts"
import { actionPresentation, bindingSourceLabel } from "./chainNodePresentation.js"
import { latestExecutionEvents } from "./chainWorkbenchProjection.js"
import { ResultValue, executionStatus } from "./ExecutionPresentation.js"
import { SavedResultDialog } from "./SavedResultDialog.js"
import { startFact, terminalFact } from "./chainTerminalFacts.js"
import type { LiveChainModel } from "./useLiveChain.js"

export function CallSelection({ model }: { model: LiveChainModel }) {
  if (!model.calls.length) return null
  return <div className="chain-call-selection"><small>当前步骤调用</small>
    <Select.Root value={model.selectedCall?.run.binding.runId ?? ""} onValueChange={model.setSelectedRunId}>
      <Select.Trigger /><Select.Content>{model.calls.map((call, index) => <Select.Item key={call.run.binding.runId}
        value={call.run.binding.runId}>第 {index + 1} 次 · {executionStatus(call.run.status)}</Select.Item>)}</Select.Content>
    </Select.Root></div>
}

export function ChainStartContext({ model, onRequirementView }: {
  model: LiveChainModel; onRequirementView(version: number): void
}) {
  const { chain, plan, detail, selectedCall, requirement } = model
  if (!chain || !plan) return null
  const reference = plan.requirement
  const entry = chain.nodes.find((node) => node.id === chain.entry)
  const step = plan.steps.find((step) => step.id === model.step?.stepId)
  const execution = detail?.execution ?? model.selectedExecution
  const state = startFact(execution, Boolean(selectedCall), Boolean(model.acceptedExecutionId))
  const missingCall = model.selectedRunId !== null && !selectedCall
  return <aside className="chain-inspector workspace-context" aria-label="链路开始说明">
    <BoundaryHeader title={requirement?.goal ?? chain.name} onClose={model.closeContext} />
    <small>需求 v{reference.version} · {model.draft ? `草稿修订 ${model.draft.revision}`
      : model.release ? `发布 V${model.release.reference.version}` : "候选链路"}</small>
    {!requirement && <p>对应需求正文未能精确读取，保留原版本引用。</p>}
    <Button size="1" variant="soft" onClick={() => onRequirementView(reference.version)}>查看对应需求</Button>
    <section><h4>这一步要完成什么</h4><p>{step?.goal ?? chain.name}</p>
      <p>从“{entry ? actionPresentation(entry).title : "入口未记录"}”开始。</p></section>
    <CallSelection model={model} />
    <section><h4>使用什么输入</h4>{selectedCall ? selectedCall.run.input === null
      ? <p>本次调用没有传入额外参数。</p> : <ResultValue value={selectedCall.run.input} />
      : <><p>{missingCall ? "所选调用记录未能读取，无法确认实际输入。" : state === "not_entered" ? "本次没有进入所选步骤，尚无实际输入记录。"
        : state === "waiting" ? "运行已受理，所选步骤尚未开始。" : "尚未运行。"}</p>
        <p>计划来源：{step ? bindingSourceLabel(step.input, []) : "未记录"}</p></>}</section>
    {!missingCall && state === "not_entered" && execution && <section role="alert"><h4>本次运行停在哪里</h4>
      <p>{executionStatus(detail?.execution.cleanupResume?.status ?? execution.status)}；所选步骤没有调用记录。</p></section>}
    {!selectedCall && model.view.error && <p role="alert">{model.view.error}</p>}
    {requirement?.confirmationFacts?.sources.length ? <section><h4>已确认的来源</h4>
      {requirement.confirmationFacts.sources.map(source => <p key={source.resolutionId}>{source.label} · {source.domain}</p>)}</section> : null}
    {chain.reuseBoundary.assumptions.length > 0 && <details><summary>运行前提</summary>
      <p>以下是链路声明的前提；未记录逐项检查结果。</p>
      <ul>{chain.reuseBoundary.assumptions.map((value, index) => <li key={index}>{value}</li>)}</ul></details>}
    <details><summary>高级信息</summary><pre>{JSON.stringify({ requirement: reference, entry: chain.entry,
      authorizationScope: plan.authorizationScope, inputContract: chain.inputContract,
      input: selectedCall?.run.input, invocation: selectedCall?.run.binding, failure: execution?.result?.failure }, null, 2)}</pre></details>
  </aside>
}

export function ChainTerminalContext({ model, node }: { model: LiveChainModel; node: Extract<ChainNode, {kind: "terminal"}> }) {
  const event = latestExecutionEvents(model.chainEvents).get(node.id)?.event
  const call = model.selectedCall
  const fact = terminalFact(node, event, call?.run)
  const reached = fact === "reached", failedReturn = fact === "return_failed"
  const result = "result" in node ? node.result : undefined
  return <aside className="chain-inspector workspace-context" aria-label="链路结束说明">
    <BoundaryHeader title={actionPresentation(node).title} onClose={model.closeContext} />
    <p>{reached ? `本次已到达：${executionStatus(node.status)}` : failedReturn ? "返回处理失败，未完成此终点。"
      : event ? "终点事实待确认。" : "本次尚未到达此终点。"}</p>
    {node.reason !== node.status && <p>{node.reason}</p>}
    <CallSelection model={model} />
    {reached && call && <SavedResultDialog model={model} scope="call" />}
    {call && <p>所选步骤调用：{executionStatus(call.run.status)}</p>}
    {model.selectedExecution && <Button size="1" variant="soft" onClick={() => model.openContext("execution")}>本次运行与重新说明需求</Button>}
    <details><summary>输出定义与高级信息</summary><pre>{JSON.stringify({ result, browserHandoff: model.plan?.browserHandoff,
      outputContract: node.outputContract, terminalId: node.id, event }, null, 2)}</pre></details>
  </aside>
}

function BoundaryHeader({ title, onClose }: { title: string; onClose(): void }) {
  return <header><span>链路说明</span><button aria-label="关闭上下文区" onClick={onClose}>×</button><h3>{title}</h3></header>
}
