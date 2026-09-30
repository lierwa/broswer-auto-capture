import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type {
  ChainNode, StableChainNodeV2, TaskDataContract, TaskExecutionEvent, TaskExecutionEventBatch, TaskExecutionResult,
} from "@browser-capture/contracts"
import { ChainInspector } from "../src/ChainInspector.js"
import { ChainNodeExecution } from "../src/ChainNodeExecution.js"
import { ExecutionResultView } from "../src/ExecutionPresentation.js"

const node = {
  id: "read",
  label: "读取当前记录",
  kind: "capability",
  capability: { name: "browser.read-fields", version: 2 },
  input: {},
  config: {},
  effect: "read",
  timeoutMs: 1_000,
  outputContract: {
    id: "read-output",
    version: 1,
    dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: {}, required: [], additionalProperties: true },
  },
  writes: [],
} satisfies StableChainNodeV2

test("each跳过重复键后的祖先游标展示集合位置，不冒充第几轮", () => {
  const owner = { id: "repeat", label: "处理输入", kind: "loop", iteration: { mode: "each" } } as ChainNode
  const event = { sequence: 1, runId: "run", event: { nodeId: node.id, status: "started", invocationId: "call",
    execution: { loops: [{ nodeId: owner.id, index: 2, stableKey: "second-unique-key" }] } } } as TaskExecutionEvent
  const html = renderToStaticMarkup(createElement(ChainNodeExecution, { event, batch: null, nodes: [owner] }))
  assert.match(html, /集合位置第 3 项/)
  assert.doesNotMatch(html, /第 3 轮/)
})

test("完成节点没有持久化输出时明确显示未记录", () => {
  const batch = {
    executionId: "00000000-0000-4000-8000-000000000001",
    executionSequence: 2,
    status: "completed",
    after: 0,
    next: 2,
    events: [{
      executionId: "00000000-0000-4000-8000-000000000001",
      sequence: 2,
      stepId: "perform",
      runId: "00000000-0000-4000-8000-000000000002",
      runSequence: 2,
      stepTitle: "读取记录",
      nodeTitle: "读取当前记录",
      event: {
        sequence: 2,
        at: "2026-09-29T01:00:01.000Z",
        invocationId: "00000000-0000-4000-8000-000000000003",
        nodeId: node.id,
        status: "finished",
        outcome: "success",
        idempotencyKey: "read:1",
        stableKey: null,
      },
    }],
  } satisfies TaskExecutionEventBatch

  const html = renderToStaticMarkup(createElement(ChainInspector, {
    chain: { nodes: [node], edges: [] },
    stage: null,
    node,
    batch,
    onClose() {},
  }))

  assert.match(html, /本次节点输出未记录/)
})

test("动作详情首屏显示目标、输入来源和真实出口，耗时仅在画布", () => {
  const click = {
    ...node,
    id: "click",
    label: "点击读取到的候选",
    capability: { name: "browser.workflow-step", version: 2 },
    input: { targetOrdinal: { source: "node", nodeId: node.id, path: [0, "ordinal"] } },
    config: {
      actionName: "click",
      target: { items: { kind: "css", value: "button[aria-label=\"目标按钮\"]" } },
    },
  } satisfies StableChainNodeV2
  const terminal = {
    ...node,
    id: "done",
    label: "完成",
    kind: "terminal",
    status: "completed",
    reason: "链路完成",
    evidence: [{ source: "node", nodeId: click.id, path: [] }],
  } satisfies StableChainNodeV2
  const invocationId = "00000000-0000-4000-8000-000000000013"
  const event = (sequence: number, status: "started" | "finished", at: string, outcome: string | null) => ({
    executionId: "00000000-0000-4000-8000-000000000011",
    sequence,
    stepId: "perform",
    runId: "00000000-0000-4000-8000-000000000012",
    runSequence: 2,
    stepTitle: "执行动作",
    nodeTitle: click.label,
    event: { sequence, at, invocationId, nodeId: click.id, status, outcome,
      idempotencyKey: `click:${sequence}`, stableKey: null },
  })
  const batch = {
    executionId: "00000000-0000-4000-8000-000000000011",
    executionSequence: 2,
    status: "completed",
    after: 0,
    next: 2,
    events: [event(1, "started", "2026-09-29T01:00:00.000Z", null),
      event(2, "finished", "2026-09-29T01:00:01.500Z", "success")],
  } satisfies TaskExecutionEventBatch

  const html = renderToStaticMarkup(createElement(ChainInspector, {
    chain: { nodes: [node, click, terminal], edges: [{ from: click.id, port: "success", to: terminal.id }] },
    stage: null,
    node: click,
    batch,
    onClose() {},
  }))
  const firstScreen = html.split("<details")[0]!

  assert.match(firstScreen, /<dt>动作<\/dt><dd>点击目标<\/dd>/)
  assert.match(firstScreen, /<dt>目标<\/dt><dd>目标按钮<\/dd>/)
  assert.match(firstScreen, /前一节点：读取当前记录/)
  assert.match(firstScreen, /<h4>下一步<\/h4><p>成功 → 完成<\/p>/)
  assert.doesNotMatch(html, /<dt>耗时<\/dt>/)
  assert.doesNotMatch(firstScreen, /outputContract|config|prompt|返回要求|本次执行身份|事件序号/)
})

