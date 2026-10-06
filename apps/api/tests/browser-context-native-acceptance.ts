// 验证真实本地 Chrome 保存的原生来源经过生产 Python 编译→TS 物化→严格 runner 命令，零模型。
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { digestJson } from "@browser-capture/runtime"
import { materializeHybridPrefix } from "../src/upstream-browser/hybrid-prefix-materializer.js"
import { hybridCommandSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { materializeHybridWorkflowCommand } from "../src/upstream-browser/hybrid-runtime.js"
import { compilationProgress } from "../src/task-chain/authoring-build-progress.js"
import { assertBrowserContextOutput } from "../src/upstream-browser/hybrid-browser-context.js"
import { naturalPayloadContext } from "../src/upstream-browser/hybrid-natural-payload.js"
import { hybridNaturalRequestSchema } from "../src/upstream-browser/hybrid-schema.js"
import { validateHybridPrefixResponse } from "../src/upstream-browser/hybrid-prefix-schema.js"
import { projectRoot } from "./helpers.js"

test("真实新 tab 来源完整物化，普通命令用本次 tab 输出且保留覆盖事实", async () => {
  const plan = structuredClone(extractionFixture.plan), step = plan.steps[0]!
  plan.inputContract.schema = { type: "null" }; step.inputContract = plan.inputContract
  step.input = { source: "input", path: [] }
  plan.outputContract.schema = { type: "null" }; step.outputContract = plan.outputContract
  step.resultSpec = { contractVersion: "bat-result-spec/v1", mode: "execution" }
  const script = `import json, sys
from browser_use import Tools
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import NaturalCompilationRequest
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_prefix import compile_natural_prefix
from workflow_use.hybrid.__main__ import compilation_envelope
value = json.load(sys.stdin)
raw = json.load(open(value['source'], encoding='utf-8'))['request']
plan, step = value['plan'], value['plan']['steps'][0]
raw['requirement'].update(id=plan['requirement']['id'], version=plan['requirement']['version'], sourceDigest=plan['requirement']['digest'])
raw['plan'].update(id=plan['id'], version=plan['version'], stepId=step['id'], sourceDigest=value['planDigest'], resultSpec=step['resultSpec'])
for key in ('requirement', 'plan'):
    raw[key]['digest'] = digest({k:v for k,v in raw[key].items() if k != 'digest'})
request = NaturalCompilationRequest.model_validate(raw)
compilation = compile_natural_prefix(request, ActionRegistry.from_tools(Tools()))
print(json.dumps({'request': request.model_dump(mode='json', by_alias=True), 'response': compilation_envelope(request, compilation)}))`
  const python = path.join(projectRoot, "work/upstream-browser-hybrid/.venv", "Scripts/python.exe")
  const value = JSON.parse(execFileSync(python, ["-c", script], { cwd: projectRoot, encoding: "utf8", maxBuffer: 8_000_000,
    input: JSON.stringify({ plan, planDigest: digestJson(plan), source: path.join(projectRoot, "work/native-context-probe.json") }),
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", BROWSER_USE_SETUP_LOGGING: "false",
      ANONYMIZED_TELEMETRY: "false", BROWSER_USE_CLOUD_SYNC: "false", PYTHONPATH: ["apps/api/python",
        "vendor/workflow-use/workflows"].map(item => path.join(projectRoot, item)).join(path.delimiter) } }))
  const envelope = validateHybridPrefixResponse(value.response)
  const fragment = await materializeHybridPrefix({ ...value, plan, step, model: "unused" }, new AbortController().signal)
  assert.equal(fragment.nodes.length, 7)
  assert.equal(fragment.edges.length, 6)
  assert.equal("entry" in fragment, false)
  const progress = compilationProgress(envelope.compilation, value.request.trace)
  assert.deepEqual([progress.observedActions, progress.compiledActions, progress.pendingActions], [7, 7, 0])
  assert.deepEqual(progress.issues, [])
  const producer = envelope.compilation.segments.find(segment => segment.kind === "deterministic" && segment.outputs.length)!
  assert.equal(producer.kind, "deterministic")
  if (producer.kind !== "deterministic") throw new Error("producer_required")
  const delayed = structuredClone(producer)
  const completion = delayed.postconditions.find(condition => "clauseRef" in condition)
  if (!completion || !("clauseRef" in completion)) throw new Error("completion_required")
  completion.clauseRef = "later-completion-observation"
  assert.throws(() => assertBrowserContextOutput(delayed, hybridNaturalRequestSchema.parse(value.request),
    naturalPayloadContext(envelope, value.request)), /completion_mismatch/)
  for (const missing of [null, undefined]) {
    Object.assign(completion, { clauseRef: missing })
    assert.throws(() => assertBrowserContextOutput(delayed, hybridNaturalRequestSchema.parse(value.request),
      naturalPayloadContext(envelope, value.request)), /completion_mismatch/)
  }
  const request = hybridNaturalRequestSchema.parse(value.request), payload = naturalPayloadContext(envelope, value.request)
  const recorded = request.trace.actions.find(action => `s-${action.id}` === producer.id)!
  const post = request.trace.observations.find(observation => observation.id === recorded.postObservationRef)!
  Object.assign(completion, { clauseRef: post.facts.find(fact => fact.kind === "browser_context")!.id })
  assert.throws(() => assertBrowserContextOutput(delayed, request, payload), /completion_mismatch/)
  const falseState = structuredClone(producer)
  const previousUrl = request.trace.observations.find(observation => observation.id === recorded.preObservationRef)!.url
  const falseAuthority = previousUrl === post.url ? { changed: true as const } : { unchanged: true as const }
  falseState.postconditions = [{ kind: "url_digest", ...falseAuthority,
    clauseRef: post.facts.find(fact => fact.kind === "url_digest")!.id }]
  assert.throws(() => assertBrowserContextOutput(falseState, request, payload), /completion_mismatch/)
  const switches = fragment.nodes.filter(node => node.kind === "capability" && node.config
    && typeof node.config === "object" && !Array.isArray(node.config) && node.config.actionName === "switch")
  assert.equal(switches.length, 2)
  for (const node of switches) {
    assert.equal(node.kind, "capability")
    if (node.kind !== "capability") throw new Error("capability_required")
    const binding = node.input.tab_id!
    assert.equal(binding.source, "node")
    if (binding.source !== "node") throw new Error("node_binding_required")
    assert.deepEqual(binding.path, ["tabId"])
    const producer = fragment.nodes.find(item => item.id === binding.nodeId)!
    assert.equal(producer.kind, "capability")
    const producerConfig = (producer as typeof node).config as Record<string, unknown>
    assert.equal(producerConfig.browserContextOutput, true)
    const config = structuredClone(node.config) as Record<string, unknown>
    delete config.runtimeScopeFrom
    const command = hybridCommandSchema.parse({ ...node.capability,
      ...materializeHybridWorkflowCommand(config, { tab_id: "this-run-full-target-1234" }) })
    assert.equal(command.name, "browser.workflow-step")
    assert.equal("args" in command && command.args.tab_id, "this-run-full-target-1234")
    assert.equal("browserContextOutput" in command, false)
  }
})
