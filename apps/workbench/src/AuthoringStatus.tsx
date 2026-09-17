import { Badge, Button } from "@radix-ui/themes"
import type { AuthoringProgressEvent, TaskAuthoringJob, TaskChain } from "@browser-capture/contracts"
import { authoringLevel } from "./taskChainProjection.js"

export function AuthoringStatus({ jobs, chains, onCancel }: { jobs: TaskAuthoringJob[]; chains: TaskChain[]; onCancel(id: string): void }) {
  return <div aria-label="探索与编译进度">{jobs.slice(-5).map((job) => <article key={job.id}>
    <Badge>{authoringLevel(job, chains)}</Badge>
    {["queued", "running", "waiting_for_human"].includes(job.status) && <Button size="1" variant="soft" onClick={() => onCancel(job.id)}>停止生成</Button>}
    {job.status === "waiting_for_human" && job.waitpoint && <p role="status">{job.waitpoint.prompt}</p>}
    {job.authoring && <p>探索会话 {job.authoring.consumption.explorationSessions} · 工具调用 {job.authoring.consumption.explorationToolCalls} · 编译调用 {job.authoring.consumption.compilationCalls}</p>}
    {job.authoring?.progress && <p role="status">{progressText(job.authoring.progress)}</p>}
    {job.reason && <p role="status">{job.authoring?.failureLayer ? `${job.authoring.failureLayer}：` : ""}{job.reason}</p>}
    {job.authoring?.exploration && <details><summary>业务结果与来源证据</summary><pre className="chain-json">{JSON.stringify(job.authoring.exploration, null, 2)}</pre></details>}
  </article>)}</div>
}

function progressText(progress: NonNullable<NonNullable<TaskAuthoringJob["authoring"]>["progress"]>) {
  const latest = progress.events.at(-1)
  if (!latest) return "实时进度：正在启动浏览器探索"
  const time = new Date(latest.occurredAt).toLocaleTimeString("zh-CN", { hour12: false })
  return `实时进度：${eventText(latest)} · 已派发动作 ${progress.actionsStarted} · 已开始模型调用 ${progress.modelCallsStarted} · 最近同步 ${time}`
}

function eventText(event: AuthoringProgressEvent) {
  const status = { started: "开始", completed: "完成", failed: "失败", cancelled: "取消" }[event.status]
  if (event.phase === "model") return `模型调用 ${event.purpose} ${status}`
  if (event.phase === "author") return `浏览器探索${status}`
  const step = event.stepNumber === undefined ? "" : `第 ${event.stepNumber} 步`
  const action = event.actionName ? ` ${event.actionName}` : ""
  const phase = event.phase === "before_action" ? "动作准备" : event.phase === "dispatch" ? "动作执行" : "结果采集"
  const query = event.actionName === "find_elements" && event.selector
    ? ` · selector=${event.selector}${event.queryOutcome ? ` · ${queryOutcomeText(event)}` : ""}${event.contextOutcome
      ? ` · ${event.contextOutcome === "enriched" ? `上下文 ${event.contextCount} 条` : "上下文补充失败"}` : ""}` : ""
  const read = event.actionName === "bat_read_fields" && event.outputPath
    ? ` · outputPath=${JSON.stringify(event.outputPath)}${event.container ? ` · container=${event.container}` : ""}${event.readOutcome ? ` · ${readOutcomeText(event)}` : ""}` : ""
  return `${step}${action} ${phase}${status}${query}${read}`.trim()
}

function readOutcomeText(event: AuthoringProgressEvent) {
  if (event.readOutcome === "succeeded") return "字段读取成功"
  if (event.readOutcome === "failed") return `字段读取失败${event.readError ? `：${event.readError}` : ""}`
  return "字段读取结果不可用"
}

function queryOutcomeText(event: AuthoringProgressEvent) {
  if (event.queryOutcome === "matched") return `匹配 ${event.matchCount} 个`
  if (event.queryOutcome === "no_match") return "匹配 0 个"
  if (event.queryOutcome === "invalid_selector") return "selector 无效"
  if (event.queryOutcome === "error") return "查询失败"
  return "结果不可用"
}