test("Function 类型按绑定路径推导，实参以可读内容展示，内部信息折叠", () => {
  const calculate = { id: "calculate", label: "生成摘要", kind: "function", language: "javascript",
    source: "return { title, ordinal, ready };", inputs: {
      title: { source: "input", path: ["records", 0, "title"] },
      ordinal: { source: "node", nodeId: node.id, path: ["ordinal"] },
      ready: { source: "variable", name: "ready", path: [] },
      absent: { source: "input", path: ["not-declared"] },
    }, outputContract: node.outputContract, writes: [], timeoutMs: 1000 } satisfies StableChainNodeV2
  const contract = (schema: TaskDataContract["schema"]) => ({ ...node.outputContract, schema })
  const read = { ...node, outputContract: contract({ type: "object", properties: { ordinal: { type: "integer" } },
    required: ["ordinal"], additionalProperties: false }) }
  const executionId = "00000000-0000-4000-8000-000000000031"
  const stored = { executionId, sequence: 2, stepId: "step", runId: executionId, runSequence: 2, event: {
    sequence: 2, at: "2026-09-30T01:00:00.000Z", invocationId: executionId, nodeId: calculate.id,
    status: "finished" as const, outcome: "success", idempotencyKey: "calculate", stableKey: null,
    execution: { input: { status: "recorded" as const, value: { title: "内容标题", ordinal: 0, ready: false, absent: null } },
      output: { status: "recorded" as const, value: { title: "内容标题", ordinal: 0, ready: false } } } } }
  const batch = { executionId, executionSequence: 2, status: "completed" as const, after: 0, next: 2, events: [stored] }
  const html = renderToStaticMarkup(createElement(ChainInspector, { chain: { nodes: [read, calculate], edges: [],
    inputContract: contract({ type: "object", properties: { records: { type: "array", items: { type: "object",
      properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } } },
    required: ["records"], additionalProperties: false }), variables: { ready: contract({ type: "boolean" }) } },
    node: calculate, stage: null, batch, onClose() {} }))
  const firstScreen = html.split("<details")[0]!
  assert.match(firstScreen, /<strong>title<\/strong><small>string<\/small>/)
  assert.match(firstScreen, /<strong>ordinal<\/strong><small>integer<\/small>/)
  assert.match(firstScreen, /<strong>ready<\/strong><small>boolean<\/small>/)
  assert.match(firstScreen, /<strong>absent<\/strong><small>类型未记录<\/small>/)
  assert.match(firstScreen, /内容标题/)
  assert.match(firstScreen, /<span>0<\/span>/)
  assert.match(firstScreen, /<span>false<\/span>/)
  assert.match(firstScreen, /空值（null）/)
  assert.doesNotMatch(firstScreen, /<pre|返回要求|执行身份|事件序号|由实际绑定值确定|绑定的输入数据/)
  assert.match(html, /函数代码 · JavaScript/)
})

