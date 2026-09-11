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
import { createApplication } from "../src/app.js"
import { InterviewCoordinator } from "../src/interview/coordinator.js"
import { createAIModelProvider, requireAgentSessionSelection } from "../src/ai/model.js"
import { loadInterviewSkill } from "../src/interview/protocol.js"
import { authoredInterview, draft, projectRoot } from "./helpers.js"

test("保存共享选择后访谈走 Pi Main 的 canonical history 与公共事件链，失败不回退", async () => {
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
    const selection = { connectionId: account.id, modelId: model.id, reasoningEffort: "medium" as const }
    await requireAgentSessionSelection(ai, subjectId, selection)
    store.saveSharedModelSelection(subjectId, selection)
    let providerCalls = 0
    const providerRequests: unknown[] = []
    const authored = authoredInterview({ assistantText: "范围已整理。", question: null, draft })
    assert.equal(authored.type, "turn_succeeded")
    if (authored.type !== "turn_succeeded") throw new Error("fixture authoring missing")
    let responseText = authored.outputText
    globalThis.fetch = async (url, init) => {
      providerCalls += 1
      const request = new Request(url, init)
      assert.equal(request.headers.get("authorization"), "Bearer fixture-secret")
      const body = await request.json() as { model?: unknown; tools?: unknown }
      providerRequests.push(body)
      assert.equal(body.model, "gpt-5.6-sol")
      assert.ok(body.tools === undefined || Array.isArray(body.tools) && body.tools.length === 0)
      return responsesStream(responseText, model.id)
    }
    coordinator = new InterviewCoordinator(store, createAIModelProvider(ai, store, subjectId, {
      cwd: projectRoot, stateDir: path.join(directory, "pi-agent-session"),
    }), loadInterviewSkill(projectRoot))
    const id = coordinator.taskAction({ type: "create", requestId: randomUUID() })
    const send = (text: string) => coordinator!.dispatch(id, { type: "message", requestId: randomUUID(),
      expectedRevision: store!.snapshot(id).revision, text,
    })
    send("采集公开商品评价"); await coordinator.waitForIdle()
    const completed = store.snapshot(id)
    assert.equal(completed.drafts.length, 1, completed.turns.at(-1)?.reason ?? "")
    assert.deepEqual(completed.messages.at(-1)?.aiEvents.filter((event) => event.type !== "extension").map((event) => event.type),
      ["generation.started", "text.delta", "generation.completed"])
    assert.match(JSON.stringify(providerRequests[0]), /本轮只形成可确认的任务需求/)
    assert.doesNotMatch(JSON.stringify(providerRequests[0]), /每次复跑创建独立运行/)

    responseText = "<authoring><interview-result>{bad</interview-result></authoring>"
    send("把范围改为公开在售商品"); await coordinator.waitForIdle()
    const failed = store.snapshot(id)
    assert.equal(failed.messages.at(-1)?.status, "failed")
    assert.deepEqual(failed.messages.at(-1)?.aiEvents.filter((event) => event.type !== "extension").map((event) => event.type),
      ["generation.started", "text.delta", "generation.completed"])
    assert.match(JSON.stringify(providerRequests[1]), /<authoring><interview-result>/)
    assert.equal(providerCalls, 2)
    ai.close()
  } finally {
    globalThis.fetch = originalFetch
    await coordinator?.close(); await store?.close(); await rm(directory, { recursive: true, force: true })
  }
})

test("AgentSession 选择门拒绝 managed profile 且保留原连接", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-managed-selection-"))
  const subjectId = "browser-capture-local-user"
  let application: Awaited<ReturnType<typeof createApplication>> | undefined
  try {
    const storage = await openLocalStore(localStore({ directory: path.join(directory, "ai") }))
    const connections = new ProviderConnectionStore(storage)
    const account = await connections.create({ subjectId, kind: "official", integrationId: "openai-codex:oauth",
      vendorId: "openai", displayName: "Legacy fixture", providerId: "openai-codex", protocol: "codex-managed-profile",
      credential: { type: "oauth", managedProfile: { driver: "codex-app-server", profileId: "fixture-profile", revision: 1 } },
    })
    await connections.replaceVerifiedModels({ subjectId, connectionId: account.id, models: [{ modelId: "gpt-5.6-sol",
      name: "gpt-5.6-sol", api: "codex-app-server", baseURL: "", contextWindow: 200_000, maxTokens: 32_000,
      reasoning: true,
    }] })
    const ai = createAIWithStorage(storage)
    await assert.rejects(requireAgentSessionSelection(ai, subjectId, {
      connectionId: account.id, modelId: "gpt-5.6-sol", reasoningEffort: "medium",
    }), /model_account_execution_surface_unsupported/)
    application = await createApplication({ root: projectRoot, directory: path.join(directory, "app"), ai })
    const response = await application.app.inject({ method: "PUT", url: "/api/model-settings", headers: {
      host: "127.0.0.1:4175", origin: "http://127.0.0.1:4175", "sec-fetch-site": "same-origin",
    }, payload: { selection: { connectionId: account.id, modelId: "gpt-5.6-sol", reasoningEffort: "medium" } } })
    assert.equal(response.statusCode, 409)
    assert.equal(response.json().code, "model_account_execution_surface_unsupported")
    assert.equal(application.store.sharedModelSelection(subjectId), undefined)
    assert.equal((await connections.resolveModelAccount({ subjectId, connectionId: account.id })).connection.protocol,
      "codex-managed-profile")
  } finally {
    await application?.app.close()
    await rm(directory, { recursive: true, force: true })
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
