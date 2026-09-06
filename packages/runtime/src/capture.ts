import { Annotation, END, START, StateGraph } from "@langchain/langgraph"
import { createHash } from "node:crypto"
import { captureCheckpointSchema, type CaptureCheckpoint } from "@browser-capture/contracts/capture"
import { chainInputSchema, type ActionNode, type CaptureRow, type ChainInput, type ChainRecord } from "@browser-capture/contracts/chain"
import { compileActionGraph } from "./capture-compiler.js"
export { compileActionGraph, successors } from "./capture-compiler.js"

interface Page { url: string; title: string; text: string; truncated: boolean; links: { url: string; title: string }[] }
export interface CaptureDependencies {
  initialRows?: CaptureRow[]
  checkpoint?(rows: CaptureRow[]): void
  validationWindow?: number
  resume?: CaptureCheckpoint
  persist?(checkpoint: CaptureCheckpoint): void
  verifyResume?(checkpoint: CaptureCheckpoint): Promise<boolean>
  command(input: unknown): Promise<string | null>
  page(value: unknown): Page
  event(event: ChainRecord["events"][number]): void
  llm?(node: Extract<ActionNode, { kind: "llm" }>, rows: CaptureRow[]): Promise<string>
  assertActive?(): void
}
interface Machine { cursor: string; rows: CaptureRow[]; page: Page | null; loops: Record<string, number>; transitions: number; checkpoints: number; termination: string | null;
  pageDigest: string | null; pageChanged: boolean | null; linkDigest: string | null; linksChanged: boolean | null;
  linkFilter: { pathPrefix: string; pathSuffix: string; titleContains: string } | null; comparisonDigest: string | null }
const state = Annotation.Root({ machine: Annotation<Machine>({ reducer: (_previous, value) => value }) })

