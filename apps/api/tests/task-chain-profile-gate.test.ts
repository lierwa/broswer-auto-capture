import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import test from "node:test"
import { createApplication } from "../src/app.js"
import { openFixture, projectRoot } from "./helpers.js"

const headers = { host: "127.0.0.1:4175", origin: "http://127.0.0.1:4175", "sec-fetch-site": "same-origin" }

test("专用浏览器阻止需占用浏览器的命令，退役调整命令在准入层拒绝", async () => {
  const fixture = await openFixture()
  await fixture.coordinator.close(); await fixture.store.close()
  const application = await createApplication({ root: projectRoot, directory: fixture.directory })
  try {
    const created = await application.app.inject({ method: "POST", url: "/api/tasks", headers,
      payload: { type: "create", requestId: randomUUID() } })
    const taskId = created.json<{ id: string }>().id
    application.browserProfile.isBusy = () => true
    const commands = [
      { type: "recover_preparation_compilation", requestId: randomUUID(), jobId: randomUUID(), expectedSequence: 0 },
      { type: "prepare_task", requestId: randomUUID(), requirementVersion: 1 },
      { type: "run_task", requestId: randomUUID(), release: { id: randomUUID(), version: 1,
        digest: "a".repeat(64) } },
    ]
    for (const payload of commands) {
      const response = await application.app.inject({ method: "POST", url: `/api/task-chain?taskId=${taskId}`,
        headers, payload })
      assert.equal(response.statusCode, 409)
      assert.equal(response.json<{ code: string }>().code, "browser_profile_busy")
    }
    for (const type of ["request_chain_adjustment", "recover_chain_adjustment",
      "accept_chain_adjustment", "reject_chain_adjustment", "cancel_chain_adjustment"] as const) {
      const response = await application.app.inject({ method: "POST", url: `/api/task-chain?taskId=${taskId}`,
        headers, payload: { type, requestId: randomUUID(), jobId: randomUUID(), executionId: randomUUID(),
          expectedSequence: 0 } })
      assert.equal(response.statusCode, 400)
      assert.equal(response.json<{ code: string }>().code, "invalid_request")
    }
    assert.deepEqual(application.taskChain.repository.jobs(taskId), [])
  } finally { await application.app.close(); await rm(fixture.directory, { recursive: true, force: true }) }
})
