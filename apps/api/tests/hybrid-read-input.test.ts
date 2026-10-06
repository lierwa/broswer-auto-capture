import assert from "node:assert/strict"
import test from "node:test"
import { resolveBinding } from "@browser-capture/runtime"
import { materializeHybridNodes } from "../src/upstream-browser/hybrid-materializer-nodes.js"
import { materializeReadCommand } from "../src/upstream-browser/hybrid-read-input.js"
import { readSpecificationSchema } from "../src/upstream-browser/hybrid-schema.js"

// WHY：真实 binding fact→正式节点输入→IPC 命令必须传递新数量，不能保留代表执行的 take。
function fixture() {
  const specification = readSpecificationSchema.parse({ container: ".row", take: 2, maxItems: 300,
    fields: { name: { selector: ".name", attribute: null, valueType: "string" } },
    outputSchema: { type: "array", items: { type: "string" }, maxItems: 2 } })
  const boundSchema = { ...specification.outputSchema, maxItems: 3 }
  const binding = { source: "input", path: ["amount"] }, sourceRefs = [{ ref: "binding", digest: "a".repeat(64) }]
  const value = { actionRef: "a-0001", argumentPath: "take", binding, provenance: "runtime_input" }
  const bindingFact = { id: "binding", kind: "natural_binding", value, sourceRefs }
  const readFact = { id: "read", kind: "verified_natural_read", value: {
    actionRef: "a-0001", specification, outputPath: [], readRef: "r1" }, sourceRefs: [] }
  const action = { id: "a-0001", name: "bat_read_fields", status: "succeeded", args: { take: 2 },
    preObservationRef: "o1", postObservationRef: "o2" }
  const request = { runtimeInputSchema: { type: "object", properties: {
    amount: { type: "integer", minimum: 1, maximum: 3 } }, required: ["amount"], additionalProperties: false },
    plan: { resultSpec: { mode: "data", schema: boundSchema } },
    trace: { actions: [action], observations: [{ id: "o1", facts: [bindingFact] }, { id: "o2", facts: [readFact] }] } }
  const context = { version: 2, request, payload: { assertFact: () => {} } }
  const segment = { id: "read", kind: "deterministic", operation: { name: "browser.read-fields", version: 2,
    specification: { ...specification, maxInputBytes: 128000, outputSchema: boundSchema } },
    target: null, expectedEffect: { kind: "read" }, postconditions: [],
    outputs: [{ sourceRef: "read", schema: boundSchema }], bindings: [{ id: "take", actionRef: action.id,
      argumentPath: "take", kind: "runtime_input", sourceRef: "binding", proofRefs: sourceRefs, binding }] }
  const compilation = { compilerVersion: "bat-hybrid/2", segments: [segment], coverage: [
    { actionRef: action.id, disposition: "compiled", ownerSegmentId: segment.id }] }
  const materialize = () => materializeHybridNodes({ context, compilation, model: "unused",
    runtimeScopes: new Map(), repeats: [] } as unknown as Parameters<typeof materializeHybridNodes>[0]).nodes[0]!
  return { specification, segment, request, compilation, materialize }
}

test("来源数量绑定在物化及 IPC 中使用本次输入，拒绝缺省与越界", () => {
  const f = fixture(), node = f.materialize()
  assert.equal(node.kind, "capability")
  if (node.kind !== "capability") throw Error("fixture")
  const config = node.config as Record<string, unknown>
  assert.equal(config.readTakeInput, "take")
  for (const amount of [1, 3]) {
    const take = resolveBinding(node.input.take!, { input: { amount }, nodeOutputs: {}, variables: {} })
    const command = materializeReadCommand(config, { take })
    assert.equal((command.specification as { take: number }).take, amount)
    assert.equal((config.specification as { take: number }).take, 2)
  }
  for (const take of [0, 4, 1.5, "2", undefined]) assert.throws(() => materializeReadCommand(config, { take }))
  assert.throws(() => materializeReadCommand({ specification: f.specification }, { take: 1 }), /take_input_invalid/)
  f.segment.bindings = []
  assert.throws(f.materialize, /take_binding_invalid/)
})

test("readRef 复用保留原数量绑定，不能引用后来的方法", () => {
  const f = fixture()
  f.request.trace.actions.push({ ...f.request.trace.actions[0]!, id: "a-0002",
    args: { readRef: "r1" } as unknown as { take: number }, preObservationRef: "o2", postObservationRef: "o3" })
  const oldRead = f.request.trace.observations[1]!.facts[0]!
  f.request.trace.observations.push({ id: "o3", facts: [{ ...oldRead, id: "read2", value: {
    ...oldRead.value, actionRef: "a-0002", readRef: "r2" } }] } as typeof f.request.trace.observations[number])
  f.segment.outputs[0]!.sourceRef = "read2"
  f.compilation.coverage[0]!.actionRef = "a-0002"
  assert.equal(f.materialize().kind, "capability")
  f.request.trace.actions.reverse()
  assert.throws(f.materialize, /take_reference_invalid/)
})

test("数量歧义以及超出已验证读取预算的数量绑定阻止物化", () => {
  const ambiguous = fixture(), facts = ambiguous.request.trace.observations[0]!.facts as Array<{
    id: string; kind: string; value: { actionRef: string; argumentPath: string;
      binding: { source: string; path: string[] }; provenance: string }; sourceRefs: Array<{ ref: string; digest: string }> }>
  facts.push({ ...facts[0]!, id: "binding-other", value: { ...facts[0]!.value,
    binding: { source: "input", path: ["page"] } } } as typeof facts[number])
  ambiguous.segment.bindings = []
  assert.throws(ambiguous.materialize, /take_binding_invalid/)
  const bounded = fixture()
  bounded.specification.maxItems = 2
  assert.throws(bounded.materialize, /take_binding_invalid/)
})
