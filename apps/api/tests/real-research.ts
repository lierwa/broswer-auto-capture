import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { createApplication } from "../src/app.js"

if (!process.argv.includes("--real")) throw new Error("真实验收需要 --real")
const root = fileURLToPath(new URL("../../..", import.meta.url)), directory = path.join(root, "work", `f3-real-${Date.now()}`)
await mkdir(directory, { recursive: true })
const { app, coordinator, research, browser } = await createApplication({ root, directory })
const headers = { host: "127.0.0.1:4178" }
async function post(url: string, payload: Record<string, unknown>) {
  const response = await app.inject({ method: "POST", url, headers, payload })
  assert.ok(response.statusCode < 300, response.body); return response.json()
}
try {
  const { id } = await post("/api/tasks", { type: "create", requestId: randomUUID() })
  await post(`/api/interview?taskId=${id}`, { type: "message", requestId: randomUUID(), expectedRevision: 0,
    text: "我要海尔中国官网冰箱产品的名称、型号与商品链接，范围以官网冰箱目录为准，页面默认排序，找不到字段留空并说明，不需要价格、评论或购买。系统负责发现官网入口、目录及代表详情，不用我给链接。请直接整理可确认需求，后续先做代表页面调研；完整枚举和采集留到正式计划。" })
  await coordinator.waitForIdle()
  const state = coordinator.snapshot(id), draft = state.drafts.at(-1)
  assert.ok(draft?.brief, "真实访谈尚未形成结构草稿")
  await post(`/api/interview?taskId=${id}`, { type: "confirm", requestId: randomUUID(), expectedRevision: state.revision, version: draft.version })
  await post(`/api/research?taskId=${id}`, { type: "start", requestId: randomUUID(), requirementVersion: draft.version })
  process.stdout.write(`${JSON.stringify({ directory, taskId: id, phase: "research_started" })}\n`)
  let sequence = -1
  while (research.isActive(id)) {
    const record = research.snapshot(id).records[0]!
    if (record.sequence !== sequence) { sequence = record.sequence; process.stdout.write(`${JSON.stringify({ status: record.status, current: record.current, observations: record.observations.length, calls: record.audits.length })}\n`) }
    await delay(1000)
  }
  const result = { research: research.snapshot(id), browser: await browser.snapshot(id), requirement: draft.brief, interviewAudits: state.audits }
  await writeFile(path.join(directory, "acceptance.json"), JSON.stringify(result, null, 2))
  const record = result.research.records[0]!
  process.stdout.write(`${JSON.stringify({ directory, taskId: id, status: record.status, observations: record.observations.length, candidates: record.candidates.length, gaps: record.gaps, audit: record.audits })}\n`)
  assert.ok(record.queries.length > 0)
  assert.ok(record.observations.some((item) => item.candidateId), "没有完成代表来源观察")
  assert.ok(["partial", "completed"].includes(record.status), "调研未完成")
  assert.equal(result.browser.cleanupRequired, false)
} finally { await app.close() }
