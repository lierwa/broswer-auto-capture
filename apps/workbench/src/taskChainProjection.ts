import type { ChainNode, TaskAuthoringJob, TaskChain, TaskRun } from "@browser-capture/contracts"
import type { TaskChainState } from "@browser-capture/contracts/api"

export const chainFamilyLabels: Record<ChainNode["kind"], string> = {
  capability: "通用能力", branch: "分支", browser: "浏览器动作", observe: "现场观察", data: "数据处理", condition: "条件", loop: "循环",
  invoke: "链路调用", human: "人工等待", llm: "显式模型", checkpoint: "检查点", emit: "发布输出", terminal: "终态",
}

export function authoringLevel(job: TaskAuthoringJob, chains: TaskChain[]) {
  const references = job.authoring?.compiledChains ?? (job.authoring?.compiledChain ? [job.authoring.compiledChain] : [])
  // WHY：历史生成任务只展示自己生成的版本，不能借用同 ID 新版本的 E4 证据。
  const authored = references.length ? references.map((reference) => chains.find((item) => item.id === reference.id
    && item.version === reference.version && item.validation.status !== undefined)).filter((item) => item !== undefined)
    : chains.filter((item) => item.id === job.resultId)
  if (authored.length && authored.length === references.length && authored.every((chain) => chain.validation.status === "verified")) return "E4 · 换输入已验证"
  if (authored.length && authored.every((chain) => chain.validation.evidence.some((item) => item.phase === "sample" && item.passed))) return "E3 · 样本可执行"
  if (authored.length) return "E2 · 已编译"
  if (job.authoring?.level === "E2") return "E2 · 已编译"
  if (job.authoring?.level === "E1") return "E1 · 探索已得到结果"
  if (job.status === "waiting_for_human") return "等待人工处理"
  return job.status === "running" ? "正在探索或编译" : job.status === "completed" ? "计划已生成" : job.reason ? "未完成" : "等待开始"
}

export function projectChainGraph(chain: TaskChain, runs: TaskRun[]) {
  const events = runsForChain(runs, chain).flatMap((run) => run.events)
  return {
    nodes: chain.nodes.map((node, index) => {
      const event = events.filter((item) => item.nodeId === node.id).at(-1)
      return { id: node.id, position: { x: index % 2 * 270, y: Math.floor(index / 2) * 125 },
        data: { label: `${node.label}\n${chainFamilyLabels[node.kind]} · ${chainOperation(node)} · ${event?.status ?? "未运行"}` },
        className: `chain-node chain-node-${event?.status ?? "pending"}`,
        type: node.kind === "terminal" ? "output" : "default" }
    }),
    edges: chain.edges.map((edge, index) => ({ id: `${edge.from}:${edge.outcome}:${index}`,
      source: edge.from, target: edge.to, label: edge.outcome, type: "smoothstep" })),
  }
}

export function chainOperation(node: ChainNode) {
  if (node.kind === "capability") return `${node.capability.name}@${node.capability.version}`
  if (node.kind === "browser" || node.kind === "data") return node.operation
  if (node.kind === "observe") return node.scope
  if (node.kind === "human") return node.reason
  if (node.kind === "llm") return node.model
  if (node.kind === "terminal") return node.status
  return node.kind
}

export function runsForChain(runs: TaskRun[], chain: TaskChain) {
  return runs.filter((run) => run.binding.chain.id === chain.id && run.binding.chain.version === chain.version)
}

export function isStaleVersion(state: Pick<TaskChainState, "staleVersions">,
  kind: "plan" | "chain", id: string, version: number) {
  return state.staleVersions.some((item) => item.kind === kind && item.id === id && item.version === version)
}
