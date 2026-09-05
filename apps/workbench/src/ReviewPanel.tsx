import { useEffect, useRef, useState } from "react"
import { Badge, Button, Dialog, TextField } from "@radix-ui/themes"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import { Check, ChevronRight, CirclePause, Play, RotateCcw } from "lucide-react"
import { demoEdges, demoNodes, nodeDetails } from "./demoData.js"
import { isExecuting, type DemoAction, type DemoState } from "./demoState.js"

function NodePreview() {
  const [selectedId, setSelectedId] = useState("scope")
  const selected = nodeDetails[selectedId] ?? nodeDetails.scope!
  return <Dialog.Root><Dialog.Trigger><Button variant="ghost" color="gray">查看示例节点图<ChevronRight size={15} aria-hidden="true" /></Button></Dialog.Trigger>
    <Dialog.Content maxWidth="880px"><Dialog.Title>示例节点图</Dialog.Title>
      <Dialog.Description>预设的结构示意，尚未生成可执行链路。节点说明可用下方按钮查看。</Dialog.Description>
      <div className="flow-canvas"><ReactFlow nodes={demoNodes} edges={demoEdges} fitView
        nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => setSelectedId(node.id)}>
        <Background gap={22} size={1} /><Controls showInteractive={false} />
      </ReactFlow></div>
      <div className="node-buttons">{demoNodes.map((node) => <Button key={node.id} variant={selectedId === node.id ? "soft" : "ghost"}
        color="gray" onClick={() => setSelectedId(node.id)} aria-pressed={selectedId === node.id}>{nodeDetails[node.id]?.title}</Button>)}</div>
      <p className="node-inspector" aria-live="polite"><strong>{selected.title}</strong>　{selected.detail}</p>
      <div className="dialog-actions"><Dialog.Close><Button variant="soft">返回计划</Button></Dialog.Close></div>
    </Dialog.Content></Dialog.Root>
}