test("阶段详情只显示阶段摘要而不重复动作列表", () => {
  const next = { ...node, id: "next", label: "打开目标记录" } satisfies StableChainNodeV2
  const terminal = {
    id: "done",
    label: "完成",
    kind: "terminal",
    status: "completed",
    reason: "链路完成",
    evidence: [{ source: "node", nodeId: next.id, path: [] }],
    outputContract: node.outputContract,
    writes: [],
  } satisfies StableChainNodeV2
  const stage = {
    id: "stage-read",
    title: "读取并打开记录",
    summary: "从当前页面读取候选并打开目标记录。",
    nodeIds: [node.id, next.id],
    entryNodeId: node.id,
    exits: [{ id: "done", label: "完成", sourceNodeId: next.id, sourcePort: "success" }],
  }
  const html = renderToStaticMarkup(createElement(ChainInspector, {
    chain: { nodes: [node, next, terminal], edges: [{ from: next.id, port: "success", to: terminal.id }] },
    stage,
    node: null,
    batch: null,
    preparing: true,
    preparationPhase: "prefix",
    onClose() {},
  }))

  assert.match(html, /<dt>阶段目的<\/dt><dd>从当前页面读取候选并打开目标记录。<\/dd>/)
  assert.match(html, /<dt>准备状态<\/dt><dd>生成中<\/dd>/)
  assert.match(html, /<dt>动作数量<\/dt><dd>2 个<\/dd>/)
  assert.match(html, /<dt>已知入口<\/dt><dd>读取当前记录<\/dd>/)
  assert.match(html, /<dt>真实出口<\/dt><dd>成功 → 完成<\/dd>/)
  assert.doesNotMatch(html, /<ol>/)
})

test("Function 未调用也显示版本常量及真实合同约束，返回结构可读而不冒充实值", () => {
  const contract = (schema: TaskDataContract["schema"]) => ({ ...node.outputContract, schema })
  const calculate = { id: "calculate", label: "整理参数", kind: "function", language: "javascript",
    source: "return { entries: [] };", inputs: {
      title: { source: "input", path: ["title"] },
      count: { source: "node", nodeId: node.id, path: ["count"] },
      entries: { source: "variable", name: "entries", path: [] },
      fixed: { source: "constant", value: { limit: 0, enabled: false, text: "" } },
    }, outputContract: contract({ type: "object", properties: { entries: { type: "array", minItems: 0, maxItems: 2,
      items: { type: "object", properties: { title: { type: "string", minLength: 1 },
        score: { type: "integer", minimum: 0, maximum: 99 } }, required: ["title"], additionalProperties: false } } },
      required: ["entries"], additionalProperties: false }), writes: [], timeoutMs: 1000 } satisfies StableChainNodeV2
  const read = { ...node, outputContract: contract({ type: "object", properties: { count: { type: "integer", minimum: 0, maximum: 5 } },
    required: ["count"], additionalProperties: false }) }
  const html = renderToStaticMarkup(createElement(ChainInspector, { chain: { nodes: [read, calculate], edges: [],
    inputContract: contract({ type: "object", properties: { title: { type: "string", minLength: 0, maxLength: 80,
      enum: ["", "已选标题"] } }, required: ["title"], additionalProperties: false }), variables: {
      entries: contract({ type: "array", minItems: 0, maxItems: 3, items: { type: "boolean" } }),
    } }, node: calculate, stage: null, batch: null, onClose() {} }))
  const firstScreen = html.split("<details")[0]!
  assert.match(firstScreen, /string（长度至少 0；长度至多 80；可选值：空字符串、已选标题）/)
  assert.match(firstScreen, /integer（不小于 0；不大于 5）/)
  assert.match(firstScreen, /array&lt;boolean&gt;（至少 0 项；至多 3 项）/)
  assert.match(firstScreen, /版本固定值/)
  assert.match(firstScreen, /<span>0<\/span>/)
  assert.match(firstScreen, /<span>false<\/span>/)
  assert.match(firstScreen, /空字符串/)
  assert.match(firstScreen, /本次尚无执行记录|本次尚无完成输出/)
  const requirements = html.slice(html.indexOf("<summary>返回要求"), html.indexOf("</details>"))
  assert.match(requirements, /entries（必填）：array&lt;object/)
  assert.match(requirements, /title（必填）：string（长度至少 1）/)
  assert.match(requirements, /score（可选）：integer（不小于 0；不大于 99）/)
  assert.match(requirements, /至少 0 项；至多 2 项/)
  assert.match(requirements, /不允许额外字段/)
  assert.doesNotMatch(requirements, /<pre|&quot;properties&quot;/)
})

