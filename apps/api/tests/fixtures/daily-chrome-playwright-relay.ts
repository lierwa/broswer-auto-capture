/** Real managed product relay; synthetic pages, owned fixture or explicitly enabled saved daily binding. */
import { createServer } from "node:http"
import { once } from "node:events"
import path from "node:path"
import { access, stat } from "node:fs/promises"
import { createInterface } from "node:readline"
import { randomUUID } from "node:crypto"
import assert from "node:assert/strict"
import { CDPRelayServer } from "../../../../vendor/daily-chrome-extension/cdpRelay.js"
import { DailyChromeExtension } from "../../src/browser/daily-extension.js"
import { PythonUpstreamBrowserRuntime } from "../../src/upstream-browser/python-runtime.js"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { capabilityEffectChain, requestFor } from "../../../../packages/runtime/tests/task-chain-fixtures.js"
import { z } from "zod"

const fixture = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html" })
  response.end('<title>B-A-T fixture</title><button onclick="this.textContent=\'done\'">probe</button>')
})
fixture.listen(0, "127.0.0.1")
await once(fixture, "listening")
const fixtureUrl = `http://127.0.0.1:${(fixture.address() as { port: number }).port}/fixture`
const write = (facts: unknown) => process.stdout.write(JSON.stringify(facts) + "\n")
async function closeFixture() {
  fixture.closeAllConnections()
  await new Promise<void>(resolve => fixture.close(() => resolve()))
}
if (process.env.BAT_SAVED_DAILY_PROOF === "1") await savedDailyProof()
else if (process.env.BAT_TEST_PROFILE) await authorizationProbe()
else {
  const relay = new CDPRelayServer("chrome", undefined, undefined, undefined,
    { extensionId: process.env.BAT_TEST_EXTENSION_ID! })
  await relay.start()
  write({ cdpUrl: relay.cdpEndpoint(), extensionUrl: relay.extensionEndpoint(), fixtureUrl })
  void relay.extensionReady().then(() => write({ extensionHandshake: true }))
  process.stdin.resume()
  process.stdin.once("end", async () => { await relay.close(); await closeFixture() })
}

async function savedDailyProof() {
  const directory = path.join(process.cwd(), "work/daily-chrome-p0/real-daily-runtime")
  const manager = new DailyChromeExtension(process.cwd(), path.join(process.cwd(), "data"), () => {})
  let stage = "saved_authorization"
  try {
    assert.equal((await manager.snapshot()).paired, true)
    stage = "extension_connect"
    await manager.endpoint()
    assert.equal((await manager.snapshot()).connected, true)
    stage = "runtime_replay"
    write({ dailyProfileAcceptance: true, status: "passed", savedAuthorizationReused: true,
      ...(await runtimeProof(manager, directory, 1)) })
  } catch (error) {
    write({ dailyProfileAcceptance: true, status: "failed", stage,
      failureType: error instanceof Error ? error.name : "unknown", code: (error as { code?: string }).code ?? null })
    process.exitCode = 1
  } finally { manager.close(); await closeFixture() }
}

