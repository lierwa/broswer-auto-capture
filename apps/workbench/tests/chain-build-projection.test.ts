import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Theme } from "@radix-ui/themes"
import type { StableChainNodeV2, TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { buildPreparationGraph } from "../src/ChainCanvasGraph.js"
import type { StageCanvasNode } from "../src/ChainCanvasNodes.js"
import { ChainInspector } from "../src/ChainInspector.js"
import { LiveChain } from "../src/LiveChain.js"
import type { TaskChainConnection } from "../src/taskChainConnection.js"
import { canvasGenerationFor } from "../src/useLiveChain.js"

const node = { id: "s-a-0001", label: "读取列表", kind: "capability",
  capability: { name: "browser.read-fields", version: 2 }, config: {}, input: {}, effect: "read", timeoutMs: 1000,
  outputContract: { id: "read", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }, writes: [],
} as StableChainNodeV2
const build: NonNullable<NonNullable<TaskWorkspaceSnapshot["activity"]>["build"]> = {
  stepId: "read", sequence: 1, digest: "a".repeat(64), phase: "prefix", nodes: [node], edges: [],
  presentation: { stages: [{ id: "stage-s-a-0001", title: "读取列表", summary: "读取列表",
    nodeIds: [node.id], entryNodeId: node.id, exits: [] }],
    overviewLayout: [{ stageId: "stage-s-a-0001", x: 137, y: 91 }],
    focusLayouts: [{ stageId: "stage-s-a-0001", nodes: [{ nodeId: node.id, x: 0, y: 0 }] }] } }

test("新准备首次载入重置视口，后续快照、final 和运行沿用同批画布身份", () => {
  const published = { taskId: "task", authoringJobId: null }
  const preparing = canvasGenerationFor(published, "task", "job-1")
  assert.notDeepEqual(preparing, published)
  assert.equal(canvasGenerationFor(preparing, "task", "job-1"), preparing)
  assert.equal(canvasGenerationFor(preparing, "task"), preparing)
  assert.notDeepEqual(canvasGenerationFor(preparing, "task", "job-2"), preparing)
  assert.deepEqual(canvasGenerationFor(preparing, "another-task"), {
    taskId: "another-task", authoringJobId: null,
  })
})

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

test("生成画布从首个 build 起只把阶段父节点交给 React Flow", () => {
  const selected: string[] = [], before = structuredClone(build)
  const first = buildPreparationGraph(build, id => selected.push(id))
  const nextNode = { ...node, id: "s-a-0003", label: "打开读取到的候选" }
  const second = buildPreparationGraph({ ...build, sequence: 2, nodes: [
    { ...node, label: "读取已确认列表" }, nextNode], edges: [{ from: node.id, port: "success", to: nextNode.id }],
    presentation: { stages: [{ ...build.presentation.stages[0]!, nodeIds: [node.id, nextNode.id],
      exits: [] }], overviewLayout: build.presentation.overviewLayout,
      focusLayouts: [{ stageId: "stage-s-a-0001", nodes: [
        { nodeId: node.id, x: 0, y: 0 }, { nodeId: nextNode.id, x: 0, y: 34 }] }] } }, id => selected.push(id))
  assert.equal(first.nodes[0]!.id, second.nodes[0]!.id)
  assert.deepEqual(first.nodes[0]!.position, second.nodes[0]!.position)
  assert.deepEqual(second.nodes[0]!.position, { x: 137, y: 91 })
  assert.equal(second.nodes.length, 1)
  assert.equal(second.nodes.every(item => item.type === "chain-stage" && item.data.tone === "idle"), true)
  assert.equal(second.nodes.some(item => item.type === "chain-action"), false)
  assert.deepEqual(second.edges, [])
  const stage = second.nodes[0] as StageCanvasNode
  assert.deepEqual(stage.data.actions.map((item) => item.id), [node.id, nextNode.id])
  stage.data.onInspect(nextNode.id)
  assert.deepEqual(selected, [nextNode.id])
  assert.deepEqual(build, before)
})

test("prefix 只保留阶段父节点与阶段间真实边，不生成开始或结束节点", () => {
  const nextNode = { ...node, id: "s-a-0003", label: "打开读取到的候选" }
  const graph = buildPreparationGraph({ ...build, nodes: [node, nextNode],
    edges: [{ from: node.id, port: "success", to: nextNode.id }],
    presentation: { stages: [build.presentation.stages[0]!, {
      id: "stage-s-a-0003", title: "打开候选", summary: "打开读取到的候选", nodeIds: [nextNode.id],
      entryNodeId: nextNode.id, exits: [],
    }], overviewLayout: [...build.presentation.overviewLayout, { stageId: "stage-s-a-0003", x: 509, y: 227 }],
    focusLayouts: [...build.presentation.focusLayouts, {
      stageId: "stage-s-a-0003", nodes: [{ nodeId: nextNode.id, x: 0, y: 0 }],
    }] } }, () => {})
  assert.deepEqual(graph.nodes.map((item) => item.id), ["stage-s-a-0001", "stage-s-a-0003"])
  assert.deepEqual(graph.nodes.map((item) => item.position), [{ x: 137, y: 91 }, { x: 509, y: 227 }])
  assert.deepEqual(graph.edges.map((item) => [item.source, item.target]), [["stage-s-a-0001", "stage-s-a-0003"]])
  assert.equal(graph.nodes.some((item) => item.id.startsWith("__")), false)
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
