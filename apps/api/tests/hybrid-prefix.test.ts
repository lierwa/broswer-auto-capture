// 不变量：生产 Python 前缀经同一 TS 证据/节点校验，不冒充终态，不改变完整物化。
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { digestJson } from "@browser-capture/runtime"
import { type JsonValue, type ValueSchema } from "@browser-capture/contracts"
import { materializeHybridPrefix } from "../src/upstream-browser/hybrid-prefix-materializer.js"
import { materializeHybridChain, validateHybridResponse } from "../src/upstream-browser/hybrid-materializer.js"
import { validateHybridPrefixResponse } from "../src/upstream-browser/hybrid-prefix-schema.js"
import { projectRoot } from "./helpers.js"

const schema: ValueSchema = { type: "array", items: { type: "object", properties: {
  title: { type: "string" }, url: { type: "string" } }, required: ["title", "url"], additionalProperties: false } }

function fixture() {
  const plan = structuredClone(extractionFixture.plan), step = plan.steps[0]!
  plan.inputContract.schema = { type: "null" }; step.inputContract = plan.inputContract
  step.input = { source: "input", path: [] }
  plan.outputContract.schema = schema; step.outputContract = plan.outputContract
  step.resultSpec = { contractVersion: "bat-result-spec/v1", mode: "data", schema,
    fields: [{ path: [], description: "Read records", producerRef: "records" }], derivations: [], edgeCases: [] }
  const python = path.join(projectRoot, "work/upstream-browser-hybrid/.venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
  const script = `import json, sys
from test_natural_repeat import method_case, PAGE1
from test_method_source_compile import method_source
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.__main__ import compilation_response, compilation_envelope
from workflow_use.hybrid.natural_prefix import compile_natural_prefix
from workflow_use.hybrid.source_response import canonical_json
value = json.load(sys.stdin)
plan, step = value['plan'], value['plan']['steps'][0]
request, registry, schema, _read = method_source(case=method_case(PAGE1, 'a-0001'), schema=step['outputContract']['schema'])
raw = request.model_dump(mode='json', by_alias=True)
raw['requirement'].update(id=plan['requirement']['id'], version=plan['requirement']['version'], sourceDigest=plan['requirement']['digest'])
raw['plan'].update(id=plan['id'], version=plan['version'], stepId=step['id'], sourceDigest=value['planDigest'], resultSpec=step['resultSpec'])
for key in ('requirement', 'plan'):
    raw[key]['digest'] = digest({k:v for k,v in raw[key].items() if k != 'digest'})
request = type(request).model_validate(raw)
final = {'request': request.model_dump(mode='json', by_alias=True), 'response': compilation_response(request, registry, output_schema=schema)}
body = request.trace.model_dump(mode='json', exclude={'digest'})
body.update(completed=False, finalResultRef=None, actions=body['actions'][:1], observations=body['observations'][:2])
request.trace = type(request.trace).model_validate({**body, 'digest': digest(body)})
prefix = compile_natural_prefix(request, registry, output_schema=schema)
print(json.dumps({'request': request.model_dump(mode='json', by_alias=True), 'response': compilation_envelope(request, prefix), 'final': final}))`
  const result = JSON.parse(execFileSync(python, ["-c", script], { cwd: projectRoot,
    input: JSON.stringify({ plan, planDigest: digestJson(plan) }), encoding: "utf8", maxBuffer: 8_000_000,
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false",
      PYTHONPATH: ["apps/api/python", "vendor/workflow-use/workflows", "vendor/workflow-use/workflows/tests"]
        .map(item => path.join(projectRoot, item)).join(path.delimiter) } })) as {
    request: Record<string, JsonValue>; response: unknown;
    final: { request: Record<string, JsonValue>; response: unknown }
  }
  return { ...result, plan, step, model: "unused", version: 1 }
}

test("生产 Python 前缀在未完成时生成严格节点，最终入口拒绝前缀", async () => {
  const value = fixture(), before = structuredClone(value)
  const fragment = await materializeHybridPrefix(value, new AbortController().signal)
  assert.equal(fragment.nodes.length, 1)
  assert.equal(fragment.nodes[0]!.kind, "capability")
  assert.deepEqual(fragment.edges, [])
  assert.equal("entry" in fragment, false)
  assert.deepEqual(value, before)
  assert.throws(() => validateHybridResponse(value.response))
  assert.throws(() => materializeHybridChain(value))
  const final = materializeHybridChain({ ...value, ...value.final })
  assert.deepEqual(fragment.nodes[0], final.nodes.find(node => node.id === fragment.nodes[0]!.id))
})

test("前缀拒绝修改摘要、来源身份、提前完成和取消后的计算", async () => {
  const value = fixture(), envelope = validateHybridPrefixResponse(value.response)
  const invalid = structuredClone(envelope); invalid.compilation.segments[0]!.id = "forged"
  assert.throws(() => validateHybridPrefixResponse(invalid), /digest_mismatch/)
  assert.throws(() => validateHybridPrefixResponse({ ...envelope, compilation: {
    ...envelope.compilation, controlGraph: { entry: "s-a-0001", edges: [], terminals: [] } } }))
  await assert.rejects(() => materializeHybridPrefix({ ...value,
    plan: { ...value.plan, version: value.plan.version + 1 } }, new AbortController().signal), /source_mismatch/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(() => materializeHybridPrefix(value, controller.signal), /abort/i)
})