test("execution mode 展示完成回执而不是伪造业务数据报告", () => {
  const contract = {
    id: "execution-result",
    version: 1,
    dialect: "bat-value-schema/v1",
    schema: { type: "null" },
  } satisfies TaskDataContract
  const result = {
    status: "completed",
    summary: "任务已执行",
    nextAction: "view",
    payload: {
      mode: "execution",
      completedSteps: 2,
      totalSteps: 3,
      evidence: [{ artifactId: "00000000-0000-4000-8000-000000000021",
        mediaType: "image/png", digest: "a".repeat(64) }],
    },
    failure: null,
  } satisfies TaskExecutionResult

  const html = renderToStaticMarkup(createElement(ExecutionResultView, { result, outputContract: contract }))

  assert.match(html, /完成回执/)
  assert.match(html, /完成 2 \/ 3 个步骤/)
  assert.match(html, /1 份证据产物/)
  assert.match(html, /image\/png/)
  assert.doesNotMatch(html, /业务结果|记录列表/)
})

test("data object 按精确输出合同渲染单条记录", () => {
  const contract = {
    id: "article-result",
    version: 3,
    dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: {
      title: { type: "string" }, body: { type: "string" },
    }, required: ["title", "body"], additionalProperties: false },
  } satisfies TaskDataContract
  const result = {
    status: "completed",
    summary: "已取得记录",
    nextAction: "view",
    payload: { mode: "data", output: { kind: "value",
      contract: { id: contract.id, version: contract.version },
      value: { body: "正文内容", title: "记录标题" } } },
    failure: null,
  } satisfies TaskExecutionResult

  const html = renderToStaticMarkup(createElement(ExecutionResultView, { result, outputContract: contract }))

  assert.match(html, /单条记录/)
  assert.ok(html.indexOf("title") < html.indexOf("body"), "字段顺序来自精确输出合同")
  assert.match(html, /记录标题/)
  assert.match(html, /正文内容/)
  assert.doesNotMatch(html, /\{&quot;|\{\s*"/)
})

test("data array 按精确输出合同渲染记录列表", () => {
  const contract = {
    id: "records-result",
    version: 2,
    dialect: "bat-value-schema/v1",
    schema: { type: "array", items: { type: "object", properties: {
      title: { type: "string" }, body: { type: "string" },
    }, required: ["title", "body"], additionalProperties: false } },
  } satisfies TaskDataContract
  const result = {
    status: "completed",
    summary: "已取得列表",
    nextAction: "view",
    payload: { mode: "data", output: { kind: "value",
      contract: { id: contract.id, version: contract.version },
      value: [{ body: "第一条正文", title: "第一条" }, { body: "第二条正文", title: "第二条" }] } },
    failure: null,
  } satisfies TaskExecutionResult

  const html = renderToStaticMarkup(createElement(ExecutionResultView, { result, outputContract: contract }))

  assert.match(html, /已保存记录/)
  assert.match(html, /2 条记录/)
  assert.ok(html.indexOf("title") < html.indexOf("body"), "列表字段顺序来自精确输出合同")
  assert.match(html, /第一条正文/)
  assert.match(html, /第二条正文/)
})

test("标量结果明确标记为历史兼容展示", () => {
  const contract = {
    id: "legacy-scalar",
    version: 1,
    dialect: "bat-value-schema/v1",
    schema: { type: "string" },
  } satisfies TaskDataContract
  const result = {
    status: "completed",
    summary: "已取得文本",
    nextAction: "view",
    payload: { mode: "data", output: { kind: "value",
      contract: { id: contract.id, version: contract.version }, value: "历史文本结果" } },
    failure: null,
  } satisfies TaskExecutionResult

  const html = renderToStaticMarkup(createElement(ExecutionResultView, { result, outputContract: contract }))

  assert.match(html, /兼容结果/)
  assert.match(html, /历史文本结果/)
  assert.doesNotMatch(html, /单条记录|记录列表/)
})

test("artifact 兼容分支只展示已持久化的安全元数据", () => {
  const contract = {
    id: "legacy-artifact",
    version: 1,
    dialect: "bat-value-schema/v1",
    schema: { type: "string" },
  } satisfies TaskDataContract
  const artifactId = "00000000-0000-4000-8000-000000000031"
  const digest = "b".repeat(64)
  const result = {
    status: "completed",
    summary: "产物已保存",
    nextAction: "view",
    payload: { mode: "data", output: { kind: "artifact",
      contract: { id: contract.id, version: contract.version },
      artifact: { artifactId, mediaType: "application/pdf", digest } } },
    failure: null,
  } satisfies TaskExecutionResult

  const html = renderToStaticMarkup(createElement(ExecutionResultView, { result, outputContract: contract }))

  assert.match(html, /产物兼容信息/)
  assert.match(html, /application\/pdf/)
  assert.match(html, new RegExp(artifactId))
  assert.match(html, new RegExp(digest))
  assert.doesNotMatch(html, /文件名|预览|下载|href=/)
})

test("合同不匹配或历史合同不可证明时不按当前 schema 解读", () => {
  const currentContract = {
    id: "current-result",
    version: 4,
    dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { currentOnly: { type: "string" } },
      required: ["currentOnly"], additionalProperties: false },
  } satisfies TaskDataContract
  const result = {
    status: "completed",
    summary: "历史结果",
    nextAction: "view",
    payload: { mode: "data", output: { kind: "value",
      contract: { id: "older-result", version: 2 }, value: { legacy: "旧值" } } },
    failure: null,
  } satisfies TaskExecutionResult

  const mismatched = renderToStaticMarkup(createElement(ExecutionResultView, {
    result, outputContract: currentContract,
  }))
  const historical = renderToStaticMarkup(createElement(ExecutionResultView, {
    result, outputContract: null,
  }))

  assert.match(mismatched, /结果合同与当前任务版本不一致/)
  assert.match(historical, /历史运行未能精确绑定输出合同/)
  for (const html of [mismatched, historical]) {
    assert.doesNotMatch(html.split("<details")[0]!, /单条记录|currentOnly|旧值/)
    assert.match(html, /原始结果/)
  }
})

test("合同身份匹配但 value 不满足 schema 时不进入正式记录 renderer", () => {
  const contract = {
    id: "validated-record",
    version: 1,
    dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { title: { type: "string" } },
      required: ["title"], additionalProperties: false },
  } satisfies TaskDataContract
  const result = {
    status: "completed",
    summary: "持久值异常",
    nextAction: "view",
    payload: { mode: "data", output: { kind: "value",
      contract: { id: contract.id, version: contract.version }, value: { title: 7 } } },
    failure: null,
  } satisfies TaskExecutionResult

  const html = renderToStaticMarkup(createElement(ExecutionResultView, { result, outputContract: contract }))
  const firstScreen = html.split("<details")[0]!

  assert.match(firstScreen, /结果值不符合已绑定输出合同/)
  assert.doesNotMatch(firstScreen, /单条记录|记录列表|<dt>title<\/dt>/)
  assert.match(html, /原始结果/)
})

