import test from "node:test"
import assert from "node:assert/strict"
import { compileActionGraph, runActionGraph } from "../src/capture.js"
import type { ActionGraph, ChainRecord } from "@browser-capture/contracts/chain"
import type { CaptureCheckpoint } from "@browser-capture/contracts/capture"

const loopGraph: ActionGraph = { entry: "open", coverage: "从输入页到实际末页", completion: "下一页消失且得到非空来源记录", maxTransitions: 300, nodes: [
  { id: "open", label: "打开", kind: "navigate", url: "$input.url", next: "loop" },
  { id: "loop", label: "有界循环", kind: "loop", maxIterations: 40, body: "read", exhausted: "limit" },
  { id: "read", label: "读取", kind: "read", next: "extract" },
  { id: "extract", label: "采集", kind: "extract_links", pathPrefix: "/items/", pathSuffix: "", titleContains: "", next: "branch" },
  { id: "branch", label: "末页判断", kind: "branch", text: "下一页", present: "click", absent: "done" },
  { id: "click", label: "翻页", kind: "click", target: { role: "link", name: "下一页" }, next: "loop" },
  { id: "done", label: "完成", kind: "finish", reason: "实际末页", minRecords: 1 },
  { id: "limit", label: "预算暂停", kind: "stop", reason: "循环上限" },
] }
function environment(last: number) {
  let page = 1, modelCalls = 0
  const events: ChainRecord["events"] = []
  return { events, get calls() { return modelCalls }, dependencies: {
    command: async (input: unknown) => {
      const value = input as { type: string; url?: string }
      if (value.type === "navigate") page = Number(new URL(value.url!).searchParams.get("page") ?? "1")
      if (value.type === "click") page++
      if (value.type !== "page") return null
      return JSON.stringify({ url: `https://example.com/catalog?page=${page}`, title: `Page ${page}`, text: page < last ? "下一页" : "目录结束", truncated: false,
        links: [{ url: `https://example.com/items/${page}`, title: `Item ${page}` }, { url: "https://example.com/items/shared", title: "重复条目" }] })
    },
    page: (value: unknown) => value as { url: string; title: string; text: string; truncated: boolean; links: { url: string; title: string }[] },
    event: (event: ChainRecord["events"][number]) => { events.push(event) },
    llm: async () => { modelCalls++; return "显式结果" },
  } }
}
test("编译后的真实条件/循环超过25步，按来源键去重且普通执行零模型", async () => {
  const env = environment(30)
  const result = await runActionGraph(loopGraph, { url: "https://example.com/catalog", value: "" }, env.dependencies, "sample", new AbortController().signal)
  assert.equal(result.rows.length, 31); assert.equal(result.termination, "实际末页"); assert.equal(env.calls, 0)
  assert.ok(env.events.filter((event) => event.nodeId === "loop" && event.status === "passed").length >= 30)
  const second = await runActionGraph(loopGraph, { url: "https://example.com/catalog?page=29", value: "" }, env.dependencies, "verification", new AbortController().signal)
  assert.equal(second.rows.length, 3); assert.equal(env.calls, 0)
})
test("循环保护上限不能被当作业务完成；失败节点事件保留", async () => {
  const env = environment(99)
  await assert.rejects(runActionGraph(loopGraph, { url: "https://example.com/catalog", value: "" }, env.dependencies, "verification", new AbortController().signal), /loop_budget/)
  assert.equal(env.events.at(-1)!.nodeId, "limit"); assert.equal(env.events.at(-1)!.status, "failed")
})
test("拒绝未知动作、悬空边、临时ref、不可达节点与无显式循环的环", () => {
  const replace = (change: (graph: ActionGraph) => void) => { const graph = structuredClone(loopGraph); change(graph); return graph }
  assert.throws(() => compileActionGraph(replace((g) => { g.nodes[0] = { ...g.nodes[0], kind: "eval" } as never })))
  assert.throws(() => compileActionGraph(replace((g) => { (g.nodes[0] as { next: string }).next = "absent" })), /graph_edge/)
  assert.throws(() => compileActionGraph(replace((g) => { (g.nodes[5] as { target: { name: string } }).target.name = "@e12" })), /unsupported/)
  assert.throws(() => compileActionGraph(replace((g) => { g.nodes.push({ id: "extra", kind: "finish", label: "孤立", reason: "孤立", minRecords: 1 }) })), /unreachable/)
  assert.throws(() => compileActionGraph(replace((g) => { (g.nodes[5] as { next: string }).next = "read" })), /unbounded/)
})
test("只有显式 llm 节点触发模型入口，缺少授权能力时拒绝", async () => {
  const graph = structuredClone(loopGraph), final = graph.nodes.find((node) => node.id === "done")!
  graph.nodes = graph.nodes.filter((node) => node.id !== "done")
  graph.nodes.push({ id: "done", kind: "llm", label: "归纳", instruction: "归纳", outputField: "说明", next: "finish" }, { ...final, id: "finish" })
  const env = environment(1), signal = new AbortController().signal, input = { url: "https://example.com/catalog", value: "" }
  const result = await runActionGraph(graph, input, env.dependencies, "verification", signal)
  assert.equal(env.calls, 1); assert.equal(result.rows[0]!.fields["说明"], "显式结果")
  const { llm: _, ...ordinary } = env.dependencies
  await assert.rejects(runActionGraph(graph, input, ordinary, "verification", signal), /explicit_llm_not_authorized/)
})