export async function runActionGraph(raw: unknown, rawInput: unknown, dependencies: CaptureDependencies, phase: "sample" | "verification" | "execution", signal: AbortSignal) {
  const graph = compileActionGraph(raw), input = chainInputSchema.parse(rawInput), nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const graphDigest = createHash("sha256").update(JSON.stringify(graph)).digest("hex")
  let initial: Machine = { cursor: graph.entry, rows: structuredClone(dependencies.initialRows ?? []), page: null, loops: {}, transitions: 0, checkpoints: 0, termination: null,
    pageDigest: null, pageChanged: null, linkDigest: null, linksChanged: null, linkFilter: null, comparisonDigest: null }
  if (dependencies.resume) {
    const saved = captureCheckpointSchema.parse(dependencies.resume)
    if (saved.graphDigest !== graphDigest || JSON.stringify(saved.input) !== JSON.stringify(input) || !nodes.has(saved.cursor)) throw new Error("checkpoint_binding_mismatch")
    if (!dependencies.verifyResume || !await dependencies.verifyResume(saved)) throw new Error("browser_state_drift")
    initial = structuredClone(saved)
  }
  // WHY：沿用 LangGraph 进行有界状态推进；固化普通节点只得到浏览器能力，模型仅在 llm 分支显式调用。
  const compiled = new StateGraph(state).addNode("action", async ({ machine }) => {
    signal.throwIfAborted(); dependencies.assertActive?.()
    if (machine.transitions >= graph.maxTransitions) throw new Error("transition_budget")
    const node = nodes.get(machine.cursor)!
    const update = structuredClone(machine); update.transitions++
    const event = (status: "running" | "passed" | "failed", detail: string) => dependencies.event({ nodeId: node.id, phase, status, detail, records: update.rows.length, at: new Date().toISOString() })
    event("running", "正在运行固化节点")
    try {
      await perform(node, update, input, dependencies); signal.throwIfAborted(); dependencies.assertActive?.()
      // WHY：只在节点完成后推进持久游标；恢复核验失败不会消费后续节点或覆盖原检查点。
      if (node.kind === "checkpoint" || node.kind === "finish") dependencies.persist?.(captureCheckpointSchema.parse({ ...update, graphDigest, input }))
      const detail = node.kind === "branch" ? `${update.cursor === node.absent ? "条件缺失" : "条件满足"}：${node.text}`
        : node.kind === "branch_target" ? `${update.cursor === node.unavailable ? "控件不可用" : "控件可用"}：${node.target.name}`
        : node.kind === "branch_page_changed" ? update.pageChanged ? "页面已变化" : "页面未变化" : "节点完成"
      event("passed", update.termination ?? detail)
    }
    catch (error) { event("failed", "节点未通过，保留该步骤验证证据"); throw error }
    return { machine: update }
  }).addEdge(START, "action").addConditionalEdges("action", ({ machine }) => machine.termination ? END : "action").compile()
  if (initial.termination) return { rows: initial.rows, termination: initial.termination, pageDigest: initial.comparisonDigest ?? initial.pageDigest }
  const result = await compiled.invoke({ machine: initial }, { signal, recursionLimit: graph.maxTransitions + 2 })
  return { rows: result.machine.rows, termination: result.machine.termination!, pageDigest: result.machine.comparisonDigest ?? result.machine.pageDigest }
}
async function perform(node: ActionNode, machine: Machine, input: ChainInput, deps: CaptureDependencies) {
  if (node.kind === "navigate") { await deps.command({ type: "navigate", url: node.url === "$input.url" ? input.url : node.url }); machine.page = null; machine.pageDigest = null;
    machine.pageChanged = null; machine.linkDigest = null; machine.linksChanged = null; machine.linkFilter = null; machine.comparisonDigest = null }
  else if (node.kind === "read") {
    const page = deps.page(JSON.parse((await deps.command({ type: "page" }))!))
    const current = createHash("sha256").update(JSON.stringify({ ...page, text: page.text.replace(/@e\d+/g, "@ref") })).digest("hex")
    const links = machine.linkFilter ? filteredLinkDigest(page, machine.linkFilter) : null
    machine.pageChanged = machine.pageDigest === null ? null : current !== machine.pageDigest
    machine.linksChanged = machine.linkDigest === null || links === null ? null : links !== machine.linkDigest
    machine.pageDigest = current; machine.linkDigest = links; machine.page = page
  }
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
  else if (node.kind === "branch_target") {
    const found = requirePage(machine).text.split(/\r?\n/).some((line) => {
      const match = line.match(/@e\d+\s+(\w+)\s+"((?:\\.|[^"\\])*)"/)
      return match && match[1] === node.target.role && JSON.parse(`"${match[2]}"`) === node.target.name && !/\[disabled\]/i.test(line)
    })
    machine.cursor = found ? node.available : node.unavailable; return
  }
  else if (node.kind === "branch_page_changed") {
    requirePage(machine)
    const changed = node.comparison === "links" ? machine.linksChanged : machine.pageChanged
    if (changed === null) throw new Error("page_comparison_missing")
    machine.pageChanged = changed; machine.comparisonDigest = node.comparison === "links" ? machine.linkDigest : machine.pageDigest
    machine.cursor = changed ? node.changed : node.unchanged; return
  }
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
  machine.linkFilter = { pathPrefix: node.pathPrefix, pathSuffix: node.pathSuffix, titleContains: node.titleContains }
  machine.linkDigest = filteredLinkDigest(page, machine.linkFilter)
}
function filteredLinkDigest(page: Page, filter: { pathPrefix: string; pathSuffix: string; titleContains: string }) {
  const links = page.links.filter((link) => {
    const path = new URL(link.url).pathname
    return path.startsWith(filter.pathPrefix) && path.endsWith(filter.pathSuffix) && link.title.includes(filter.titleContains)
  }).map((link) => ({ url: link.url, title: link.title.trim() }))
    .sort((left, right) => `${left.url}\u0000${left.title}`.localeCompare(`${right.url}\u0000${right.title}`))
  return createHash("sha256").update(JSON.stringify(links)).digest("hex")
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
