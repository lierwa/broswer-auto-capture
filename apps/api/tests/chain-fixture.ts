import { setTimeout as delay } from "node:timers/promises"
import assert from "node:assert/strict"
import type { ActionGraph, ExplorationDecision } from "@browser-capture/contracts/chain"
import type { PlanProposal } from "@browser-capture/contracts/plan"
import { planFixture } from "./plan-fixture.js"
import { succeeded } from "./helpers.js"

export function graphFor(kind: "enumerate" | "collect"): ActionGraph {
  return { entry: "open", coverage: "已观察的目录和详情输入", completion: "完成当前输入并得到来源记录", maxTransitions: 10, nodes: [
    { id: "open", label: "打开输入", kind: "navigate", url: "$input.url", next: "read" },
    { id: "read", label: "读取当前页", kind: "read", next: "extract" },
    kind === "enumerate" ? { id: "extract", label: "提取详情链接", kind: "extract_links", next: "save", pathPrefix: "/item/", pathSuffix: "", titleContains: "" }
      : { id: "extract", label: "提取名称", kind: "extract_fields", next: "save", fields: [{ name: "名称", source: "title", contains: "", after: "", before: "", required: true }] },
    { id: "save", label: "检查点", kind: "checkpoint", next: "finish" },
    { id: "finish", label: "输入完成", kind: "finish", minRecords: 1, reason: "当前输入已产生非空来源记录" },
  ] }
}
export function chainDecision(prompt: string): ExplorationDecision {
  const { step } = JSON.parse(prompt.split("\n\n").at(-1)!) as { step: PlanProposal["steps"][number] }
  return { action: "compile", reason: "依照实际观察编译", command: null, graph: graphFor(step.kind === "enumerate" ? "enumerate" : "collect"),
    sample: { url: step.kind === "enumerate" ? "https://example.com/catalog" : "https://example.com/item/one", value: "" },
    verification: { url: step.kind === "enumerate" ? "https://example.com/catalog?page=2" : "https://example.com/item/two", value: "" } }
}
export async function chainFixture(serveUi = false) {
  const fake = { calls: 0, llmCalls: 0, decide: async (prompt: string): Promise<unknown> => chainDecision(prompt), closed: 0 }
  const fixture = await planFixture(serveUi, (input) => fixture.current.chain.execute(input), { explorationFactory: async () => ({
    client: { readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => { fake.closed++ }, async *runTurn(prompt) {
      fake.calls++; const event = succeeded(await fake.decide(prompt)); if (event.type !== "turn_succeeded") throw new Error("fixture event"); yield { ...event, audit: { ...event.audit, requestedModel: "gpt-5.6-sol" as const, requestedEffort: "high" as const, reportedModel: "gpt-5.6-sol" as const, reportedEffort: "high" as const } }
    } }, dispose: async () => { fake.closed++ },
  }), llmFactory: async () => ({ client: { readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => {}, async *runTurn() {
    fake.llmCalls++; const event = succeeded({ value: "说明" }); if (event.type !== "turn_succeeded") throw new Error("fixture event")
    yield { ...event, audit: { ...event.audit, requestedModel: "gpt-5.6-luna" as const, reportedModel: "gpt-5.6-luna" as const } }
  } }, dispose: async () => {} }) })
  const ready = async () => {
    const id = await fixture.ready(); await fixture.generate(id); await fixture.waitPlan(id)
    fixture.fake.links = [{ title: "下一页", url: "https://example.com/catalog?page=2" }, { title: "条目一", url: "https://example.com/item/one" }, { title: "条目二", url: "https://example.com/item/two" }]
    fixture.fake.linksForUrl = (url) => url.includes("page=2") ? fixture.fake.links.filter((link) => link.url.endsWith("/two")) : fixture.fake.links
    return id
  }
  const wait = async (id: string) => {
    for (let i = 0; i < 1000; i++) {
      const state = fixture.current.plan.snapshot(id), execution = state.executions.at(-1)!
      if (!["running", "queued"].includes(execution.status)) return { execution, chains: fixture.current.chain.snapshot(id, state) }
      await delay(10)
    }
    assert.fail("chain did not settle")
  }
  return { ...fixture, get current() { return fixture.current }, chainFake: fake, readyChain: ready, waitChain: wait }
}