test("代表验证窗口在检查点保留部分记录，完整图继续保有循环和业务终止", async () => {
  const graph = structuredClone(loopGraph)
  ;(graph.nodes.find((node) => node.id === "extract") as { next: string }).next = "checkpoint"
  graph.nodes.push({ id: "checkpoint", kind: "checkpoint", label: "保存本页", next: "branch" })
  const env = environment(30), snapshots: number[] = []
  const result = await runActionGraph(graph, { url: "https://example.com/catalog", value: "" }, { ...env.dependencies, validationWindow: 2, checkpoint: (rows) => { snapshots.push(rows.length) } }, "sample", new AbortController().signal)
  assert.equal(result.termination, "validation_window"); assert.equal(result.rows.length, 3); assert.deepEqual(snapshots, [2, 3])
  assert.ok(!env.events.some((event) => event.nodeId === "done"))
  const full = await runActionGraph(graph, { url: "https://example.com/catalog", value: "" }, env.dependencies, "sample", new AbortController().signal)
  assert.equal(full.termination, "实际末页"); assert.equal(full.rows.length, 31)
})

test("持久检查点恢复保留游标循环和去重；图输入或浏览器漂移拒绝执行", async () => {
  const graph = structuredClone(loopGraph)
  ;(graph.nodes.find((node) => node.id === "extract") as { next: string }).next = "checkpoint"
  graph.nodes.push({ id: "checkpoint", kind: "checkpoint", label: "保存本页", next: "branch" })
  const env = environment(5), controller = new AbortController(), input = { url: "https://example.com/catalog", value: "" }
  let saved: CaptureCheckpoint | undefined
  await assert.rejects(runActionGraph(graph, input, { ...env.dependencies, persist: (checkpoint) => { saved = checkpoint; controller.abort() } }, "execution", controller.signal))
  assert.ok(saved); assert.equal(saved.cursor, "branch"); assert.equal(saved.rows.length, 2)
  const before = env.events.length
  await assert.rejects(runActionGraph(graph, input, { ...env.dependencies, resume: saved, verifyResume: async () => false }, "execution", new AbortController().signal), /browser_state_drift/)
  assert.equal(env.events.length, before)
  await assert.rejects(runActionGraph(graph, { ...input, value: "changed" }, { ...env.dependencies, resume: saved, verifyResume: async () => true }, "execution", new AbortController().signal), /checkpoint_binding/)
  const result = await runActionGraph(graph, input, { ...env.dependencies, resume: saved, verifyResume: async () => true }, "execution", new AbortController().signal)
  assert.equal(result.rows.length, 6); assert.equal(result.termination, "实际末页"); assert.equal(env.calls, 0)
})

test("语义末页分支区分存在、disabled和缺失控件，临时ref不进入图", async () => {
  const graph = structuredClone(loopGraph)
  graph.nodes = graph.nodes.map((node) => node.kind === "branch" ? { id: node.id, label: node.label, kind: "branch_target", target: { role: "link", name: "下一页" }, available: node.present, unavailable: node.absent } : node)
  for (const ending of ['@e9 link "下一页" [disabled]', "目录结束"]) {
    const env = environment(2), page = env.dependencies.page
    const result = await runActionGraph(graph, { url: "https://example.com/catalog", value: "" }, { ...env.dependencies, page: (raw) => {
      const value = page(raw); return { ...value, text: value.url.endsWith("page=1") ? '@e1 link "下一页"' : ending }
    } }, "execution", new AbortController().signal)
    assert.equal(result.rows.length, 3); assert.equal(env.events.filter((event) => event.status === "passed").at(-2)!.detail, "控件不可用：下一页")
  }
})