test("data mode 没有 TaskOutput 时明确说明没有结构化结果", () => {
  const result = {
    status: "completed",
    summary: "运行完成",
    nextAction: "view",
    payload: { mode: "data", output: null },
    failure: null,
  } satisfies TaskExecutionResult

  const html = renderToStaticMarkup(createElement(ExecutionResultView, { result, outputContract: null }))

  assert.match(html, /本次运行没有结构化结果/)
  assert.doesNotMatch(html, /单条记录|记录列表|兼容结果/)
})

test("失败 execution 同时展示已保存结果与失败原因", () => {
  const contract = {
    id: "partial-record",
    version: 1,
    dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { title: { type: "string" } },
      required: ["title"], additionalProperties: false },
  } satisfies TaskDataContract
  const result = {
    status: "failed",
    summary: "运行失败但保留部分结果",
    nextAction: "rerun",
    payload: { mode: "data", output: { kind: "value",
      contract: { id: contract.id, version: contract.version }, value: { title: "已保存记录" } } },
    failure: {
      classification: "deterministic",
      code: "target_missing",
      repairable: true,
      executionId: "00000000-0000-4000-8000-000000000041",
      stepId: "perform",
      runId: "00000000-0000-4000-8000-000000000042",
      runSequence: 3,
      checkpointId: null,
      eventSequence: 8,
      reason: "后续目标未找到",
      digest: "c".repeat(64),
    },
  } satisfies TaskExecutionResult

  const html = renderToStaticMarkup(createElement(ExecutionResultView, { result, outputContract: contract }))

  assert.match(html, /单条记录/)
  assert.match(html, /已保存记录/)
  assert.match(html, /失败原因/)
  assert.match(html, /后续目标未找到/)
})
