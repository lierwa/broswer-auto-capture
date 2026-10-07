// WHY：跨 Python 编译/TS 物化/QuickJS 的真实边界，防止单语言测试漏掉来源协议和函数接线回归。
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { taskPlanSchema } from "@browser-capture/contracts"
import { compileTaskChain, digestJson } from "@browser-capture/runtime"
import { extractionFixture, nullContract } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { materializeHybridChain, validateHybridResponse } from "../src/upstream-browser/hybrid-materializer.js"
import { naturalSourceContext } from "../src/upstream-browser/hybrid-natural-payload.js"
import { assertPreparationMethod } from "../src/upstream-browser/hybrid-method-source.js"
import { validateSelectionFunctions } from "../src/upstream-browser/hybrid-selection.js"
import { representativeSourceOutput } from "../src/upstream-browser/hybrid-method-evidence.js"

const root = path.resolve(import.meta.dirname, "../../..")
const plan = taskPlanSchema.parse({ ...extractionFixture.plan, inputContract: nullContract, outputContract: nullContract,
  steps: [{ ...extractionFixture.plan.steps[0]!, inputContract: nullContract, outputContract: nullContract,
    resultSpec: { contractVersion: "bat-result-spec/v1", mode: "execution" } }] })
const step = plan.steps[0]!
const source = String.raw`
import asyncio, json, sys
from test_inspected_method import method_fixture
from workflow_use.hybrid.__main__ import compilation_response
from workflow_use.hybrid.source_response import canonical_json
async def main():
    options = json.loads(sys.stdin.read())
    request, registry, _, _ = await method_fixture(**options)
    print(json.dumps({'canonicalRequest': canonical_json(request.model_dump(mode='json', by_alias=True)),
        'response': compilation_response(request, registry, output_schema={'type':'null'})}))
asyncio.run(main())
`
function fixture(actual_navigation = false) {
  const process = spawnSync(path.join(root, "work/upstream-browser-hybrid/.venv/Scripts/python.exe"), ["-c", source], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 20000,
    env: { ...globalThis.process.env, PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      PYTHONPATH: ["vendor/workflow-use/workflows", "apps/api/python", "vendor/workflow-use/workflows/tests"]
        .map(p => path.join(root, p)).join(path.delimiter) },
    input: JSON.stringify({ actual_navigation, overrides: { requirementId: plan.requirement.id,
      requirementVersion: plan.requirement.version, requirementDigest: plan.requirement.digest,
      planId: plan.id, planVersion: plan.version, planDigest: digestJson(plan), stepId: step.id } }),
  })
  assert.equal(process.status, 0, process.stderr)
  const result = JSON.parse(process.stdout)
  return { ...naturalSourceContext(result.canonicalRequest), canonicalRequest: result.canonicalRequest as string,
    response: validateHybridResponse(result.response) }
}

test("新来源保留待试方法，跨语言物化后只有现有读取/Function/导航节点", async () => {
  const f = fixture()
  assert.deepEqual(f.response.compilation.gaps, [])
  assert.equal(representativeSourceOutput(nullContract, { ...f, output: null }).output, null)
  await validateSelectionFunctions(f.response, f.request, new AbortController().signal)
  const chain = materializeHybridChain({ request: f.request, response: f.response, plan, step, version: 1, model: "unused" })
  compileTaskChain(chain)
  assert.equal(chain.nodes.filter(n => n.kind === "function").length, 1)
  assert.equal(chain.budget.maxLlmCalls, 0)
  const navigation = chain.nodes.find(n => n.id === "s-a-0002")
  assert.ok(navigation?.kind === "capability")
  assert.deepEqual(navigation.input.url, { source: "node", nodeId: "selection-a-0002", path: [] })
  assertPreparationMethod(f.ordinary, f.response.compilation, f.assertFact)
  const receipt = f.ordinary.trace.observations.at(-1)!.facts.find(fact => fact.kind === "preparation_method_receipt")!
  f.ordinary.trace.observations.at(-1)!.facts = f.ordinary.trace.observations.at(-1)!.facts.filter(fact => fact !== receipt)
  assert.throws(() => assertPreparationMethod(f.ordinary, f.response.compilation, f.assertFact), /preparation_method_receipt_required/)
})

test("检查后真实导航合并仍消费同一语义函数，不退回固定候选行号", async () => {
  const f = fixture(true)
  await validateSelectionFunctions(f.response, f.request, new AbortController().signal)
  const chain = materializeHybridChain({ request: f.request, response: f.response, plan, step, version: 1, model: "unused" })
  compileTaskChain(chain)
  assert.equal(chain.nodes.filter(n => n.kind === "function").length, 1)
  assert.ok(!chain.nodes.some(n => n.id === "s-a-0002"))
  const navigation = chain.nodes.find(n => n.id === "s-a-0003")
  assert.ok(navigation?.kind === "capability")
  assert.deepEqual(navigation.input.url, { source: "node", nodeId: "selection-a-0003", path: [] })
})

test("新来源不能降级编译器版本，也不能绕过待试导航直达成功", () => {
  const f = fixture()
  assert.throws(() => materializeHybridChain({ request: { ...f.request, compilerVersion: "bat-hybrid/2" },
    response: f.response, plan, step, version: 1, model: "unused" }), /hybrid_source_protocol_mismatch/)
  const compilation = structuredClone(f.response.compilation)
  compilation.controlGraph.edges.push({ from: compilation.controlGraph.entry, outcome: "skipped", to: "completed" })
  assert.throws(() => assertPreparationMethod(f.ordinary, compilation, f.assertFact), /inspected_navigation_trial_bypass/)
  const omitted = structuredClone(f.response.compilation)
  omitted.segments.splice(omitted.segments.findIndex(s => s.id === "s-a-0002"), 1)
  assert.throws(() => assertPreparationMethod(f.ordinary, omitted, f.assertFact), /inspected_navigation_source_mismatch/)
})