test("下一页仍存在时以新旧语义页面比较终止，末页与换输入终态指纹一致", async () => {
  const graph = structuredClone(loopGraph)
  graph.nodes = graph.nodes.filter((node) => node.kind !== "branch")
  ;(graph.nodes.find((node) => node.id === "extract") as { next: string }).next = "click"
  ;(graph.nodes.find((node) => node.id === "click") as { next: string }).next = "read_next"
  graph.nodes.push({ id: "read_next", label: "读取新页", kind: "read", next: "compare" },
    { id: "compare", label: "比较翻页效果", kind: "branch_page_changed", comparison: "semantic", changed: "loop", unchanged: "done" })
  const env = environment(3), command = env.dependencies.command
  let current = 1
  const deps = { ...env.dependencies, command: async (raw: unknown) => {
    const value = raw as { type: string; url: string }
    if (value.type === "navigate") current = Number(new URL(value.url).searchParams.get("page") ?? "1")
    if (value.type === "click" && current++ >= 3) return null
    return command(raw)
  } }
  const full = await runActionGraph(graph, { url: "https://example.com/catalog", value: "" }, deps, "execution", new AbortController().signal)
  const last = await runActionGraph(graph, { url: "https://example.com/catalog?page=3", value: "" }, deps, "verification", new AbortController().signal)
  assert.equal(full.rows.length, 4); assert.equal(last.rows.length, 2); assert.equal(full.pageDigest, last.pageDigest)
})

test("链接指纹忽略非目录推荐区懒加载，但仍识别商品链接换页", async () => {
  const graph = structuredClone(loopGraph)
  graph.nodes = graph.nodes.filter((node) => node.kind !== "branch")
  ;(graph.nodes.find((node) => node.id === "extract") as { next: string }).next = "click"
  ;(graph.nodes.find((node) => node.id === "click") as { next: string }).next = "read_next"
  graph.nodes.push({ id: "read_next", label: "读取新页", kind: "read", next: "compare" },
    { id: "compare", label: "比较目录链接", kind: "branch_page_changed", comparison: "links", changed: "loop", unchanged: "done" })
  let page = 1, reads = 0
  const env = environment(2), command = async (raw: unknown) => {
    const value = raw as { type: string; url?: string }
    if (value.type === "navigate") page = Number(new URL(value.url!).searchParams.get("page") ?? "1")
    if (value.type === "click" && page < 2) page++
    if (value.type !== "page") return null
    reads++
    return JSON.stringify({ url: "https://example.com/catalog", title: "目录", text: `第${page}页 推荐区批次${reads}`, truncated: false,
      links: [{ url: `https://example.com/items/${page}`, title: `Item ${page}` }, { url: `https://example.com/recommend/${reads}`, title: `推荐 ${reads}` }] })
  }
  const result = await runActionGraph(graph, { url: "https://example.com/catalog", value: "" }, { ...env.dependencies, command }, "execution", new AbortController().signal)
  const independent = await runActionGraph(graph, { url: "https://example.com/catalog?page=2", value: "" }, { ...env.dependencies, command }, "verification", new AbortController().signal)
  assert.equal(result.rows.length, 2)
  assert.equal(result.pageDigest, independent.pageDigest)
  assert.deepEqual(env.events.filter((event) => event.phase === "execution" && event.nodeId === "compare" && event.status === "passed").map((event) => event.detail), ["页面已变化", "页面未变化"])
})

test("signal尚未触发时，墙钟截止也会在下一个普通派生节点前拒绝", async () => {
  const graph: ActionGraph = { entry: "derive", coverage: "派生缺失说明", completion: "派生完成", maxTransitions: 5, nodes: [
    { id: "derive", label: "生成说明", kind: "derive_missing", outputField: "缺失说明", ruleIndex: 0, next: "done" },
    { id: "done", label: "完成", kind: "finish", reason: "派生完成", minRecords: 1 },
  ] }
  const env = environment(1), controller = new AbortController()
  let checks = 0
  await assert.rejects(runActionGraph(graph, { url: "https://example.com/items/1", value: "" }, {
    ...env.dependencies,
    initialRows: [{ stableKey: "1", url: "https://example.com/items/1", fields: {}, missing: ["型号"] }],
    assertActive: () => { if (++checks > 2) throw new Error("budget_exceeded") },
  }, "execution", controller.signal), /budget_exceeded/)
  assert.equal(controller.signal.aborted, false)
  assert.equal(env.events.at(-1)?.nodeId, "derive")
  assert.ok(!env.events.some((event) => event.nodeId === "done"))
})
