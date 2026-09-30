import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { ChainNode, StableChainNodeV2 } from "@browser-capture/contracts"
import { ChainInspector } from "../src/ChainInspector.js"
import { ChainStartContext } from "../src/ChainBoundaryContext.js"
import type { LiveChainModel } from "../src/useLiveChain.js"
import { inspectorNode as node } from "./fixtures/inspector-node.js"

test("开始详情保留实际null输入，前置失败展示权威原因", () => {
  const base = { chain: { ...node, name: "读取", entry: node.id, nodes: [node], reuseBoundary: { assumptions: [] } },
    plan: { requirement: { version: 2 }, steps: [] }, calls: [], requirement: null, view: {},
    selectedRunId: null, closeContext() {}, setSelectedRunId() {} } as unknown as LiveChainModel
  const actualNull = renderToStaticMarkup(createElement(ChainStartContext, { model: { ...base,
    selectedCall: { run: { input: null } } } as unknown as LiveChainModel, onRequirementView() {} }))
  assert.match(actualNull, /空值（null）/)
  assert.doesNotMatch(actualNull, /没有传入额外参数/)
  const failed = renderToStaticMarkup(createElement(ChainStartContext, { model: { ...base, selectedCall: null,
    selectedExecution: { status: "failed", result: null },
    detail: { execution: { status: "failed", cleanupResume: null, reason: "连接失败的实际原因", result: null } } } as unknown as LiveChainModel,
  onRequirementView() {} }))
  assert.match(failed.split("<details")[0]!, /连接失败的实际原因/)
})

test("读取与后置要求在普通详情显示版本事实，子链调用保留版本和失败策略", () => {
  const read = { ...node, config: { specification: { requireComplete: true, maxItems: 9,
    fields: { title: { valueType: "string" } } }, requiredPaths: [[0, "title"]] } } satisfies StableChainNodeV2
  const action = { ...node, id: "click", capability: { name: "browser.workflow-step", version: 2 },
    config: { postconditions: [{ kind: "read_fields", ready: true, consumerRef: read.id,
      read: read.config.specification, requiredPaths: [[0, "title"]] }] } } satisfies StableChainNodeV2
  const invoke = { id: "child", kind: "invoke", label: "调用已有链", chain: { id: "child", version: 7, digest: "a".repeat(64) },
    input: { source: "input", path: [] }, iteration: { mode: "each", collection: { source: "input", path: [] },
      itemVariable: "item", stableKeyPath: ["id"], maxItems: 13, onItemFailure: "pause" } } as ChainNode
  for (const selected of [read, action, invoke]) {
    const html = renderToStaticMarkup(createElement(ChainInspector, { chain: { nodes: [read, action, invoke], edges: [] },
      stage: null, node: selected, batch: null, onClose() {} })).split("<details")[0]!
    if (selected.kind === "invoke") assert.match(html, /版本 7；逐项调用.*最多 13 项；单项失败时暂停/)
    else {
      assert.match(html, /必须完整读取/)
      assert.match(html, /title（string）/)
      assert.match(html, /0 › title/)
      if (selected.id === action.id) assert.match(html, /后续读取：读取当前记录/)
    }
  }
})
