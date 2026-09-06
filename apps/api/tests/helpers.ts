import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import type { CodexAppServerClient, CodexRunEvent } from "@browser-capture/model-runtime"
import { ProductStore } from "../src/database/store.js"
import { InterviewCoordinator } from "../src/interview/coordinator.js"

export const question = { prompt: "希望收集多少评价？", options: [{ label: "前 20 条", description: "范围较小", recommended: true }, { label: "前 100 条", description: "覆盖更多", recommended: false }] }
export const brief = {
  goal: "收集商品与评价", scope: "任务指定的商品范围",
  sourceStrategy: { mode: "discover" as const, scope: "系统查找并核验正式来源", providedUrls: [] },
  deliverables: [{ entity: "商品", fields: ["商品链接", "参数", "评价"], coverage: "目标范围全部商品", limit: "每商品前20条评价，不足记录实际数量" }],
  discoveryTasks: [{ objective: "查找目标入口及商品枚举依据", expectedOutput: "候选入口与商品链接集合", acceptance: "核验来源归属、分类与枚举覆盖" }],
  completionCriteria: ["每条结果保留来源链接，报告覆盖和缺口"], constraints: ["登录、验证码转人工"], proposedDefaults: [],
}
export const draft = { title: "商品与评价", brief }
export const audit = { invocationCount: 1, requestedModel: "gpt-5.6-terra", requestedEffort: "medium", reportedModel: "gpt-5.6-terra", reportedEffort: "medium" } as const
export const succeeded = (output: unknown): CodexRunEvent => ({ type: "turn_succeeded", outputText: JSON.stringify(output), threadId: "test-thread", turnId: "test-turn", audit })
export function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done }); return { promise, resolve } }
export async function fixture(run: (value: Awaited<ReturnType<typeof openFixture>>) => Promise<void>) {
  const value = await openFixture()
  try { await run(value) }
  finally { value.unblock(); await value.coordinator.close(); await value.store.close(); await rm(value.directory, { recursive: true, force: true }) }
}
export async function openFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-api-test-"))
  const store = await ProductStore.open(directory)
  const prompts: string[] = [], gates: Array<ReturnType<typeof deferred>> = []
  const unblock = () => { for (const gate of gates) gate.resolve() }
  const client: CodexAppServerClient = { readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => { unblock() },
    async *runTurn(prompt) { prompts.push(prompt); yield succeeded({ assistantText: "范围已整理。", question: null, draft }) },
  }
  const coordinator = new InterviewCoordinator(store, async () => ({ client, dispose: () => client.close() }))
  const create = () => coordinator.taskAction({ type: "create", requestId: randomUUID() })
  const send = (id: string, text = "收集商品和评价") => coordinator.dispatch(id, { type: "message", requestId: randomUUID(), text, expectedRevision: store.snapshot(id).revision })
  return { store, coordinator, directory, client, prompts, create, send, unblock, gate: () => { const value = deferred(); gates.push(value); return value } }
}
