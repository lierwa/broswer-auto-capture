import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema, type JsonValue } from "@browser-capture/contracts"
import { hybridNaturalRequestSchema, hybridRepeatMethodSchema, readSpecificationSchema,
  type HybridCompilation } from "./hybrid-schema.js"
import { jsonValueAtPath } from "./hybrid-json-path.js"

type Trace = z.infer<typeof hybridNaturalRequestSchema>["trace"]
type Observation = Trace["observations"][number]
type Method = z.infer<typeof hybridRepeatMethodSchema>
type Segment = Extract<HybridCompilation["segments"][number], { kind: "deterministic" }>
type Read = { output: JsonValue; readPath: Array<string | number>;
  specification: z.infer<typeof readSpecificationSchema> }
type Iteration = { readActionRef: string; continuationActionRef: string; advanceActionRef: string | null }
export type RepeatAdvanceMode = "navigation" | "same_page"
function fail(reason: string): never { throw new Error(`hybrid_repeat_${reason}`) }

export function repeatAdvanceMode(trace: Trace, actionRef: string): RepeatAdvanceMode {
  const action = trace.actions.find((item) => item.id === actionRef)
  if (!action) fail("advance_action_missing")
  const before = trace.observations.find((item) => item.id === action.preObservationRef)
  const after = trace.observations.find((item) => item.id === action.postObservationRef)
  if (!before || !after) fail("advance_observation_missing")
  if (action.name === "navigate" || action.name === "click" && before.url !== after.url) return "navigation"
  if (["click", "scroll"].includes(String(action.name)) && before.url === after.url) return "same_page"
  return fail("advance_action_invalid")
}

export function assertInPageSegment(advance: Segment, method: Method, read: Read, query: Read) {
  if (advance.operation.name !== "browser.workflow-step"
    || !["click", "scroll"].includes(advance.operation.actionName)) fail("in_page_segment_invalid")
  if (advance.operation.actionName === "click") {
    const target = z.object({ strategy: z.literal("structure"), ordinal: z.literal(1),
      container: z.object({ kind: z.literal("css"), value: z.literal("html") }),
      items: z.object({ kind: z.literal("css"), value: z.literal(query.specification.container) }),
      withinItem: z.null(), ordinalBinding: z.unknown().optional() }).passthrough().parse(advance.target)
    if (target.ordinalBinding !== undefined) fail("in_page_target_binding_invalid")
  } else if (advance.target !== null) fail("in_page_scroll_target_invalid")
  const conditions = advance.postconditions.filter((condition) => condition.kind === "read_fields")
  const expected = { ...read.specification, maxInputBytes: read.specification.maxInputBytes ?? 128000 }
  if (conditions.length !== 1 || conditions[0]!.kind !== "read_fields" || conditions[0]!.transition !== true
    || conditions[0]!.consumerRef !== method.readSegmentId
    || !isDeepStrictEqual(conditions[0]!.read, expected)) fail("in_page_readiness_missing")
}

/** WHY：同页动作必须带来下一批新稳定键；滚动位移或按钮回执不能代替内容证据。 */
export function assertInPageSamples(input: { request: z.infer<typeof hybridNaturalRequestSchema>; method: Method;
  iterations: Iteration[]; read: (ref: string) => Read; sameDocument: (left: Observation, right: Observation) => void;
  assertFact: (fact: Observation["facts"][number], observationId: string) => void }) {
  const trace = input.request.trace
  const first = trace.actions.find((action) => action.id === input.iterations[0]!.advanceActionRef)!
  const seen = new Set<string>()
  for (const [index, iteration] of input.iterations.entries()) {
    const read = input.read(iteration.readActionRef)
    const values = jsonValueAtPath(read.output, read.readPath)
    if (!Array.isArray(values)) fail("in_page_read_array_missing")
    const keys = values.map((value) => JSON.stringify(jsonValueAtPath(value, input.method.stableKeyPath)))
    if (index > 0 && !keys.some((key) => !seen.has(key))) fail("in_page_new_records_missing")
    keys.forEach((key) => seen.add(key))
    const readAction = trace.actions.find((action) => action.id === iteration.readActionRef)!
    const query = trace.actions.find((action) => action.id === iteration.continuationActionRef)!
    const readPost = observation(trace, readAction.postObservationRef), queryPre = observation(trace, query.preObservationRef)
    const queryPost = observation(trace, query.postObservationRef)
    samePage(input, readPost, queryPre); samePage(input, queryPre, queryPost)
    if (!iteration.advanceActionRef) continue
    const advance = trace.actions.find((action) => action.id === iteration.advanceActionRef)!
    if (advance.status !== "succeeded" || !advance.resultRef || advance.name !== first.name
      || repeatAdvanceMode(trace, advance.id) !== "same_page") fail("in_page_action_mismatch")
    assertRepeatDispatch(input, advance)
    const pre = observation(trace, advance.preObservationRef), post = observation(trace, advance.postObservationRef)
    const next = trace.actions.find((action) => action.id === input.iterations[index + 1]!.readActionRef)!
    samePage(input, queryPost, pre); samePage(input, pre, post)
    samePage(input, post, observation(trace, next.preObservationRef))
    if (advance.name === "click") assertControlTarget(input, advance, query, pre)
    const args = (action: typeof advance) => {
      const value = z.record(z.string(), jsonValueSchema).parse(action.args)
      if (action.name === "click") {
        const { index: _index, element_index: _element, xpath: _xpath, ...rest } = value
        return rest
      }
      if (value.index !== undefined && value.index !== null
        || ["element_index", "xpath"].some((key) => key in value)) fail("in_page_scroll_target_invalid")
      // WHY：SDK 的 null index 与缺省均滚动 viewport；只规范方法比较，保留来源参数。
      const { index: _index, ...rest } = value
      return rest
    }
    if (!isDeepStrictEqual(args(first), args(advance))) fail("in_page_arguments_changed")
  }
}

