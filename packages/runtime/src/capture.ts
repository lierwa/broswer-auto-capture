import { Annotation, END, START, StateGraph } from "@langchain/langgraph"
import { chainInputSchema, type ActionNode, type CaptureRow, type ChainInput, type ChainRecord } from "@browser-capture/contracts/chain"
import { compileActionGraph } from "./capture-compiler.js"
export { compileActionGraph, successors } from "./capture-compiler.js"

interface Page { url: string; title: string; text: string; truncated: boolean; links: { url: string; title: string }[] }
export interface CaptureDependencies {
  initialRows?: CaptureRow[]
  checkpoint?(rows: CaptureRow[]): void
  validationWindow?: number
  command(input: unknown): Promise<string | null>
  page(value: unknown): Page
  event(event: ChainRecord["events"][number]): void
  llm?(node: Extract<ActionNode, { kind: "llm" }>, rows: CaptureRow[]): Promise<string>
}
interface Machine { cursor: string; rows: CaptureRow[]; page: Page | null; loops: Record<string, number>; transitions: number; checkpoints: number; termination: string | null }
const state = Annotation.Root({ machine: Annotation<Machine>({ reducer: (_previous, value) => value }) })

export async function runActionGraph(raw: unknown, rawInput: unknown, dependencies: CaptureDependencies, phase: "sample" | "verification", signal: AbortSignal) {
  const graph = compileActionGraph(raw), input = chainInputSchema.parse(rawInput), nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  // WHY：沿用 LangGraph 进行有界状态推进；固化普通节点只得到浏览器能力，模型仅在 llm 分支显式调用。
  const compiled = new StateGraph(state).addNode("action", async ({ machine }) => {
    signal.throwIfAborted()
    if (machine.transitions >= graph.maxTransitions) throw new Error("transition_budget")
    const node = nodes.get(machine.cursor)!
    const update = structuredClone(machine); update.transitions++
    const event = (status: "running" | "passed" | "failed", detail: string) => dependencies.event({ nodeId: node.id, phase, status, detail, records: update.rows.length, at: new Date().toISOString() })
    event("running", "正在运行固化节点")
    try { await perform(node, update, input, dependencies); signal.throwIfAborted(); event("passed", update.termination ?? "节点完成") }
    catch (error) { event("failed", "节点未通过，保留该步骤验证证据"); throw error }
    return { machine: update }
  }).addEdge(START, "action").addConditionalEdges("action", ({ machine }) => machine.termination ? END : "action").compile()
  const result = await compiled.invoke({ machine: { cursor: graph.entry, rows: structuredClone(dependencies.initialRows ?? []), page: null, loops: {}, transitions: 0, checkpoints: 0, termination: null } }, { signal, recursionLimit: graph.maxTransitions + 2 })
  return { rows: result.machine.rows, termination: result.machine.termination! }
}
async function perform(node: ActionNode, machine: Machine, input: ChainInput, deps: CaptureDependencies) {
  if (node.kind === "navigate") { await deps.command({ type: "navigate", url: node.url === "$input.url" ? input.url : node.url }); machine.page = null }
  else if (node.kind === "read") machine.page = deps.page(JSON.parse((await deps.command({ type: "page" }))!))
  else if (node.kind === "click") { await deps.command({ type: "click", target: { ...node.target, name: node.target.name === "$input.value" ? input.value : node.target.name } }); machine.page = null }
  else if (node.kind === "fill") { await deps.command({ type: "fill", target: node.target, value: node.value === "$input.value" ? input.value : node.value }); machine.page = null }
  else if (node.kind === "press") { await deps.command({ type: "press", target: node.target, key: node.key }); machine.page = null }
  else if (node.kind === "wait") { await deps.command({ type: "observe", until: { text: node.text, timeoutMs: node.timeoutMs } }); machine.page = null }
  else if (node.kind === "extract_links") extractLinks(node, machine)
  else if (node.kind === "extract_fields") extractFields(node, machine)
  else if (node.kind === "checkpoint") {
    deps.checkpoint?.(structuredClone(machine.rows)); machine.checkpoints++
    if (deps.validationWindow && machine.checkpoints >= deps.validationWindow) {
      if (!machine.rows.length) throw new Error("insufficient_records")
      machine.termination = "validation_window"; return
    }
  }
  else if (node.kind === "derive_missing") { for (const row of machine.rows) row.fields[node.outputField] = row.missing.length ? `页面未能确认：${row.missing.join("、")}` : "" }
  else if (node.kind === "branch") { machine.cursor = requirePage(machine).text.includes(node.text) ? node.present : node.absent; return }
  else if (node.kind === "loop") {
    const count = machine.loops[node.id] ?? 0
    if (count >= node.maxIterations) { machine.cursor = node.exhausted; return }
    machine.loops[node.id] = count + 1; machine.cursor = node.body; return
  } else if (node.kind === "llm") {
    if (!deps.llm) throw new Error("explicit_llm_not_authorized")
    const value = await deps.llm(node, machine.rows)
    for (const row of machine.rows) row.fields[node.outputField] = value
  } else if (node.kind === "stop") throw new Error("loop_budget_exceeded")
  else if (node.kind === "finish") {
    if (machine.rows.length < node.minRecords) throw new Error("insufficient_records")
    machine.termination = node.reason; return
  }
  machine.cursor = node.next
}
function requirePage(machine: Machine) {
  if (!machine.page || machine.page.truncated) throw new Error("page_evidence_incomplete")
  return machine.page
}
function merge(machine: Machine, row: CaptureRow) {
  const index = machine.rows.findIndex((item) => item.stableKey === row.stableKey)
  if (index < 0) machine.rows.push(row)
  else machine.rows[index] = row
  if (machine.rows.length > 1000) throw new Error("sample_record_budget")
}
function extractLinks(node: Extract<ActionNode, { kind: "extract_links" }>, machine: Machine) {
  const page = requirePage(machine)
  for (const link of page.links) {
    const url = new URL(link.url)
    if (!url.pathname.startsWith(node.pathPrefix) || !url.pathname.endsWith(node.pathSuffix) || !link.title.includes(node.titleContains)) continue
    url.hash = ""
    merge(machine, { stableKey: url.href, url: url.href, fields: { title: link.title }, missing: [] })
  }
}
function extractFields(node: Extract<ActionNode, { kind: "extract_fields" }>, machine: Machine) {
  const page = requirePage(machine), fields: Record<string, string> = Object.create(null), missing: string[] = []
  for (const field of node.fields) {
    const lines = page.text.split(/\r?\n/).map((line) => line.replace(/@e\d+\s*/g, "").trim())
    let value = field.source === "url" ? page.url : field.source === "title" ? page.title : lines.find((line) => line.includes(field.contains)) ?? ""
    if (field.after) value = value.includes(field.after) ? value.slice(value.indexOf(field.after) + field.after.length) : ""
    if (field.before) value = value.includes(field.before) ? value.slice(0, value.indexOf(field.before)) : ""
    value = value.trim().slice(0, 2000); fields[field.name] = value
    if (!value) { missing.push(field.name); if (field.required) throw new Error("required_field_missing") }
  }
  merge(machine, { stableKey: page.url, url: page.url, fields, missing })
}