async function authorizationProbe() {
  const profile = process.env.BAT_TEST_PROFILE!, directory = path.join(profile, "bat-test-data")
  const create = () => {
    const manager = new DailyChromeExtension(process.cwd(), directory, () => {})
    // 只替换测试 Chrome 的位置；消费实际 Profile 元数据、relay、launcher 和凭据存储。
    const location = manager as unknown as { dataRoot(): string; executable(): Promise<string> }
    location.dataRoot = () => profile
    location.executable = async () => process.env.BAT_TEST_EXECUTABLE!
    // Headless Chromium 初次未生成 Local State 的 profile.info_cache；这里只提供合成名称元数据。
    // 实际目录、token localStorage、Chrome Singleton、连接及凭据仍使用同一个真实 Profile。
    manager.profiles = async () => {
      await access(path.join(profile, "Default"))
      return [{ id: "Default", name: "Owned integration fixture" }]
    }
    return manager
  }
  let manager = create()
  write({ fixtureUrl, authorizationReady: true })
  for await (const line of createInterface({ input: process.stdin })) {
    const command = JSON.parse(line)
    try {
      if (command.op === "pair") {
        await manager.pair({ profileDirectory: "Default", token: command.token })
        const permissions = await stat(path.join(directory, "daily-chrome/auth.json"))
        assert.equal(permissions.mode & 0o777, 0o600)
        const state = await manager.snapshot()
        assert.equal("token" in state, false)
        write({ paired: state.paired, connected: state.connected, privateCredentials: true, cdpUrl: await manager.endpoint() })
      } else if (command.op === "runtime") write(await runtimeProof(manager, directory))
      else if (command.op === "reload") {
        manager.close(); manager = create()
        const endpoint = await manager.endpoint(), state = await manager.snapshot()
        write({ durableAuthorization: state.paired && state.connected, cdpUrl: endpoint })
      } else if (command.op === "revoke") {
        await manager.revoke()
        const state = await manager.snapshot()
        assert.equal(await manager.endpoint(), undefined)
        write({ revoked: !state.paired && !state.connected })
      } else if (command.op === "old-token") {
        await assert.rejects(manager.endpoint(), /扩展未能连接/)
        write({ oldTokenRejected: true })
      } else if (command.op === "close") {
        manager.close(); write({ closed: true })
      } else throw new Error("unknown_probe_command")
    } catch (error) { write({ failed: true, failureType: error instanceof Error ? error.name : "unknown",
      code: (error as { code?: unknown }).code ?? null,
      assertion: error instanceof assert.AssertionError ? { actual: error.actual, expected: error.expected,
        location: error.stack?.split("\n").slice(1, 4).map(line => line.replace(process.cwd(), "checkout")) } : null,
      fields: error instanceof z.ZodError ? error.issues.map(issue => ({ path: issue.path, code: issue.code })) : [] }) }
  }
  manager.close()
  await closeFixture()
}

async function runtimeProof(manager: DailyChromeExtension, directory: string, repetitions = 2) {
  const chain = capabilityEffectChain(), parentId = randomUUID()
  chain.entry = "capability"; chain.nodes = chain.nodes.filter(node => node.id !== "observe")
  chain.edges = chain.edges.filter(edge => edge.from !== "observe"); chain.budget.maxLlmCalls = 0
  const node = chain.nodes.find(node => node.id === "capability")!
  if (node.kind !== "capability") throw new Error("fixture_capability_missing")
  node.input = { url: { source: "constant", value: fixtureUrl }, new_tab: { source: "constant", value: false } }
  node.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }
  const upstream = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory, subject: {} as never,
    dailyChromeEndpoint: () => manager.endpoint() })
  try {
    for (let index = 0; index < repetitions; index++) {
      const ownerId = randomUUID()
      const run = await upstream.withCapabilities({ ownerId, connectionOwnerId: parentId, browserMode: "daily",
        signal: new AbortController().signal, allowedOrigins: [new URL(fixtureUrl).origin],
        managedWindow: { ownerId, resume: false }, onCleanup: report => {
          if (report.status !== "confirmed") throw new Error("product_cleanup_unconfirmed")
        } }, capabilities =>
        new TaskChainRuntime().execute({ chain, request: requestFor(chain, null, "replay", randomUUID(), randomUUID()),
          capabilities: { ...capabilities, llm: async () => { throw new Error("ordinary_node_called_model") } } }))
      assert.equal(run.status, "completed")
      assert.equal(run.consumed.llmCalls, 0)
      assert.deepEqual(run.modelCalls, []); assert.equal(run.auditComplete, true)
    }
  } finally { assert.equal((await upstream.close()).status, "confirmed") }
  return { runtime: "LangGraph", replayRuns: repetitions, modelCalls: 0, auditComplete: true, cleanup: "confirmed" }
}
