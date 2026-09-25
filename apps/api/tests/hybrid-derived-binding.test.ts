import assert from "node:assert/strict"
import test from "node:test"
import { assertNaturalBinding } from "../src/upstream-browser/hybrid-natural-materialization.js"

const destination = "https://example.test/series"
const ref = { ref: "fixture:read", digest: "a".repeat(64) }
const read = { id: "read", kind: "verified_natural_read", sourceRefs: [ref], value: {
  actionRef: "a-0001", stable: true, output: [{ title: "Series", url: destination }] } }
const action = { id: "a-0002", name: "navigate", args: { url: destination },
  preObservationRef: "o-action", postObservationRef: "o-done" }
const trace = { actions: [{ id: "a-0001", name: "find_elements", args: {},
  preObservationRef: "o-before", postObservationRef: "o-read" }, action],
observations: [{ id: "o-read", facts: [read] }, { id: "o-action", facts: [] }] }
const decision = { actionRef: action.id, argumentPath: "url", sourceRef: read.id,
  binding: { source: "node", nodeId: "a-0001", path: [0, "url"] },
  proofRefs: [ref], derivation: "prior_verified_read" }
const payload = { assertFact: () => undefined } as never

test("离线编译只从先前唯一验证读取派生导航参数", () => {
  assert.deepEqual(assertNaturalBinding(decision, trace as never, payload), decision.binding)
  const repeated = structuredClone(trace)
  repeated.observations[0]!.facts[0]!.value.output.push({ title: "Other", url: destination })
  assert.throws(() => assertNaturalBinding(decision, repeated as never, payload),
    /hybrid_prior_read_path_ambiguous/)
  const newer = structuredClone(trace)
  newer.actions.splice(1, 0, { id: "a-0003", name: "find_elements", args: {},
    preObservationRef: "o-before", postObservationRef: "o-new" })
  newer.observations.push({ id: "o-new", facts: [{ ...read, id: "new-read",
    value: { ...read.value, actionRef: "a-0003" } }] })
  assert.throws(() => assertNaturalBinding(decision, newer as never, payload),
    /hybrid_prior_read_source_mismatch/)
  const conflicting = structuredClone(trace)
  conflicting.observations[1]!.facts.push({ id: "older-binding", kind: "natural_binding",
    sourceRefs: [ref], value: { actionRef: action.id, argumentPath: "url" } } as never)
  assert.throws(() => assertNaturalBinding(decision, conflicting as never, payload),
    /hybrid_prior_read_derivation_conflict/)
})