function RunStatus({ state, dispatch }: { state: DemoState; dispatch: (action: DemoAction) => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  // WHY：执行区按需出现，操作后的焦点与视口随结果移动，避免窄屏用户找不到反馈。
  useEffect(() => {
    heading.current?.scrollIntoView({ block: "nearest", behavior: "instant" })
    heading.current?.focus({ preventScroll: true })
  }, [state.stage])
  const label = { queued: "演示任务排队中", running: "演示运行中", paused: "演示已暂停", complete: "演示已完成" }
  if (state.stage === "draft" || state.stage === "confirmed") return null
  return <section className="run-status" aria-labelledby="run-title">
    <h3 id="run-title" ref={heading} tabIndex={-1} aria-live="polite">{label[state.stage]}</h3>
    <p>{state.stage === "complete" ? "已展示 2 条样例记录，不代表真实采集覆盖率。" : "模拟单任务执行；尚未启动浏览器或记录真实进度。"}</p>
    <div className="button-row">
      {state.stage === "running" && <><Button variant="soft" color="gray" onClick={() => dispatch({ type: "pause_demo" })}><CirclePause size={16} aria-hidden="true" />暂停演示</Button>
        <Button onClick={() => dispatch({ type: "complete_demo" })}>结束演示并看结果</Button></>}
      {state.stage === "paused" && <Button onClick={() => dispatch({ type: "resume_demo" })}><RotateCcw size={16} aria-hidden="true" />恢复演示</Button>}
    </div>
    {state.stage === "complete" && <div className="table-wrap" role="region" aria-label="样例结果表，可横向滚动" tabIndex={0}><table>
      <caption>样例结果 · 非真实抓取</caption>
      <thead><tr><th scope="col">商品型号</th><th scope="col">参数</th><th scope="col">评价</th><th scope="col">终止原因</th></tr></thead>
      <tbody><tr><td>示例-B509</td><td>509L</td><td>100 条</td><td>达到上限</td></tr><tr><td>示例-C432</td><td>432L</td><td>37 条</td><td>无下一页</td></tr></tbody>
    </table></div>}
  </section>
}

export function ReviewPanel({ state, hasUnsentChanges, dispatch }: {
  state: DemoState; hasUnsentChanges: boolean; dispatch: (action: DemoAction) => void
}) {
  const hasPlan = state.planRevision !== null && state.planRevision === state.revision
  return <aside className="review-panel" aria-labelledby="plan-title">
    <header className="section-heading"><h2 id="plan-title">当前计划</h2><Badge color="gray" variant="soft">{hasPlan ? `示例 v${state.planRevision}` : "待形成"}</Badge></header>
    {!hasPlan ? <div className="plan-empty">
      <div className="plan-placeholder" aria-hidden="true"><span /><span /><span /></div>
      <h3>{state.messages.length ? "新需求已记录，等待形成计划" : "计划会在这里逐步明确"}</h3>
      <p>{state.messages.length ? "真实规划尚未接入，当前需求没有可确认或执行的方案。" : "先描述需求，或载入预设示例，体验从核对到执行的完整交互。"}</p>
      <ul><li>从哪里采集、范围到哪里</li><li>需要哪些字段与来源关系</li><li>采集多少、何时结束</li></ul>
    </div> : <>
      <div className="plan-content"><p className="eyebrow">预设示例 · 非模型生成</p><h3>旗舰店冰箱与评价</h3>
        <dl className="plan-facts">
          <div><dt>来源入口</dt><dd>示例旗舰店<span>未绑定真实链接，仅供演示</span></dd></div>
          <div><dt>采集范围</dt><dd>店铺中可枚举的冰箱商品<span>每个商品保留独立来源关系</span></dd></div>
          <div><dt>采集内容</dt><dd>型号、原始参数、商品链接、评价</dd></div>
          <div><dt>数量与排序</dt><dd>每商品最多 100 条评价<span>采用页面默认顺序</span></dd></div>
          <div><dt>完成条件</dt><dd>枚举结束，且各商品达到评价上限或无下一页<span>不足上限时保留实际条数与终止原因</span></dd></div>
        </dl><NodePreview />
      </div>
      <div className="plan-decision" aria-live="polite">
        {hasUnsentChanges ? <p>输入框中有尚未发送的修改。请先发送，或清空输入后再确认。</p> :
          <p>{state.stage === "draft" ? "核对后确认这一版计划；确认不会访问网站。" : <><Check size={14} aria-hidden="true" /> 示例 v{state.planRevision} 已确认</>}</p>}
        {state.stage === "draft" && <Button disabled={hasUnsentChanges} onClick={() => dispatch({ type: "confirm_plan" })}>确认示例计划</Button>}
        {state.stage === "confirmed" && <Button disabled={hasUnsentChanges} onClick={() => dispatch({ type: "queue_demo" })}><Play size={16} aria-hidden="true" />开始演示运行</Button>}
      </div>
      {(isExecuting(state.stage) || state.stage === "complete") && <RunStatus state={state} dispatch={dispatch} />}
    </>}
  </aside>
}

export function DeveloperPreview() {
  return <Dialog.Root><Dialog.Trigger><Button variant="ghost" color="gray" size="1">开发预览</Button></Dialog.Trigger>
    <Dialog.Content maxWidth="520px"><Dialog.Title>组件与实现边界</Dialog.Title>
      <Dialog.Description>Radix Themes 成品控件与统一主题。此页面未接入真实聊天、浏览器运行或模型审计。</Dialog.Description>
      <div className="component-samples"><div className="button-row"><Button>主要操作</Button><Button variant="soft">次要操作</Button><Button variant="outline">辅助操作</Button></div>
        <label htmlFor="sample-url">来源链接样例</label><TextField.Root id="sample-url" name="sample-url" type="url" autoComplete="off" placeholder="https://example.com/…" /></div>
      <div className="dialog-actions"><Dialog.Close><Button variant="soft">关闭预览</Button></Dialog.Close></div>
    </Dialog.Content></Dialog.Root>
}
