import assert from "node:assert/strict"
import test from "node:test"
import { RunnerProcess } from "../src/upstream-browser/service.js"

const ownerId = "a81d8a80-50ae-48aa-a06c-558ccf08f76a"
const endpoint = "ws://127.0.0.1:9222/devtools/browser/test-browser"
const config = { allowedOrigins: ["https://example.test"], profilePath: "/tmp/bat-connection-metadata/default",
  headless: false, managedWindow: { ownerId, resume: false } }

function harness(resolvedEndpoint?: string) {
  let launches = 0
  const requests: unknown[] = []
  const runner = new RunnerProcess(process.cwd(), new AbortController().signal, undefined,
    { resolveBrowserEndpoint: async () => resolvedEndpoint })
  runner.envValue = () => undefined
  const launchable = runner as unknown as { launch(script: string): Promise<void> }
  launchable.launch = async () => { launches++ }
  runner.request = async (request) => { requests.push(request); return null }
  return { runner, requests, launches: () => launches }
}

// WHY：配置丢失时必须显式报连接缺失，不能悄悄另起一个没有用户登录态的私有浏览器。
test("missing daily Chrome connection fails before launching a private browser", async () => {
  const h = harness()
  await assert.rejects(h.runner.startHybrid(config), /hybrid_existing_browser_endpoint_required/)
  assert.equal(h.launches(), 0)
  assert.equal(h.requests.length, 0)
})

test("native daily Chrome endpoint is used with the product owner", async () => {
  const h = harness(endpoint)
  await h.runner.startHybrid(config)
  assert.equal(h.launches(), 1)
  assert.equal(h.requests.length, 1)
  const request = h.requests[0] as { config: Record<string, unknown> }
  assert.deepEqual(request.config.existingBrowser, { cdpUrl: endpoint, ownerId, resume: false })
  assert.equal(request.config.managedWindow, undefined)
})

test("an explicit attached connection is not overwritten by an environment override", async () => {
  const h = harness()
  h.runner.envValue = () => "ws://127.0.0.1:9333/devtools/browser/other-browser"
  await h.runner.startHybrid({ ...config, managedWindow: undefined,
    existingBrowser: { cdpUrl: endpoint, ownerId, resume: true } })
  const request = h.requests[0] as { config: Record<string, unknown> }
  assert.deepEqual(request.config.existingBrowser, { cdpUrl: endpoint, ownerId, resume: true })
})

// WHY：父连接顺序 start 必须只启动一次 runner；每次操作仍传新的 owner，不能借 launch 绕回新授权。
test("sequential starts with the same task parent reuse the actual RunnerProcess", async () => {
  const h = harness(endpoint)
  await h.runner.startHybrid({ ...config, connectionOwnerId: ownerId })
  const nextOwner = "96efa0a6-8a8a-4938-83d4-69c37de80495"
  await h.runner.startHybrid({ ...config, connectionOwnerId: ownerId,
    managedWindow: { ownerId: nextOwner, resume: false } })
  assert.equal(h.launches(), 1)
  assert.equal(h.requests.length, 2)
  const requests = h.requests as { config: { existingBrowser: { ownerId: string }; connectionOwnerId: string } }[]
  assert.deepEqual(requests.map(value => value.config.existingBrowser.ownerId), [ownerId, nextOwner])
  assert.deepEqual(requests.map(value => value.config.connectionOwnerId), [ownerId, ownerId])
})
