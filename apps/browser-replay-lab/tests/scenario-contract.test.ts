import assert from "node:assert/strict"
import test from "node:test"
import { expectedByScenario } from "../src/fixture-oracles.js"
import { scenarioIds, scenarioOracleSchema } from "../src/scenario-contract.js"
import { scenarioRegistry } from "../src/scenario-registry.js"

test("D1 registry fixes exactly the 25 documented scenario ids", () => {
  assert.equal(scenarioIds.length, 25)
  assert.deepEqual(scenarioRegistry.map((value) => value.scenarioId), [...scenarioIds])
  assert.equal(new Set(scenarioIds).size, 25)
})

test("every scenario owns one parseable oracle expectation", () => {
  assert.deepEqual(Object.keys(expectedByScenario).sort(), [...scenarioIds].sort())
  for (const scenarioId of scenarioIds) {
    const expected = expectedByScenario[scenarioId]
    assert.doesNotThrow(() => scenarioOracleSchema.parse({ scenarioId,
      targetDispatches: 0, preparationDispatches: 0, nativeDialogs: 0,
      trustedEvents: 0, scrollEvents: 0, businessEffects: 0, lastEventTarget: null, ...expected }))
  }
})

test("unknown interference never has a successful oracle", () => {
  for (const scenarioId of ["native-confirm-unexpected", "native-prompt-unexpected",
    "portal-modal-unexpected", "cross-origin-iframe-overlay"] as const) {
    assert.notEqual(expectedByScenario[scenarioId].expectedStatus, "completed")
    assert.ok(expectedByScenario[scenarioId].expectedCode)
  }
})
