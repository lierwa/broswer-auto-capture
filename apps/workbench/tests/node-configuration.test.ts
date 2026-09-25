import assert from "node:assert/strict"
import test from "node:test"
import type { ChainNode, TaskChain, TaskDataContract, ValueSchema } from "@browser-capture/contracts"
import { bindingChoices, outputConsumers, replaceInputs } from "../src/nodeConfigurationModel.js"

const contract = (schema: ValueSchema): TaskDataContract => ({ id: "example-output", version: 1, dialect: "bat-value-schema/v1", schema })
const upstream: ChainNode = { id: "internal-read", kind: "function", label: "读取候选项", inputs: {}, source: "return []", language: "javascript",
  timeoutMs: 1000, outputContract: contract({ type: "array", items: { type: "string" } }), writes: [] }
const selection: ChainNode = { ...upstream, id: "internal-select", label: "选择目标", inputs: {
  rows: { source: "node", nodeId: upstream.id, path: [] }, keyword: { source: "constant", value: "原输入" } },
  outputContract: contract({ type: "object", properties: { index: { type: "integer" } }, required: ["index"], additionalProperties: false }) }
const action: ChainNode = { id: "internal-click", label: "点击目标", kind: "capability", capability: { name: "browser.action", version: 1 },
  input: { index: { source: "node", nodeId: selection.id, path: ["index"] } }, config: { actionName: "click", target: { strategy: "css", value: "button" } },
  effect: "idempotent_write", timeoutMs: 1000, outputContract: contract({ type: "null" }), writes: [] }
const chain = { inputContract: contract({ type: "object", properties: {}, required: [], additionalProperties: false }),
  nodes: [upstream, selection, action], edges: [{ from: upstream.id, port: "success", to: selection.id },
    { from: selection.id, port: "success", to: action.id }] } as TaskChain

test("输入选择只能引用真实上游输出，不把空任务合同伪装成可替换参数", () => {
  const choices = bindingChoices(chain, selection)
  assert.equal(choices.some((item) => item.binding.source === "input"), false)
  assert.deepEqual(choices.map((item) => item.label), ["读取候选项 · 全部输出"])
  assert.equal(choices.some((item) => item.binding.source === "node" && item.binding.nodeId === action.id), false)
  const parameterized = { ...chain, inputContract: contract({ type: "object", properties: { query: { type: "string" } },
    required: ["query"], additionalProperties: false }) }
  assert.deepEqual(bindingChoices(parameterized, selection)[0]?.binding, { source: "input", path: ["query"] })
})

test("编辑能力输入时保留名称和动作配置，并保持函数输入在同一完整节点中", () => {
  const renamed = { ...action, label: "打开选中的项目" }
  const revised = replaceInputs(renamed, { index: { source: "constant", value: 2 } })
  assert.equal(revised.label, renamed.label)
  assert.deepEqual(revised.kind === "capability" && revised.config, action.config)
  assert.deepEqual(revised.kind === "capability" && revised.input, { index: { source: "constant", value: 2 } })
  const next = replaceInputs(selection, { ...selection.inputs, keyword: { source: "constant", value: "新输入" } })
  assert.deepEqual(next.kind === "function" && next.inputs.keyword, { source: "constant", value: "新输入" })
  assert.deepEqual(outputConsumers(chain, selection), ["点击目标"])
})
