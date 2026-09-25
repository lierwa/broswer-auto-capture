import assert from "node:assert/strict"
import test from "node:test"
import { incompatibleSourceRegistry } from "../src/task-chain/hybrid-source-reuse.js"
import { UpstreamProtocolError } from "../src/upstream-browser/service.js"

test("只有明确的旧动作schema不兼容才允许重新采集来源", () => {
  assert.equal(incompatibleSourceRegistry(new UpstreamProtocolError("hybrid_runner_failed",
    "ValueError:hybrid_action_registry_mismatch")), true)
  assert.equal(incompatibleSourceRegistry(new UpstreamProtocolError("hybrid_runner_failed",
    "ValueError:hybrid_output_schema_mismatch")), false)
  assert.equal(incompatibleSourceRegistry(new Error("upstream_runner_closed:1")), false)
  assert.equal(incompatibleSourceRegistry(new Error("ValueError:hybrid_action_registry_mismatch")), false)
})
