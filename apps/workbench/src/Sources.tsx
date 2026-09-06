import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Badge, Button, Callout, Flex, Select } from "@radix-ui/themes"
import { ArrowRight, Search } from "lucide-react"
import type { ResearchRecord, SourceCandidate } from "@browser-capture/contracts/research"
import { ResearchConnection } from "./researchConnection.js"
import { BrowserStatus } from "./BrowserStatus.js"
import { DetailPane } from "./DetailPane.js"

const labels = { running: "调研中", completed: "规划证据已具备", partial: "存在覆盖缺口", failed: "调研未完成", cancelled: "已停止", manual_required: "需要人工处理", cleanup_required: "会话待清理", interrupted: "调研已中断" }
const candidateLabels = { candidate: "候选", observed: "已观察", restricted: "受限", unavailable: "不可用" }
export function Sources({ confirmedVersion, revision = 0, onInterview, onDraft, onPlan, taskId, active = false, readOnly = false }: {
  confirmedVersion: number | null; revision?: number; onInterview: () => void; onDraft: () => void; onPlan?: () => void; taskId?: string; active?: boolean; readOnly?: boolean;
}) {
  const connection = useMemo(() => new ResearchConnection(taskId ?? ""), [taskId])
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [version, setVersion] = useState<string | null>(null), [detail, setDetail] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!active || !taskId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => { await connection.reload(controller.signal); if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1200) }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [connection, active, taskId, confirmedVersion])
  const state = view.state, latest = state?.records[0], record = state?.records.find((item) => item.id === version) ?? latest
  const stale = record && state?.staleIds.includes(record.id), candidate = record?.candidates.find((item) => item.id === detail)
  const pending = view.busy || view.pending !== null
  const candidates = record?.candidates.slice().sort((a, b) => Number(a.status === "candidate") - Number(b.status === "candidate")) ?? []
  async function start() {
    if (!confirmedVersion) return
    setVersion(null); await connection.dispatch({ type: "start", requestId: crypto.randomUUID(), requirementVersion: confirmedVersion })
  }
  async function interview() {
    if (record && await connection.dispatch({ type: "interview", researchId: record.id, requestId: crypto.randomUUID(), expectedRevision: revision })) onInterview()
  }
  return <div className="view-with-detail"><section className="artifact-view" aria-label="来源调研">
    <header className="view-heading"><h2>来源调研</h2>{confirmedVersion && <Button variant="ghost" color="gray" onClick={onDraft}>需求 v{confirmedVersion}<ArrowRight size={14} /></Button>}</header>
    {taskId && <BrowserStatus taskId={taskId} active={active} />}
    {view.error && <Callout.Root color="amber"><Callout.Text>{view.error}</Callout.Text><Flex gap="2" wrap="wrap"><Button variant="soft" onClick={() => void connection.reload()}>重新连接</Button>{view.pending !== null && <><Button disabled={view.busy} onClick={() => void connection.retry()}>重试原请求</Button><Button variant="ghost" onClick={connection.dismiss}>取消重试</Button></>}</Flex></Callout.Root>}
    {!state ? <p role="status">正在读取来源调研…</p> : <>
      <Flex gap="3" align="center" wrap="wrap" my="3">
        <Button onClick={() => void start()} disabled={!state.eligible || state.busy || pending || readOnly}>{latest ? "重新调研" : "开始来源调研"}</Button>
        {latest?.status === "running" && <Button variant="soft" disabled={pending} onClick={() => void connection.dispatch({ type: "cancel", researchId: latest.id })}>停止调研</Button>}
        {state.records.length > 0 && <Select.Root value={record?.id ?? ""} onValueChange={(value) => { setVersion(value); setDetail(null) }}><Select.Trigger aria-label="来源调研版本" /><Select.Content>{state.records.map((item) => <Select.Item key={item.id} value={item.id}>来源 v{item.version} · {labels[item.status]}</Select.Item>)}</Select.Content></Select.Root>}
        {state.blocked && <span className="muted">{state.blocked}</span>}
      </Flex>
      {!record ? <div className="stage-empty"><Search size={26} /><h3>{confirmedVersion ? "范围已确认，准备核验来源" : "先明确这次任务的范围"}</h3><p>依据确认范围发现真实入口、核验代表页，并检查字段和枚举依据。</p>{!state.eligible && <Button variant="soft" onClick={onInterview}>继续需求对话</Button>}</div> : <>
        <Flex gap="2" wrap="wrap"><Badge color={record.status === "completed" ? "green" : "amber"}>{labels[record.status]}</Badge><Badge color="gray">需求 v{record.requirementVersion} · 来源 v{record.version}</Badge>{stale && <Badge color="amber">需求已变更 · 待复核</Badge>}</Flex>
        <p role="status">{record.current}</p>
        {record.gaps.length > 0 && <div className="source-gaps"><h3>覆盖缺口</h3><ul>{record.gaps.map((gap, index) => <li key={index}>{gap.description}</li>)}</ul><Button variant="soft" disabled={record.status === "running" || pending || readOnly} onClick={() => void interview()}>带证据回到需求对话</Button></div>}
        {record.status === "completed" && !stale && <Button variant="soft" onClick={onPlan}>审阅下一步计划<ArrowRight size={14} /></Button>}
        <details className="supporting-detail"><summary>查询记录 · {record.queries.length} 次</summary>{record.queries.map((query) => <p key={query.id}>{query.intent} · {query.observationId ? "已观察搜索页" : "尚无搜索页观察"}<br /><a href={query.url} target="_blank" rel="noreferrer">搜索页面</a></p>)}</details>
        <div className="source-list">{(expanded ? candidates : candidates.slice(0, 12)).map((item) => <article className="source-row" key={item.id}><div><h3>{item.title || new URL(item.url).hostname}</h3><span className="muted">{new URL(item.url).hostname} · {candidateLabels[item.status]}</span><p>{item.reason}</p></div><Button size="1" variant="soft" onClick={() => setDetail(item.id)}>来源详情</Button></article>)}</div>
        {candidates.length > 12 && <Button variant="ghost" onClick={() => setExpanded(!expanded)}>{expanded ? "收起其余候选" : `查看全部 ${candidates.length} 个候选`}</Button>}
        {!record.candidates.length && <p className="muted">尚无真实候选链接；已有查询和状态保留在本次调研中。</p>}
        <details className="supporting-detail"><summary>覆盖依据与模型审计</summary>{record.coverage.map((item, index) => <p key={index}><strong>{item.objective}</strong>：{item.reason}</p>)}{record.audits.map((item) => <p key={item.id}>来源调研 · {item.model}/{item.effort} · {item.status} · {item.invocations === null ? "请求次数未回报" : `${item.invocations} 次已回报调用`}</p>)}</details>
      </>}
    </>}
  </section><DetailPane title="来源详情" open={active && Boolean(candidate)} onClose={() => setDetail(null)}>{candidate && record && <SourceDetail candidate={candidate} record={record} />}</DetailPane></div>
}
function SourceDetail({ candidate, record }: { candidate: SourceCandidate; record: ResearchRecord }) {
  const observations = record.observations.filter((item) => item.candidateId === candidate.id)
  return <div className="detail-content source-detail"><Badge>{candidateLabels[candidate.status]}</Badge><h3>{candidate.title}</h3><a href={candidate.url} target="_blank" rel="noreferrer">{candidate.url}</a><p>发现时间：{candidate.discoveredAt}</p><p>来源：{candidate.provenance === "provided" ? "需求提供的线索" : `真实页面链接（证据 ${candidate.discoveredOn}）`}</p><p>{candidate.reason}</p>
    {observations.map((item) => <div key={item.id}><h3>代表页观察</h3><p>{item.at}</p><p>实际地址：<a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></p><p>{item.truncated ? "观察文本被截断，覆盖受限" : "本次语义观察完整"}</p><p>{item.assessment?.reason ?? "已观察，尚未完成可行性判断"}</p><h4>字段依据</h4>{item.assessment?.fields.map((field, index) => <p key={index}><strong>{field.name}</strong>：{field.evidence}</p>)}<h4>枚举或分页方式</h4><p>{item.assessment?.enumeration ? `${item.assessment.enumeration.name}：${item.assessment.enumeration.evidence}` : "尚无核验依据"}</p>{item.assessment?.limitations.map((limit, index) => <p key={index}>{limit}</p>)}<details><summary>证据标识</summary><p>{item.id}</p><p>观察摘要 SHA-256：{item.digest}</p></details></div>)}
  </div>
}
