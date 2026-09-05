import { useState } from "react"
import { Badge, Button, Dialog, TextField } from "@radix-ui/themes"
import { ArrowRight, Database, Search, ShieldCheck } from "lucide-react"
import { planSteps, type StepId } from "./chainData.js"

export function Sources({ confirmedVersion }: { confirmedVersion: number | null }) {
  return <section className="artifact-view" aria-label="来源调研">
    <header className="view-heading"><div><p className="eyebrow">RESEARCH / SOURCE EVIDENCE</p><h2>用真实来源，回答能不能抓</h2></div><Badge color="gray">尚未调研</Badge></header>
    <p className="muted">需求草稿确定目标；来源调研负责搜索、打开页面、核对内容与覆盖，再为计划提供证据。</p>
    <div className="research-summary"><Search size={24} /><div><h3>{confirmedVersion === null ? "等待确认需求范围" : `需求 v${confirmedVersion} 已确认（演示）`}</h3><p>{confirmedVersion === null ? "你可以先检查这里需要什么证据，再回到需求对话继续澄清。" : "下一步应发起真实搜索与样本核验。来源调研服务尚未接入。"}</p></div><Button disabled>开始来源调研</Button></div>
    <div className="evidence-grid">{[
      ["01", "发现候选来源", "根据确认范围搜索店铺入口、商品列表与详情页。", "查询意图 / 候选 URL / 采纳理由"],
      ["02", "打开样本核验", "检查页面实际字段、默认排序、分页方式和访问限制。", "观察时间 / 页面依据 / 支持内容"],
      ["03", "检查范围覆盖", "对照需求逐项判断覆盖；缺口带回对话讨论。", "已覆盖 / 缺口 / 风险 / 待决事项"],
    ].map(([number, title, text, fields]) => <article className="evidence-card" key={number}><span className="large-number">{number}</span><h3>{title}</h3><p>{text}</p><footer>{fields}</footer></article>)}</div>
    <div className="section-line"><h3>来源证据</h3><Badge color="gray" variant="outline">0 条已观察来源</Badge></div>
    <div className="empty-evidence"><ShieldCheck size={20} /><p>尚无实际来源观察。搜索命中不等于页面可抓取；访问受限会单独记录，不会被当作已覆盖。</p></div>
  </section>
}

export function Plan({ onChain }: { onChain: (step: StepId) => void }) {
  return <section className="artifact-view" aria-label="抓取计划">
    <header className="view-heading"><div><p className="eyebrow">PLAN / DEPENDENCIES</p><h2>先看步骤，再看实现链路</h2></div><Badge color="amber" variant="outline">计划结构样例</Badge></header>
    <p className="muted">以下以旗舰店冰箱为例展示计划字段，不是当前需求的正式计划。尚无真实来源证据，不能确认执行。</p>
    <div className="plan-dependency"><span>01 枚举商品</span><ArrowRight size={16} /><div><span>02 商品详情</span><span>03 商品评价</span></div><small>后两步消费同一商品集合<br />实际浏览器任务串行调度</small></div>
    <div className="plan-cards">{planSteps.map((step, index) => <article className="plan-card" key={step.id}>
      <header><span className="large-number">0{index + 1}</span><div><h3>{step.title}</h3><span className="muted">依赖：{step.depends}</span></div><Button size="1" variant="outline" onClick={() => onChain(step.id)}>查看链路<ArrowRight size={13} /></Button></header>
      <dl className="plan-fields"><div><dt>来源</dt><dd>{step.source}</dd></div><div><dt>输入 → 输出</dt><dd>{step.input} → {step.output}</dd></div><div><dt>完成条件</dt><dd>{step.finish}</dd></div><div><dt>预算</dt><dd>{step.budget}</dd></div></dl>
    </article>)}</div>
    <div className="action-gate"><p>正式计划须绑定确认的需求版本和实际来源证据。需求确认与执行授权分别记录。</p><Button disabled>确认计划并启动</Button></div>
  </section>
}

export function Results() {
  const [showSample, setShowSample] = useState(false)
  return <section className="artifact-view" aria-label="运行结果">
    <header className="view-heading"><div><p className="eyebrow">RUNS / RESULTS & AUDIT</p><h2>每次运行，都有独立结果</h2></div><Badge color="gray">尚无运行</Badge></header>
    <div className="run-facts"><div><span>浏览器任务</span><strong>未启动</strong></div><div><span>结果与检查点</span><strong>未产生</strong></div><div><span>模型调用审计</span><strong>未接入</strong></div></div>
    <div className="results-empty"><Database size={32} /><h3>结果会保留它的来源</h3><p>运行后在这里查看商品、原始内容、来源链接、覆盖情况和终止原因。<br />中断时保留部分结果；恢复继续同一运行，复跑创建新运行。</p><Button variant="outline" onClick={() => setShowSample(!showSample)}>{showSample ? "收起结果结构样例" : "查看结果结构样例"}</Button></div>
    {showSample && <div><div className="section-line"><h3>结果结构样例</h3><Badge color="orange">非真实抓取数据</Badge></div><div className="table-wrap"><table><thead><tr><th>商品 / 来源键</th><th>原始参数</th><th>评价</th><th>来源关联</th><th>终止原因</th></tr></thead><tbody><tr><td>示例-B509</td><td>示例：509L</td><td>100 条（样例）</td><td>商品 URL + 运行时间</td><td>达到示例上限</td></tr><tr><td>示例-C432</td><td>示例：432L</td><td>37 条（样例）</td><td>商品 URL + 运行时间</td><td>示例页无更多</td></tr></tbody></table></div></div>}
  </section>
}

export function DesignSystem() {
  return <section className="artifact-view"><header className="view-heading"><div><p className="eyebrow">DESIGN SYSTEM</p><h2>成品组件与语义主题</h2></div><Badge color="gray">Radix Themes / React Flow</Badge></header><div className="sample-grid"><div className="button-row"><Button>主操作</Button><Button variant="soft">辅助操作</Button><Button variant="outline">边框操作</Button></div><TextField.Root placeholder="来源 URL 字段样例" aria-label="来源 URL 字段样例" /><Dialog.Root><Dialog.Trigger><Button variant="outline">组件边界说明</Button></Dialog.Trigger><Dialog.Content><Dialog.Title>组件边界</Dialog.Title><Dialog.Description>弹窗用于辅助说明；需求访谈保留在持续工作区中。</Dialog.Description><div className="dialog-actions"><Dialog.Close><Button>知道了</Button></Dialog.Close></div></Dialog.Content></Dialog.Root></div></section>
}
