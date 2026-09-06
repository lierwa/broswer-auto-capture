import { useState } from "react"
import { Badge, Button } from "@radix-ui/themes"
import { ArrowRight, Database } from "lucide-react"
import { DetailPane } from "./DetailPane.js"
import type { InterviewState } from "./interviewContract.js"


export { Sources } from "./Sources.js"

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
