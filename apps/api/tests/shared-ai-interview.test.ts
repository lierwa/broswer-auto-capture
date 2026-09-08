import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createAIWithStorage, localStore } from "@agent-platform/ai-connect/server"
import { openLocalStore } from "@agent-platform/ai-connect/integration/storage/local"
import { ProviderConnectionStore } from "@agent-platform/ai-connect/integration/provider-connection/store"
import { createPiBuiltinProvider } from "@agent-platform/ai-connect/integration/provider/pi-builtin-provider"
import { listModelIntegrations } from "@agent-platform/ai-connect/integration/provider-connection/integrations"
import { ProductStore } from "../src/database/store.js"
import { InterviewCoordinator } from "../src/interview/coordinator.js"
import { createAIModelProvider } from "../src/ai/model.js"
import { draft } from "./helpers.js"

test("保存共享选择后访谈走公共结构调用与事件链，失败不回退 Codex", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-shared-ai-"))
  const originalFetch = globalThis.fetch
  const subjectId = "browser-capture-local-user"
  let store: ProductStore | undefined, coordinator: InterviewCoordinator | undefined
  try {
    const storage = await openLocalStore(localStore({ directory: path.join(directory, "ai") }))
    const connections = new ProviderConnectionStore(storage)
    const provider = createPiBuiltinProvider("openai")
    const model = provider.getModels().find((item) => item.id === "gpt-5.6-sol")!
    const integration = listModelIntegrations().find((item) => item.providerId === provider.id && item.authMethod === "api")!
    const account = await connections.create({ subjectId, kind: "official", integrationId: integration.id,
      vendorId: "openai", displayName: "Fixture", providerId: provider.id, protocol: "pi-builtin",
      credential: { type: "api", key: "fixture-secret" },
    })
    await connections.replaceVerifiedModels({ subjectId, connectionId: account.id, models: [{ modelId: model.id,
      name: model.name, api: model.api, baseURL: model.baseUrl, contextWindow: model.contextWindow,
      maxTokens: model.maxTokens, reasoning: model.reasoning,
    }] })
    const ai = createAIWithStorage(storage)
    store = await ProductStore.open(directory)
    store.saveSharedModelSelection(subjectId, { connectionId: account.id, modelId: model.id, reasoningEffort: "medium" })
    let providerCalls = 0
    let responseText = JSON.stringify({ assistantText: "范围已整理。", question: null, draft })
    globalThis.fetch = async (url, init) => {
      providerCalls += 1
      const request = new Request(url, init)
      assert.equal(request.headers.get("authorization"), "Bearer fixture-secret")
      assert.equal((await request.json()).model, "gpt-5.6-sol")
      return responsesStream(responseText, model.id)
    }
    coordinator = new InterviewCoordinator(store, createAIModelProvider(ai, store, subjectId))
    const id = coordinator.taskAction({ type: "create", requestId: randomUUID() })
    const send = (text: string) => coordinator!.dispatch(id, { type: "message", requestId: randomUUID(),
      expectedRevision: store!.snapshot(id).revision, text,
    })
    send("采集公开商品评价"); await coordinator.waitForIdle()
    const completed = store.snapshot(id)
    assert.equal(completed.drafts.length, 1, completed.turns.at(-1)?.reason ?? "")
    assert.deepEqual(completed.messages.at(-1)?.aiEvents.map((event) => event.type),
      ["generation.started", "text.delta", "generation.completed"])

    responseText = "{bad"
    send("把范围改为公开在售商品"); await coordinator.waitForIdle()
    const failed = store.snapshot(id)
    assert.equal(failed.messages.at(-1)?.status, "failed")
    assert.deepEqual(failed.messages.at(-1)?.aiEvents.map((event) => event.type),
      ["generation.started", "text.delta", "generation.failed"])
    assert.equal(providerCalls, 2)
    ai.close()
  } finally {
    globalThis.fetch = originalFetch
    await coordinator?.close(); await store?.close(); await rm(directory, { recursive: true, force: true })
  }
})

function responsesStream(text: string, model: string) {
  const message = { id: "fixture-message", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  }
  const response = { id: "fixture-response", object: "response", created_at: 1, status: "completed", model,
    output: [message], usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5,
      input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 },
    },
  }
  const events = [
    { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...message, status: "in_progress", content: [] } },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text },
    { type: "response.output_item.done", output_index: 0, item: message },
    { type: "response.completed", response },
  ]
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } })
}
