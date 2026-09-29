import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Theme } from "@radix-ui/themes"
import type { StableChainNodeV2, TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { buildPreparationGraph } from "../src/ChainCanvasGraph.js"
import { ChainInspector } from "../src/ChainInspector.js"
import { LiveChain } from "../src/LiveChain.js"
import type { TaskChainConnection } from "../src/taskChainConnection.js"

const node = { id: "s-a-0001", label: "读取列表", kind: "capability",
  capability: { name: "browser.read-fields", version: 2 }, config: {}, input: {}, effect: "read", timeoutMs: 1000,
  outputContract: { id: "read", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }, writes: [],
} as StableChainNodeV2
const build: NonNullable<NonNullable<TaskWorkspaceSnapshot["activity"]>["build"]> = {
  stepId: "read", sequence: 1, digest: "a".repeat(64), phase: "prefix", nodes: [node], edges: [] }

test("失败生成片段不能遮住已发布链路，正在生成时仍阻止运行", () => {
  for (const status of ["failed", "interrupted", "running"] as const) {
    for (const snapshot of [build, undefined]) {
    const view = { workspace: { activity: { id: "prepare", status, phase: "compiling", sequence: 1, build: snapshot },
      draft: null, release: { reference: { id: "release", version: 1, digest: "b".repeat(64) },
        value: { content: { plan: { steps: [] }, steps: [] } } }, execution: null }, busy: false, error: null }
    const connection = { snapshot: () => view, subscribe: () => () => {} } as unknown as TaskChainConnection
    const html = renderToStaticMarkup(createElement(Theme, null, createElement(LiveChain, {
      connection, active: false, theme: "light", onInterview() {}, async onRequirementRevision() {} })))
    const run = html.match(/<button[^>]*>[^<]*<svg[\s\S]*?<\/svg>运行<\/button>/)?.[0]
    assert.ok(run, "正式发布的运行入口仍存在")
    if (status === "running") { assert.match(run, /disabled/); if (snapshot) assert.match(html, /生成片段/) }
    else { assert.doesNotMatch(run, /disabled/); assert.doesNotMatch(html, /生成片段/); assert.match(html, /已发布 V1/) }
    }
  }
})

test("生成画布只投影真实节点/边，稳定身份不随批次改变，不生成成功路径", () => {
  const selected: string[] = [], before = structuredClone(build)
  const first = buildPreparationGraph(build, id => selected.push(id))
  const second = buildPreparationGraph({ ...build, sequence: 2, nodes: [
    { ...node, label: "读取已确认列表" }, { ...node, id: "s-a-0003" }], edges: [] }, id => selected.push(id))
  assert.equal(first.nodes[0]!.id, second.nodes[0]!.id)
  assert.deepEqual(second.edges, [])
  assert.equal(second.nodes.every(item => item.type === "chain-action" && item.data.tone === "idle"), true)
  second.nodes[0]!.data.onInspect(second.nodes[0]!.id)
  assert.deepEqual(selected, [node.id])
  assert.deepEqual(build, before)
})

test("生成节点复用只读检查器，不显示虚假运行成功或末尾完成", () => {
  const html = renderToStaticMarkup(createElement(ChainInspector, { chain: build, stage: null,
    node, batch: null, preparing: true, onClose() {} }))
  assert.match(html, /读取列表/)
  assert.match(html, /尚未生成/)
  assert.doesNotMatch(html, /本次运行|已完成|已发布/)
  assert.match(html, /<details><summary>高级信息<\/summary>/)
})

test("尚无正式草稿的生成片段仍提供原人工处理和失败入口，不显示运行操作", () => {
  for (const status of ["waiting_for_human", "failed"] as const) {
    const view = { workspace: { activity: { id: "prepare", status, phase: "preexecuting", sequence: 1, build,
      waitpoint: { status: "waiting" } }, draft: null, release: null, execution: null }, busy: false, error: null }
    const connection = { snapshot: () => view, subscribe: () => () => {} } as unknown as TaskChainConnection
    const html = renderToStaticMarkup(createElement(Theme, null,
      createElement(LiveChain, { connection, active: false, theme: "light",
        onInterview() {}, async onRequirementRevision() {} })))
    assert.match(html, /生成片段/)
    assert.match(html, status === "waiting_for_human" ? /处理人工请求/ : /查看原因与继续操作/)
    assert.doesNotMatch(html, />运行<|>发布<|本次运行/)
  }
})
