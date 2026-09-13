import { useEffect, useState, useSyncExternalStore } from "react"
import { Badge, Button, Callout, Flex, Select, TextArea } from "@radix-ui/themes"
import { taskPlanExecutionIssues, type TaskChain, type TaskPlan, type TaskRequirement } from "@browser-capture/contracts"
import { TaskChainConnection } from "./taskChainConnection.js"
import { isStaleVersion } from "./taskChainProjection.js"
import { AuthoringStatus } from "./AuthoringStatus.js"

export function Plan({ connection, active, readOnly, confirmedVersion, onInterview, onDraft }: {
  taskId: string; connection: TaskChainConnection; active: boolean; readOnly: boolean;
  confirmedVersion: number | null; interviewRevision: number; onInterview(): void; onDraft(): void;
}) {
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [selected, setSelected] = useState<string | null>(null), [runInput, setRunInput] = useState("{}")
  const [inputError, setInputError] = useState("")
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const poll = async () => { await connection.reload(controller.signal); if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000) }
    void poll(); return () => { controller.abort(); clearTimeout(timer) }
  }, [active, connection])
  const state = view.state, plans = state?.plans.toSorted((left, right) => right.version - left.version) ?? []
  const plan = plans.find((item) => `${item.id}:${item.version}` === selected) ?? plans[0]
  const busy = view.busy || state?.jobs.some((job) => ["queued", "running", "waiting_for_human"].includes(job.status))
  const stale = plan && state ? isStaleVersion(state, "plan", plan.id, plan.version) : false
  const executionIssues = plan ? taskPlanExecutionIssues(plan) : []
  const chains = plan && state ? Object.fromEntries(plan.steps.map((step) => [step.id, latestChain(state.chains, plan, step.id)])) : {}
  const ready = plan ? executionIssues.length === 0 && plan.steps.every((step) => chains[step.id]?.validation.status === "verified") : false
  if (!state) return <section className="artifact-view"><p role="status">{view.error || "正在读取任务计划…"}</p><Button onClick={() => void connection.reload()}>重新连接</Button></section>
  return <section className="artifact-view" aria-label="任务计划">
    <header className="view-heading"><h2>任务计划</h2><Button variant="ghost" onClick={onInterview}>返回需求对话</Button></header>
    <AuthoringStatus jobs={state.jobs} chains={state.chains} onCancel={(jobId) => { void connection.dispatch({ type: "cancel_authoring", jobId }) }} />
    {view.error && <Callout.Root color="red"><Callout.Text>{view.error}</Callout.Text><Button onClick={() => void connection.retry()}>重试原请求</Button><Button variant="ghost" onClick={connection.dismiss}>关闭</Button></Callout.Root>}
    {!state.requirement ? <div className="stage-empty"><h3>先确认当前需求草稿</h3><p>计划只绑定当前明确确认的需求版本；修改需求后旧计划保持只读。</p><Button onClick={onDraft}>查看草稿</Button></div> : <>
      <RequirementDefinition requirement={state.requirement} />
      {!plan ? <div className="stage-empty"><h3>尚未生成任务计划</h3><p>模型只负责把已确认需求拆成可组合步骤；浏览器能力将在链路验证时确认。</p>
        <Button disabled={readOnly || busy || confirmedVersion !== state.requirement.version} onClick={() => void connection.dispatch({ type: "generate_plan", requestId: crypto.randomUUID(), requirementVersion: state.requirement!.version })}>生成任务计划</Button></div> : <>
        <Flex gap="2" wrap="wrap" my="3"><Select.Root value={`${plan.id}:${plan.version}`} onValueChange={setSelected}><Select.Trigger aria-label="计划版本" /><Select.Content>{plans.map((item) => <Select.Item key={`${item.id}:${item.version}`} value={`${item.id}:${item.version}`}>计划 v{item.version}</Select.Item>)}</Select.Content></Select.Root>
          <Badge color={stale ? "amber" : "green"}>{stale ? "历史只读" : "绑定当前需求"}</Badge>
          <Badge color={executionIssues.length ? "red" : ready ? "green" : "gray"}>{executionIssues.length ? "执行合同不兼容" : ready ? "所有链路已验证" : "链路待生成或验证"}</Badge>
          <Button variant="soft" disabled={readOnly || busy || confirmedVersion !== state.requirement.version}
            onClick={() => void connection.dispatch({ type: "generate_plan", requestId: crypto.randomUUID(), requirementVersion: state.requirement!.version })}>重新生成计划</Button></Flex>
        {executionIssues.length > 0 && <Callout.Root color="red"><Callout.Text>这份计划的输入输出绑定不适用于执行，请重新生成计划。问题：{executionIssues.join("、")}</Callout.Text></Callout.Root>}
        <h3>{plan.summary}</h3><p>授权范围：{plan.authorizationScope}</p>
        <div className="action-gate"><h3>首次完整任务探索</h3><p>Pi 在一个受控浏览器会话中完成整项任务；宿主从同一真实轨迹为各可复用步骤编译链路。</p>
          <TextArea aria-label="完整任务代表输入 JSON" value={runInput} onChange={(event) => setRunInput(event.target.value)} rows={5} />
          {inputError && <p className="error-text">{inputError}</p>}
          <Button disabled={readOnly || stale || busy || executionIssues.length > 0}
            onClick={() => dispatchTask(connection, plan, runInput, setInputError)}>完成整项任务并生成全部链路</Button></div>
        <div className="plan-cards">{plan.steps.map((step, index) => <StepCard key={step.id} index={index} plan={plan} step={step}
          {...(chains[step.id] ? { chain: chains[step.id] } : {})} stale={stale} incompatible={executionIssues.length > 0}
          busy={Boolean(busy)} readOnly={readOnly} connection={connection} allowGenerate={plan.steps.length === 1} />)}</div>
        <div className="completion-budget"><h3>整体完成与预算</h3>{plan.completion.map((item) => <p key={item.id}><strong>{item.description}</strong></p>)}
          <p>每步预算由编译后的链路推导；业务数量决定同一链路的调用次数。</p></div>
        <div className="action-gate"><h3>授权一次独立运行</h3><p>输入必须符合本计划保存的动态合同。授权后，每个步骤只调用其已验证链路；集合输入逐项复用同一版本。</p>
          <TextArea aria-label="运行输入 JSON" value={runInput} onChange={(event) => setRunInput(event.target.value)} rows={5} />
          {inputError && <p className="error-text">{inputError}</p>}
          <Button disabled={readOnly || stale || !ready || view.busy} onClick={() => dispatchJson(connection, plan, runInput, setInputError)}>确认范围与预算并排队</Button></div>
      </>}
      {state.legacy.length > 0 && <details className="supporting-detail"><summary>旧协议历史</summary><p>这些记录保持原字节，只能读取或导出，不能进入新运行器。</p>{state.legacy.map((item) => <p key={`${item.source}:${item.id}`}>{item.source} · {item.id} · {item.reason}</p>)}</details>}
    </>}
  </section>
}

