import type { ChainNode, NodeCapabilityResult, TaskCheckpoint } from "@browser-capture/contracts"
import { digestJson } from "./hash.js"

function browserResultOwner(node: ChainNode | undefined) {
  return node?.kind === "browser" || node?.kind === "observe" || node?.kind === "human"
    || node?.kind === "capability" && node.capability.name.startsWith("browser.")
}

export function recordBrowserCheckpoint(checkpoint: TaskCheckpoint, node: ChainNode, result: NodeCapabilityResult) {
  if (result.browser === undefined) return undefined
  if (!browserResultOwner(node)) throw new Error("runtime_browser_result_owner_invalid")
  // WHY：只在实际浏览器结果产生时一起保存身份和前驱；纯计算/循环事件不得冒充浏览器回执。
  checkpoint.browser = structuredClone(result.browser)
  checkpoint.browserNodeId = node.id
  return digestJson(checkpoint.browser)
}

export function checkpointBrowserReceipt(checkpoint: TaskCheckpoint) {
  if (!checkpoint.browserNodeId || !checkpoint.browser) return null
  const receipt = checkpoint.events.findLast((event) => event.browserStateDigest !== undefined)
  if (!receipt || receipt.nodeId !== checkpoint.browserNodeId || receipt.status !== "finished"
    || receipt.invocationId !== checkpoint.binding.invocationId || receipt.sequence > checkpoint.sequence
    || receipt.browserStateDigest !== digestJson(checkpoint.browser)) return null
  return receipt
}

export function validateBrowserCheckpoint(checkpoint: TaskCheckpoint, nodes: ReadonlyMap<string, ChainNode>) {
  for (const event of checkpoint.events) {
    if (event.browserStateDigest && !browserResultOwner(nodes.get(event.nodeId))) {
      throw new Error("checkpoint_browser_receipt_invalid")
    }
  }
  if (checkpoint.browserNodeId !== undefined
    && (!browserResultOwner(nodes.get(checkpoint.browserNodeId)) || !checkpointBrowserReceipt(checkpoint))) {
    throw new Error("checkpoint_browser_receipt_invalid")
  }
}
