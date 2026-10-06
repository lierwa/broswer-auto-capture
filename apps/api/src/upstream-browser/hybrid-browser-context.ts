import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import type { ValueBinding } from "@browser-capture/contracts"
import { hybridNaturalRequestSchema, type HybridSegment } from "./hybrid-schema.js"
import type { naturalPayloadContext } from "./hybrid-natural-payload.js"

export const BROWSER_CONTEXT_OUTPUT = "browserContextOutput"
export const browserContextOutputSchema = { type: "object", properties: {
  url: { type: "string" }, tabId: { type: "string" } },
  required: ["url", "tabId"], additionalProperties: false } as const
type Trace = z.infer<typeof hybridNaturalRequestSchema>["trace"]
type Payload = ReturnType<typeof naturalPayloadContext>
type Deterministic = Extract<HybridSegment, { kind: "deterministic" }>
type Observation = Trace["observations"][number]

function contextAt(post: Trace["observations"][number], payload: Payload) {
  const contexts = post.facts.filter(fact => fact.kind === "browser_context")
  const urls = post.facts.filter(fact => fact.kind === "url_digest")
  if (contexts.length !== 1 || urls.length !== 1) throw new Error("hybrid_browser_context_missing")
  const context = contexts[0]!, url = urls[0]!
  payload.assertFact(context, post.id); payload.assertFact(url, post.id)
  const value = z.object({ schemaVersion: z.literal("bat.browser-context/v1"), focusTargetId: z.string(),
    tabs: z.array(z.object({ targetId: z.string(), urlDigest: z.string() }).passthrough()) }).passthrough().parse(context.value)
  const tabId = z.string().min(1).parse(post.tabId), actualUrl = z.string().min(1).parse(post.url)
  const targets = value.tabs.filter(tab => tab.targetId === tabId)
  const digest = createHash("sha256").update(JSON.stringify(actualUrl)).digest("hex")
  if (value.focusTargetId !== tabId || targets.length !== 1
    || targets[0]!.urlDigest !== digest || url.value !== digest) throw new Error("hybrid_browser_context_mismatch")
  return [context, url]
}

function contextConditionHolds(condition: Deterministic["postconditions"][number], action: Trace["actions"][number],
  pre: Observation | undefined, post: Observation, payload: Payload) {
  // WHY：引用同属一页不等于证明条件；只接纳这三种上下文事实，其他完成条件不推导页面输出。
  if (!("clauseRef" in condition) || !["url", "url_digest", "active_tab"].includes(condition.kind)) return false
  const [context, url] = contextAt(post, payload)
  const source = condition.kind === "active_tab" ? context! : url!
  if (condition.clauseRef !== source.id) return false
  const values = { url: post.url, url_digest: url!.value, active_tab: post.tabId }
  const current = values[condition.kind as keyof typeof values]
  if (condition.changed || condition.unchanged) {
    if (!pre) return false
    const [, previousUrl] = contextAt(pre, payload)
    const previousValues = { url: pre.url, url_digest: previousUrl!.value, active_tab: pre.tabId }
    return !isDeepStrictEqual(current, previousValues[condition.kind as keyof typeof previousValues]) === !!condition.changed
  }
  if (condition.equals !== undefined) return isDeepStrictEqual(current, condition.equals)
  const key = condition.bindingArgument
  const args = z.record(z.string(), z.unknown()).parse(action.args)
  const expected = key === undefined ? undefined : args[key]
  if (typeof expected !== "string") return false
  if (condition.kind === "active_tab") return action.name === "switch" && key === "tab_id" && expected === z.string().parse(post.tabId).slice(-4)
  return key === "url" && current === (condition.kind === "url_digest"
    ? createHash("sha256").update(JSON.stringify(expected)).digest("hex") : expected)
}

export function assertBrowserContextOutput(segment: Extract<HybridSegment, { kind: "deterministic" }>,
  request: z.infer<typeof hybridNaturalRequestSchema>, payload: Payload) {
  if (segment.operation.name !== "browser.workflow-step" || segment.outputs.length === 0) return false
  const action = request.trace.actions.find(item => `s-${item.id}` === segment.id)
  const post = request.trace.observations.find(item => item.id === action?.postObservationRef)
  if (!post || action?.status !== "succeeded" || segment.outputs.length !== 1
    || segment.outputs[0]!.sourceRef !== post.id || !isDeepStrictEqual(segment.outputs[0]!.schema, browserContextOutputSchema)) {
    throw new Error("hybrid_browser_context_output_invalid")
  }
  const pre = request.trace.observations.find(item => item.id === action.preObservationRef)
  if (!segment.postconditions.length || segment.postconditions.some(condition => !contextConditionHolds(condition, action, pre, post, payload))) {
    throw new Error("hybrid_browser_context_completion_mismatch")
  }
  contextAt(post, payload)
  return true
}

export function assertPriorBrowserContext(decision: { actionRef: string; argumentPath: string; sourceRef: string;
  binding: ValueBinding; proofRefs: Array<{ ref: string; digest: string }> }, trace: Trace, payload: Payload) {
  const index = trace.actions.findIndex(action => action.id === decision.actionRef), action = trace.actions[index]
  const field = action?.name === "navigate" && decision.argumentPath === "url" ? "url"
    : action?.name === "switch" && decision.argumentPath === "tab_id" ? "tabId" : undefined
  const binding = decision.binding
  if (!field || index < 1 || binding.source !== "node" || !isDeepStrictEqual(binding.path, [field])) {
    throw new Error("hybrid_browser_context_binding_invalid")
  }
  const source = trace.actions.slice(0, index).find(item => item.id === binding.nodeId)
  const post = trace.observations.find(item => item.id === source?.postObservationRef)
  const args = z.record(z.string(), z.unknown()).parse(action!.args)
  if (!post || source?.status !== "succeeded" || decision.sourceRef !== post.id
    || (field === "url" ? post.url : z.string().parse(post.tabId).slice(-4)) !== args[decision.argumentPath]) {
    throw new Error("hybrid_browser_context_binding_mismatch")
  }
  const refs = contextAt(post, payload).flatMap(fact => fact.sourceRefs)
  if (!isDeepStrictEqual(refs, decision.proofRefs)) throw new Error("hybrid_browser_context_binding_proof_mismatch")
  return binding
}