function RequirementDefinition({ requirement }: { requirement: TaskRequirement }) {
  return <details className="supporting-detail" open><summary>已确认需求 v{requirement.version}</summary><p><strong>{requirement.goal}</strong></p>
    <pre className="chain-json">{requirement.definition.body}</pre><p>{requirement.authorization.scope}</p>
    {requirement.authorization.requiredApprovals.map((item, index) => <p key={index}>{item}</p>)}</details>
}

function StepCard({ index, plan, step, chain, stale, incompatible, busy, readOnly, connection, allowGenerate }: {
  index: number; plan: TaskPlan; step: TaskPlan["steps"][number]; chain?: TaskChain; stale: boolean; busy: boolean;
  incompatible: boolean; readOnly: boolean; connection: TaskChainConnection; allowGenerate: boolean;
}) {
  const [sampleInput, setSampleInput] = useState("{}"), [sampleError, setSampleError] = useState("")
  const status = !chain ? "尚未生成" : chain.validation.status === "verified" ? "换输入验证通过" : "候选链路待验证"
  return <article className="plan-card"><Flex justify="between" align="start"><div><span className="mono">{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3></div><Badge color={chain?.validation.status === "verified" ? "green" : "gray"}>{status}</Badge></Flex>
    <p>{step.goal}</p><p>依赖：{step.dependsOn.length ? step.dependsOn.join("、") : "无"}</p>
    <p>调用：{step.invocation.mode === "once" ? "单次" : `逐项复用，最多 ${step.invocation.maxItems} 项；失败时 ${step.invocation.onItemFailure}`}</p>
    <p>输入 {step.inputContract.id}@{step.inputContract.version} → 输出 {step.outputContract.id}@{step.outputContract.version}</p>
    <p>{chain ? budgetText(chain.budget) : "技术预算将在链路编译后确定。"}</p>{step.risks.map((risk, riskIndex) => <p key={riskIndex}>{risk}</p>)}
    {allowGenerate && <><TextArea aria-label={`${step.title} 代表输入 JSON`} value={sampleInput}
      onChange={(event) => setSampleInput(event.target.value)} rows={3} />
    {sampleError && <p className="error-text">{sampleError}</p>}
    <Button variant="soft" disabled={readOnly || stale || incompatible || busy}
      onClick={() => dispatchChain(connection, plan, step.id, sampleInput, setSampleError)}>{chain ? "生成新候选" : "探索并生成候选链路"}</Button></>}
  </article>
}

function latestChain(chains: TaskChain[], plan: TaskPlan, stepId: string) {
  return chains.filter((chain) => chain.plan.id === plan.id && chain.plan.version === plan.version && chain.stepId === stepId)
    .toSorted((left, right) => right.version - left.version)[0]
}
function budgetText(value: TaskPlan["budget"]) {
  return `${value.maxTransitions} 次转换 · ${value.maxBrowserCommands} 条浏览器命令 · ${Math.round(value.maxActiveMs / 1000)} 秒自动化时间 · ${value.maxLlmCalls} 次显式模型调用`
}
function dispatchChain(connection: TaskChainConnection, plan: TaskPlan, stepId: string, raw: string,
  error: (value: string) => void) {
  try {
    const input: unknown = JSON.parse(raw); error("")
    void sha256(JSON.stringify(plan)).then((digest) => connection.dispatch({ type: "generate_chain", requestId: crypto.randomUUID(),
      plan: { id: plan.id, version: plan.version, digest }, stepId, input }))
  } catch { error("请输入有效 JSON。") }
}
function dispatchTask(connection: TaskChainConnection, plan: TaskPlan, raw: string, error: (value: string) => void) {
  try {
    const input: unknown = JSON.parse(raw); error("")
    void sha256(JSON.stringify(plan)).then((digest) => connection.dispatch({ type: "generate_task_chains",
      requestId: crypto.randomUUID(), plan: { id: plan.id, version: plan.version, digest }, input }))
  } catch { error("请输入有效 JSON。") }
}
function dispatchJson(connection: TaskChainConnection, plan: TaskPlan, raw: string, error: (value: string) => void) {
  try {
    const input: unknown = JSON.parse(raw); error("")
    void sha256(JSON.stringify(plan)).then((digest) => connection.dispatch({ type: "authorize_plan", requestId: crypto.randomUUID(),
      plan: { id: plan.id, version: plan.version, digest }, input }))
  } catch { error("请输入有效 JSON。") }
}
export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
