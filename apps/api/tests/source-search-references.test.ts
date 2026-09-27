import assert from "node:assert/strict"
import test from "node:test"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { PI_AGENT_SESSION_AI_EVENT_NAMESPACE } from "@agent-platform/pi-agent-session"
import type { SourceResolution } from "@browser-capture/contracts/interview"
import { candidateId } from "../src/interview/source-search-evidence.js"
import { createSourceResolutionTools, PiSourceSearchObserver, ReadOnlySourceResolver,
  type SourceSearch } from "../src/interview/source-resolution.js"

type ToolView = { content: Array<{ text: string }>; details: SourceSearch }
const rss = (url: string) => `<rss><channel><item><title>Acme</title><link>${url}</link></item></channel></rss>`

test("同词两次后备搜索只接受指定可见调用的结果", async () => {
  let sequence = 0
  const resolver = new ReadOnlySourceResolver(async () => new Response(rss(
    ++sequence === 1 ? "https://first.example/" : "https://second.example/"), { status: 200 }))
  let resolution: SourceResolution | undefined
  const tools = createSourceResolutionTools({ resolver, revision: 3, questionId: "question-source",
    onSearch: () => undefined, onResolution: (value) => { resolution = value } })
  const first = await tools[0]!.execute("first", { subject: "Acme", query: "Acme" }) as ToolView
  const second = await tools[0]!.execute("second", { subject: "Acme", query: "Acme" }) as ToolView
  const visibleFirst = JSON.parse(first.content[0]!.text) as { searchId: string; results: Array<{ id: string }> }
  assert.equal(visibleFirst.searchId, first.details.id)
  assert.equal(visibleFirst.results[0]!.id, first.details.candidates[0]!.id)
  const proposal = { subject: "Acme", query: "Acme", searchId: second.details.id,
    candidateIds: [first.details.candidates[0]!.id] }
  await assert.rejects(tools[1]!.execute("wrong-call", proposal), /candidate_reference_invalid/)
  await assert.rejects(tools[1]!.execute("wrong-query", { ...proposal, searchId: first.details.id,
    query: "Acme other" }), /search_reference_invalid/)
  await tools[1]!.execute("right", { ...proposal, searchId: first.details.id })
  assert.equal(resolution?.searchId, first.details.id)
  assert.equal(resolution?.provider, "bing_rss")
  assert.equal(resolution?.outcome, "unique")
  assert.equal(resolution?.candidates[0]?.url, "https://first.example/")
})

test("原生搜索的旁听 ID 先经公开工具展示，才允许精确提案", async () => {
  const piSearches = new PiSourceSearchObserver()
  const envelope = { invocationId: "invocation-pi", createdAt: 1, type: "extension" as const,
    namespace: PI_AGENT_SESSION_AI_EVENT_NAMESPACE, version: 1 as const }
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 0, name: "tool.execution.started", payload: {
    type: "tool.execution.started", callId: "call-pi", toolName: "web_search", input: { query: "Acme" },
  } }))
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 1, name: "tool.execution.completed", payload: {
    type: "tool.execution.completed", callId: "call-pi", toolName: "web_search", output: {
      content: [{ type: "text", text: "1. Acme Official\nhttps://acme.example/" }],
      details: { queries: ["Acme"], successfulQueries: 1 },
    },
  } }))
  let resolution: SourceResolution | undefined
  const tools = createSourceResolutionTools({ resolver: new ReadOnlySourceResolver(), piSearches,
    revision: 2, questionId: "question-pi", onSearch: () => undefined,
    onResolution: (value) => { resolution = value } })
  const proposal = { subject: "Acme", query: "Acme", searchId: "pi:call-pi",
    candidateIds: [candidateId("https://acme.example/")] }
  await assert.rejects(tools[1]!.execute("hidden", proposal), /search_reference_invalid/)
  const visible = await tools[2]!.execute("list", {}) as { content: Array<{ text: string }> }
  const listed = JSON.parse(visible.content[0]!.text) as { searches: Array<{ searchId: string; results: Array<{ id: string }> }> }
  assert.equal(listed.searches[0]!.searchId, proposal.searchId)
  assert.equal(listed.searches[0]!.results[0]!.id, proposal.candidateIds[0])
  await tools[1]!.execute("proposal", proposal)
  assert.equal(resolution?.searchId, "pi:call-pi")
  assert.equal(resolution?.provider, "pi-web-access:web_search")
  assert.equal(resolution?.candidates[0]?.url, "https://acme.example/")
})
