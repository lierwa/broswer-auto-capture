import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { digestJson } from "@browser-capture/runtime"
import { type ValueSchema } from "@browser-capture/contracts"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { materializeHybridPrefix } from "../src/upstream-browser/hybrid-prefix-materializer.js"
import { compilationPayloadSchema, confirmationBudget } from "../src/upstream-browser/hybrid-compilation-checkpoint.js"
import { projectRoot } from "./helpers.js"

test("500 动作上界的纯前缀计算与物化处于单包和确认预算内", async context => {
  const plan = structuredClone(extractionFixture.plan), step = plan.steps[0]!
  const schema: ValueSchema = { type: "array", items: { type: "object", properties: { title: { type: "string" } },
    required: ["title"], additionalProperties: false } }
  plan.inputContract.schema = { type: "null" }; step.inputContract = plan.inputContract
  plan.outputContract.schema = schema; step.outputContract = plan.outputContract
  step.resultSpec = { contractVersion: "bat-result-spec/v1", mode: "data", schema,
    fields: [{ path: [], description: "Visible records", producerRef: "records" }], derivations: [], edgeCases: [] }
  const python = path.join(projectRoot, "work/upstream-browser-hybrid/.venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
  const value = JSON.parse(execFileSync(python, ["apps/api/tests/fixtures/prefix_benchmark.py"], {
    cwd: projectRoot, input: JSON.stringify({ plan, planDigest: digestJson(plan) }), encoding: "utf8", maxBuffer: 16_000_000,
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false",
      PYTHONPATH: ["apps/api/python", "vendor/workflow-use/workflows"].map(item => path.join(projectRoot, item)).join(path.delimiter) },
  })) as { payload: string; pythonMs: number; bytes: number }
  assert.ok(value.bytes <= 8_000_000)
  const started = performance.now(), payload = compilationPayloadSchema.parse(JSON.parse(value.payload))
  assert.equal(payload.response.compilation.gaps.length, 0)
  const graph = await materializeHybridPrefix({ response: payload.response, request: JSON.parse(payload.canonicalRequest),
    plan, step, model: "unused" }, new AbortController().signal)
  const hostMs = performance.now() - started
  assert.equal(graph.nodes.length, 500)
  assert.equal(graph.edges.length, 499)
  assert.ok(hostMs < confirmationBudget(payload))
  context.diagnostic(`actions=500 bytes=${value.bytes} pythonMs=${value.pythonMs.toFixed(1)} hostMs=${hostMs.toFixed(1)}`)
})
