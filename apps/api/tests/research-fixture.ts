import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import assert from "node:assert/strict"
import { createApplication } from "../src/app.js"
import { succeeded, brief } from "./helpers.js"
import type { ResearchDecision, ResearchRecord } from "@browser-capture/contracts/research"
import type { CodexAppServerClient } from "@browser-capture/model-runtime"

export const sourceBrief = { ...brief, goal: "核验样例机构公开目录", scope: "样例机构目录与名称", deliverables: [{ entity: "目录", fields: ["名称"], coverage: "目录内全部条目", limit: "按目录终止" }],
  discoveryTasks: [{ objective: "发现目录", expectedOutput: "目录与详情链接", acceptance: "实际页面可见" }],
}
export const headers = { host: "127.0.0.1:4175" }
export function decisionFor(prompt: string): ResearchDecision {
  const { record, current } = JSON.parse(prompt.split("\n\n").at(-1)!) as { record: ResearchRecord; current: { id: string; text: string } | null }
  const result: ResearchDecision = { action: "search", query: "样例机构公开目录", candidateId: null, reason: "寻找机构目录入口", assessment: null, gaps: [], coverage: [] }
  if (!current) return result
  result.assessment = { observationId: current.id, adopted: false, access: "normal", reason: "搜索页提供候选", fields: [], enumeration: null, limitations: [] }
  const observation = record.observations.find((item) => item.id === current.id)!
  if (observation.queryId) return { ...result, action: "visit", query: null, candidateId: record.candidates.find((item) => item.url === "https://example.com/catalog")!.id }
  const evidence = current.text.match(/\[(E\d+)\] 名称/)![1]!
  result.assessment = { ...result.assessment, adopted: true, reason: "目录归属与入口可见", fields: [{ name: "名称", evidence }], enumeration: { name: "目录下一页", evidence } }
  return { ...result, action: "finish", query: null, reason: "已观察到规划所需目录和字段", coverage: ["目录", "发现目录"].map((objective) => ({ objective, observationIds: [current.id], reason: "真实目录包含名称和下一页" })) }
}
export async function researchFixture(serveUi = false) {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-research-test-"))
  const fake = { url: "about:blank", restricted: false, failure: false, badStop: false, calls: [] as string[][], modelCalls: 0, closeCalls: 0,
    decide: async (prompt: string) => decisionFor(prompt), close: () => {} }
  const client: CodexAppServerClient = { readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => { fake.closeCalls++; fake.close() },
    async *runTurn(prompt) { fake.modelCalls++; yield succeeded(await fake.decide(prompt)) } }
  const options = { root: fileURLToPath(new URL("../../..", import.meta.url)), directory, serveUi,
    modelFactory: async () => ({ client: { ...client, async *runTurn() { yield succeeded({ assistantText: "已整理", question: null, draft: { title: "目录调研", brief: sourceBrief } }) } }, dispose: async () => {} }),
    researchFactory: async () => ({ client, dispose: () => client.close() }),
    browserExecutor: async (args: readonly string[]) => {
      fake.calls.push([...args])
      if (fake.failure && args[1] === "navigate") return { exitCode: 1, stdout: "{}" }
      const search = fake.url.startsWith("https://www.bing.com")
      let value: unknown = { tab_id: 1 }
      if (args[1] === "session") value = args[2] === "start" ? { session_id: "abcd" } : { stopped: fake.badStop ? [] : ["abcd"], failed: fake.badStop ? [1] : [], return_failures: [] }
      if (args[1] === "navigate") fake.url = args[2]!
      if (args[1] === "tab") value = { tabs: [{ tab_id: 1, url: fake.url, active: true, scope: "agent" }] }
      if (args[1] === "observe") value = { tab_id: 1, truncated: false, text: fake.restricted && !search ? "请先登录 private-sensitive-data" : search ? "搜索结果 样例机构目录" : '名称 样例目录 @e1 link "下一页"' }
      if (args[1] === "evaluate") value = { ok: true, tab_id: 1, value: { url: fake.url, title: search ? "搜索结果" : "样例目录", links: search ? [{ title: "样例机构目录", url: "https://example.com/catalog" }] : [] } }
      return { exitCode: 0, stdout: JSON.stringify(value) }
    },
  }
  let current = await createApplication(options)
  const create = async (confirm = true) => {
    const response = await current.app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "create", requestId: randomUUID() } })
    const id = response.json().id as string
    if (!confirm) return id
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: { type: "message", requestId: randomUUID(), expectedRevision: 0, text: "核验样例机构目录，无入口链接，系统负责发现。" } })
    await current.coordinator.waitForIdle()
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: { type: "confirm", requestId: randomUUID(), expectedRevision: 1, version: 1 } })
    return id
  }
  const post = (id: string, payload: Record<string, unknown>) => current.app.inject({ method: "POST", url: `/api/research?taskId=${id}`, headers, payload })
  const start = (id: string, requestId = randomUUID()) => post(id, { type: "start", requestId, requirementVersion: 1 })
  const wait = async (id: string) => {
    for (let i = 0; i < 400; i++) { if (!current.research.isActive(id)) return current.research.snapshot(id).records[0]!; await delay(10) }
    assert.fail("research did not settle")
  }
  return { get current() { return current }, directory, fake, create, post, start, wait,
    reopen: async () => { await current.app.close(); current = await createApplication(options) },
    close: async () => { fake.close(); await current.app.close(); await rm(directory, { recursive: true, force: true }) },
  }
}
export async function withResearch(work: (value: Awaited<ReturnType<typeof researchFixture>>) => Promise<void>) {
  const value = await researchFixture()
  try { await work(value) } finally { await value.close() }
}
