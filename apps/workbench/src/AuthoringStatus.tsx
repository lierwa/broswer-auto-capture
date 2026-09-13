import { Badge, Button } from "@radix-ui/themes"
import type { TaskAuthoringJob, TaskChain } from "@browser-capture/contracts"
import { authoringLevel } from "./taskChainProjection.js"

export function AuthoringStatus({ jobs, chains, onCancel }: { jobs: TaskAuthoringJob[]; chains: TaskChain[]; onCancel(id: string): void }) {
  return <div aria-label="探索与编译进度">{jobs.slice(-5).map((job) => <article key={job.id}>
    <Badge>{authoringLevel(job, chains)}</Badge>
    {["queued", "running", "waiting_for_human"].includes(job.status) && <Button size="1" variant="soft" onClick={() => onCancel(job.id)}>停止生成</Button>}
    {job.status === "waiting_for_human" && job.waitpoint && <p role="status">{job.waitpoint.prompt}</p>}
    {job.authoring && <p>探索会话 {job.authoring.consumption.explorationSessions} · 工具调用 {job.authoring.consumption.explorationToolCalls} · 编译调用 {job.authoring.consumption.compilationCalls}</p>}
    {job.reason && <p role="status">{job.authoring?.failureLayer ? `${job.authoring.failureLayer}：` : ""}{job.reason}</p>}
    {job.authoring?.exploration && <details><summary>业务结果与来源证据</summary><pre className="chain-json">{JSON.stringify(job.authoring.exploration, null, 2)}</pre></details>}
  </article>)}</div>
}