export function assertRepeatDispatch(input: { request: z.infer<typeof hybridNaturalRequestSchema>;
  assertFact: (fact: Observation["facts"][number], id: string) => void }, action: Trace["actions"][number]) {
  const facts = input.request.trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.kind === "native_action_dispatch" && fact.value && typeof fact.value === "object"
      && !Array.isArray(fact.value) && fact.value.actionRef === action.id).map((fact) => ({ fact, observation })))
  if (facts.length !== 1 || !action.resultRef) fail("native_dispatch_missing")
  const { fact, observation } = facts[0]!
  input.assertFact(fact, observation.id)
  const value = z.object({ schemaVersion: z.literal("bat.native-action-dispatch/v3"),
    actionName: z.literal(String(action.name)), entered: z.literal(true), resultReceived: z.literal(true),
    nativeActionIndex: z.number().int().nonnegative(), nativeStepNumber: z.number().int().positive(),
    resultRef: z.object({ ref: z.string(), digest: z.string() }).strict() }).passthrough().parse(fact.value)
  if (value.nativeActionIndex !== action.actionIndex || !isDeepStrictEqual(value.resultRef, action.resultRef)) fail("native_dispatch_invalid")
  return value
}

export function assertPassiveRepeatWait(input: { request: z.infer<typeof hybridNaturalRequestSchema>;
  assertFact: (fact: Observation["facts"][number], id: string) => void;
  sameDocument: (left: Observation, right: Observation) => void }, action: Trace["actions"][number]) {
  if (action.name !== "wait" || action.effect !== "none" || action.status !== "succeeded") fail("wait_invalid")
  const receipt = assertRepeatDispatch(input, action)
  if (receipt.intentTarget !== null || !isDeepStrictEqual(receipt.eventCapture,
    { status: "not_applicable", eventExpectation: "none", eventCount: 0, limitations: [] })) fail("wait_effect_unproven")
  samePage(input, observation(input.request.trace, action.preObservationRef), observation(input.request.trace, action.postObservationRef))
}

function assertControlTarget(input: { assertFact: (fact: Observation["facts"][number], id: string) => void },
  advance: Trace["actions"][number], query: Trace["actions"][number], pre: Observation) {
  const matches = pre.facts.filter((fact) => fact.kind === "dom_structure" && fact.value
    && typeof fact.value === "object" && !Array.isArray(fact.value) && fact.value.actionRef === advance.id)
  if (matches.length !== 1) fail("in_page_target_missing")
  input.assertFact(matches[0]!, pre.id)
  const selector = z.object({ selector: z.string() }).passthrough().parse(query.args).selector
  z.object({ queryCandidate: z.object({ readActionRef: z.literal(query.id), complete: z.literal(true),
    matchedItemOrdinal: z.literal(1), withinItem: z.null(),
    container: z.object({ kind: z.literal("css"), value: z.literal("html") }),
    items: z.object({ kind: z.literal("css"), value: z.literal(selector) }) }).passthrough() })
    .passthrough().parse(matches[0]!.value)
}

function observation(trace: Trace, ref: string | null) {
  const value = trace.observations.find((item) => item.id === ref)
  return value ?? fail("in_page_observation_missing")
}

function samePage(input: { sameDocument: (left: Observation, right: Observation) => void }, left: Observation, right: Observation) {
  if (left.url !== right.url || left.tabId !== right.tabId) fail("in_page_scope_changed")
  input.sameDocument(left, right)
}
