import test from "node:test"
import assert from "node:assert/strict"
import { createCodexAppServerClient } from "../src/client.js"
import { routeFor } from "../src/routes.js"
import { FakeTransport } from "./fake-transport.js"

for (const purpose of ["exploration", "explicit_llm"] as const) test(`${purpose} 在线协议发送并核验对应 model/effort`, async () => {
  const route = routeFor(purpose)
  const transport = new FakeTransport((message, target) => {
    const reply = (result: unknown) => target.push({ id: message.id, result })
    if (message.method === "initialize") reply({})
    if (message.method === "account/read") reply({ account: { type: "chatgpt", email: "fixture@example.com", planType: "pro" }, requiresOpenaiAuth: true })
    if (message.method === "thread/start") { assert.equal(Reflect.get(message.params, "model"), route.model); reply({ thread: { id: "thread", ephemeral: true }, model: route.model, reasoningEffort: route.effort }) }
    if (message.method === "turn/start") {
      assert.equal(Reflect.get(message.params, "model"), route.model); assert.equal(Reflect.get(message.params, "effort"), route.effort)
      reply({ turn: { id: "turn" } })
      target.push({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", id: "message", text: "{}", phase: "final_answer" }] } } })
    }
  })
  const client = createCodexAppServerClient({ cwd: "D:/work/browser-capture-tool", purpose, transportFactory: () => transport })
  try {
    const events = []; for await (const event of client.runTurn("fixture", {})) events.push(event)
    const event = events.at(-1)!; assert.equal(event.type, "turn_succeeded")
    if (event.type === "turn_succeeded") { assert.equal(event.audit.requestedModel, route.model); assert.equal(event.audit.reportedEffort, route.effort) }
  } finally { await client.close() }
})
