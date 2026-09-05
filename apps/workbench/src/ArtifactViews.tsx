import { useState } from "react"
import { Badge, Button } from "@radix-ui/themes"
import { ArrowRight, Database, FileSearch, Search } from "lucide-react"
import { planSteps, type StepId } from "./chainData.js"
import { DetailPane } from "./DetailPane.js"
import type { InterviewState } from "./interviewContract.js"

export function Sources({ confirmedVersion, onInterview, onDraft }: { confirmedVersion: number | null; onInterview: () => void; onDraft: () => void }) {
  return <section className="artifact-view" aria-label="来源调研">
    <header className="view-heading"><h2>来源调研</h2>{confirmedVersion && <Button variant="ghost" color="gray" onClick={onDraft}>需求 v{confirmedVersion}<ArrowRight size={14} /></Button>}</header>
    <div className="stage-empty"><Search size={26} /><h3>{confirmedVersion ? "范围已确认，准备核验来源" : "先明确这次任务的范围"}</h3><p>{confirmedVersion ? "当前任务尚无来源观察。真实来源调研服务还未接入，不能启动搜索或宣称页面已核验。" : "需求确认后，依据这份范围搜索真实入口、核验样本，并检查覆盖缺口。"}</p>
      {confirmedVersion ? <Button disabled>开始来源调研</Button> : <Button variant="soft" onClick={onInterview}>继续需求对话<ArrowRight size={14} /></Button>}
    </div>
    <details className="supporting-detail"><summary>调研依据与核验内容</summary><div className="compact-checklist"><p><strong>发现入口</strong>保存查询意图、实际候选 URL 与采纳理由。</p><p><strong>核验样本</strong>检查页面字段、枚举方式、访问限制与观察时间。</p><p><strong>核对覆盖</strong>影响目标的缺口放在主层，必要时带证据回到需求讨论。</p></div></details>
  </section>
}

export function Plan({ onChain, onSources }: { onChain: (step: StepId) => void; onSources: () => void }) {
  const [sample, setSample] = useState(false)
  return <section className="artifact-view" aria-label="抓取计划">
    <header className="view-heading"><h2>抓取计划</h2><Button variant="ghost" color="gray" onClick={() => setSample(!sample)}>{sample ? "收起步骤结构样例" : "查看步骤结构样例"}</Button></header>
    {!sample ? <div className="stage-empty"><FileSearch size={26} /><h3>还没有正式抓取计划</h3><p>计划需要绑定当前需求和真实来源证据，明确步骤依赖、结果与停止条件。</p><Button variant="soft" onClick={onSources}>查看来源调研<ArrowRight size={14} /></Button></div> : <>
      <p className="sample-notice">结构样例 · 以下冰箱步骤仅说明结构，不属于当前任务的正式计划。</p>
      <div className="plan-dependency"><span>01 枚举商品</span><ArrowRight size={16} /><div><span>02 商品详情</span><span>03 商品评价</span></div></div>
      <div className="plan-cards">{planSteps.map((step, index) => <article className="plan-card" key={step.id}>
        <header><span className="large-number">0{index + 1}</span><div><h3>{step.title}</h3><span className="muted">{step.input} → {step.output}</span></div><Button size="1" variant="ghost" onClick={() => onChain(step.id)}>查看链路<ArrowRight size={13} /></Button></header>
        <details className="plan-detail"><summary>来源、预算与完成条件</summary><dl className="plan-fields"><div><dt>来源 / 依赖</dt><dd>{step.source} · {step.depends}</dd></div><div><dt>完成条件</dt><dd>{step.finish}</dd></div><div><dt>预算</dt><dd>{step.budget}</dd></div></dl></details>
      </article>)}</div></>}
    <div className="action-gate"><p>当前任务尚无来源证据与正式计划，不能启动浏览器。</p><Button disabled>确认计划并启动</Button></div>
  </section>
}

export function Results({ state, active, onPlan }: { state: InterviewState; active: boolean; onPlan: () => void }) {
  const [sample, setSample] = useState(false)
  const [details, setDetails] = useState<"audit" | "sample" | null>(null)
  return <div className="view-with-detail"><section className="artifact-view" aria-label="运行结果">
    <header className="view-heading"><h2>运行结果</h2><Button variant="ghost" color="gray" onClick={() => setDetails("audit")}>调用审计</Button></header>
    {!sample ? <div className="stage-empty"><Database size={26} /><h3>当前任务尚未运行</h3><p>运行后的数据、真实覆盖与关键缺口显示在这里。需求对话不等于浏览器运行。</p><Button variant="soft" onClick={onPlan}>查看抓取计划<ArrowRight size={14} /></Button></div> : <><p className="sample-notice">结果结构样例 · 非当前任务数据</p><div className="table-wrap"><table><thead><tr><th>来源键</th><th>原始参数</th><th>评价</th><th>终止原因</th><th>详情</th></tr></thead><tbody><tr><td>示例-B509</td><td>示例：509L</td><td>20 条（样例）</td><td>达到示例上限</td><td><Button size="1" variant="ghost" onClick={() => setDetails("sample")}>查看记录</Button></td></tr></tbody></table></div></>}
    <Button className="sample-toggle" variant="ghost" color="gray" onClick={() => setSample(!sample)}>{sample ? "收起结果结构样例" : "查看结果结构样例"}</Button>
  </section><DetailPane title={details === "sample" ? "记录详情" : "调用审计"} open={active && details !== null} onClose={() => setDetails(null)}>
    {details === "sample" ? <div className="detail-content"><Badge color="gray">结构样例</Badge><h3>示例-B509</h3><p>来源关联由商品 URL、运行时间与稳定来源键共同记录。当前没有真实来源或结果。</p></div> : <div className="detail-content"><h3>需求访谈</h3><p className="muted">当前任务已返回的模型调用记录；不是浏览器运行次数。</p>{state.audits.length ? state.audits.map((audit, index) => <details className="audit-record" key={index}><summary>需求轮次 {audit.revision} · {audit.invocations} 次调用</summary><p>{audit.model} / {audit.effort}</p></details>) : <p>暂无已返回的调用审计。</p>}<h3>浏览器执行</h3><p>未启动，无运行审计。</p></div>}
  </DetailPane></div>
}
