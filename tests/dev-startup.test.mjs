import assert from "node:assert/strict"
import { fork } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createConnection, createServer } from "node:net"
import { createSocket } from "node:dgram"
import os from "node:os"
import path from "node:path"
import { Writable } from "node:stream"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { ensureDevPortsAvailable, inspectDevPorts, launchDevServices } from "../scripts/dev.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const silentOutput = new Writable({ write(_chunk, _encoding, callback) { callback() } })

test("non-interactive port conflict refuses without stopping the owner", async () => {
  for (const role of ["web", "api"]) {
    const fixture = await startFixture()
    try {
      const ports = { web: await unusedPort(), api: await unusedPort(), [role]: fixture.port }
      await assert.rejects(ensureDevPortsAvailable({ ports, interactive: false }), /非交互/)
      assert.equal(fixture.child.exitCode, null)
    } finally { await fixture.stop() }
  }
})

test("UDP-only ownership of the same port is not treated as a TCP listener", async () => {
  const socket = createSocket("udp4")
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.bind(0, "127.0.0.1", resolve) })
  try {
    const owners = await inspectDevPorts({ web: socket.address().port, api: await unusedPort() })
    assert.deepEqual(owners, [])
  } finally { socket.close() }
})

test("a TCP client local port is not treated as a listener", async () => {
  const target = createServer()
  await new Promise((resolve, reject) => { target.once("error", reject); target.listen(0, "127.0.0.1", resolve) })
  const localPort = await unusedPort()
  const client = createConnection({ host: "127.0.0.1", port: target.address().port, localPort })
  await new Promise((resolve, reject) => { client.once("connect", resolve); client.once("error", reject) })
  try {
    const owners = await inspectDevPorts({ web: localPort, api: await unusedPort() })
    assert.deepEqual(owners, [])
  } finally {
    client.destroy()
    await new Promise((resolve) => target.close(resolve))
  }
})

test("confirmed conflict stops only the displayed fixture before continuing", async () => {
  const fixture = await startFixture()
  const apiPort = await unusedPort()
  let displayed
  await ensureDevPortsAvailable({
    ports: { web: fixture.port, api: apiPort },
    interactive: true,
    confirm: async (conflicts) => { displayed = conflicts; return true },
  })
  assert.equal(displayed.length, 1)
  assert.equal(displayed[0].pid, fixture.child.pid)
  assert.equal(displayed[0].directory, fixture.directory)
  await fixture.exited
  await assertPortsFree([fixture.port, apiPort])
})

test("changed owner identity is rejected and the replacement is not stopped", async () => {
  const first = await startFixture()
  let replacement
  try {
    await assert.rejects(ensureDevPortsAvailable({
      ports: { web: first.port, api: await unusedPort() },
      interactive: true,
      confirm: async () => {
        const port = first.port
        await first.stop()
        replacement = await startFixture(port)
        return true
      },
    }), /身份已变化/)
    assert.equal(replacement.child.exitCode, null)
  } finally {
    await first.stop()
    await replacement?.stop()
  }
})

test("invalid self target is rejected without invoking termination", async () => {
  const owner = { role: "Workbench", port: 4173, pid: process.pid, ppid: 1, name: "node", command: "node scripts/dev.mjs", directory: root }
  let terminated = false
  await assert.rejects(ensureDevPortsAvailable({
    ports: { web: 4173, api: 4175 },
    interactive: true,
    inspect: async () => [owner],
    confirm: async () => true,
    terminate: async () => { terminated = true },
  }), /拒绝停止/)
  assert.equal(terminated, false)
})

test("same PID and command with changed parent or directory is not terminated", async () => {
  const initial = { role: "Workbench", port: 4173, pid: 8001, ppid: 7001, name: "node", command: "node server.mjs", directory: "/first" }
  const changed = { ...initial, ppid: 7002, directory: "/replacement" }
  let inspections = 0
  let terminated = false
  await assert.rejects(ensureDevPortsAvailable({
    ports: { web: 4173, api: 4175 },
    interactive: true,
    inspect: async () => ++inspections === 1 ? [initial] : [changed],
    confirm: async () => true,
    terminate: async () => { terminated = true },
  }), /身份已变化/)
  assert.equal(terminated, false)
})

test("an already-exited confirmed sibling is treated as released", async () => {
  const owners = [
    { role: "Workbench", port: 4173, pid: 8001, ppid: 8000, name: "node", command: "node web.mjs", directory: root },
    { role: "API", port: 4175, pid: 8002, ppid: 8000, name: "node", command: "node api.mjs", directory: root },
  ]
  let inspections = 0
  const terminated = []
  await ensureDevPortsAvailable({
    ports: { web: 4173, api: 4175 },
    interactive: true,
    inspect: async () => ++inspections <= 2 ? owners : [],
    confirm: async () => true,
    terminate: async (pid) => {
      terminated.push(pid)
      if (pid === 8002) throw Object.assign(new Error("gone"), { code: "ESRCH" })
    },
  })
  assert.deepEqual(terminated, [8001, 8002])
})

test("free ports start the API and Workbench with the proxy bound to this API", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-capture-dev-test-"))
  const ports = { web: await unusedPort(), api: await unusedPort() }
  const running = await launchDevServices({ root, ports, dataDirectory: directory, outputStream: silentOutput })
  try {
    await waitForHttp(`http://127.0.0.1:${ports.api}/api/health`)
    const throughWorkbench = await waitForHttp(`http://127.0.0.1:${ports.web}/api/health`)
    assert.deepEqual(await throughWorkbench.json(), { service: "browser-capture-api", version: 1 })
    await assertViteHmr(ports.web)
  } finally {
    await running.stop()
    await rm(directory, { recursive: true, force: true })
  }
  await assertPortsFree(Object.values(ports))
})

test("stopping the dev host closes an active proxied event stream within the bound", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-capture-dev-stream-"))
  const ports = { web: await unusedPort(), api: await unusedPort() }
  const running = await launchDevServices({
    root,
    ports,
    dataDirectory: directory,
    outputStream: silentOutput,
    applicationOptions: { aiModel: blockingAIModel() },
  })
  const controller = new AbortController()
  try {
    const created = await fetch(`http://127.0.0.1:${ports.api}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "create", requestId: "00000000-0000-4000-8000-000000000001" }),
    })
    assert.equal(created.status, 200)
    const { id } = await created.json()
    const started = await fetch(`http://127.0.0.1:${ports.api}/api/interview?taskId=${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "message", requestId: "00000000-0000-4000-8000-000000000002", expectedRevision: 0, text: "保持测试连接" }),
    })
    assert.equal(started.status, 202)
    assert.equal((await started.json()).state.active, true)
    const stream = await fetch(`http://127.0.0.1:${ports.web}/api/interview/events?taskId=${id}&after=-1`, { signal: controller.signal })
    assert.equal(stream.status, 200)
    const { pending: pendingRead } = await waitForOpenStream(stream.body.getReader())
    await Promise.race([
      running.stop(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("dev host close exceeded 3 seconds")), 3_000)),
    ])
    await Promise.race([
      pendingRead.catch(() => undefined),
      new Promise((_, reject) => setTimeout(() => reject(new Error("proxied event stream remained open after stop")), 1_000)),
    ])
  } finally {
    controller.abort()
    await running.stop()
    await rm(directory, { recursive: true, force: true })
  }
  await assertPortsFree(Object.values(ports))
})

test("a Workbench startup failure closes the API started by this run", async () => {
  const fixture = await startFixture()
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-capture-dev-failure-"))
  const ports = { web: fixture.port, api: await unusedPort() }
  try {
    await assert.rejects(launchDevServices({ root, ports, dataDirectory: directory, outputStream: silentOutput }))
    await waitForPortFree(ports.api)
    assert.equal(fixture.child.exitCode, null)
  } finally {
    await fixture.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test("SIGTERM waits for the single dev host to release the data lock", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-capture-dev-signal-data-"))
  const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "browser-capture-dev-signal-host-"))
  const ports = { web: await unusedPort(), api: await unusedPort() }
  const entry = path.join(fixtureDirectory, "signal-host.mjs")
  await writeFile(entry, `import { launchDevServices } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", "dev.mjs")).href)}\nconst running = await launchDevServices({ root: ${JSON.stringify(root)}, ports: ${JSON.stringify(ports)}, dataDirectory: ${JSON.stringify(directory)}, outputStream: { write() {} } })\nprocess.send({ ready: true })\nprocess.once("SIGTERM", () => { void running.stop() })\nawait running.result\n`)
  const child = fork(entry, [], { cwd: root, execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"] })
  try {
    await new Promise((resolve, reject) => {
      child.once("message", resolve)
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error(`signal host exited before ready: ${code}`)))
    })
    child.kill("SIGTERM")
    const exitCode = await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("signal host did not exit within 5 seconds")), 5_000)),
    ])
    assert.equal(exitCode, 0)
    const reopened = await launchDevServices({ root, ports, dataDirectory: directory, outputStream: silentOutput })
    await reopened.stop()
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM")
    await rm(fixtureDirectory, { recursive: true, force: true })
    await rm(directory, { recursive: true, force: true })
  }
  await assertPortsFree(Object.values(ports))
})

async function startFixture(selectedPort = 0) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-capture-port-owner-"))
  const entry = path.join(directory, "fixture-server.mjs")
  await writeFile(entry, `import { createServer } from "node:net"\nconst server = createServer()\nserver.listen(Number(process.argv[2]), "127.0.0.1", () => process.send({ port: server.address().port }))\nprocess.on("SIGTERM", () => server.close(() => process.exit(0)))\n`)
  const child = fork(entry, [String(selectedPort)], { cwd: directory, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] })
  const port = await new Promise((resolve, reject) => {
    child.once("message", (message) => resolve(message.port))
    child.once("error", reject)
    child.once("exit", (code) => reject(new Error(`fixture exited before ready: ${code}`)))
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  let stopped = false
  return { child, directory, port, exited, async stop() {
    if (stopped) return
    stopped = true
    if (child.exitCode === null) child.kill("SIGTERM")
    await exited
    await rm(directory, { recursive: true, force: true })
  } }
}

function blockingAIModel() {
  const selection = { connectionId: "00000000-0000-4000-8000-000000000010", modelId: "fixture", reasoningEffort: "high" }
  const waitForAbort = (signal) => new Promise((_, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"))
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
  })
  return {
    selection: () => selection,
    async prepare() {
      return { selection, generateObject: ({ signal }) => waitForAbort(signal) }
    },
    async prepareMain() {
      return { selection, run: ({ signal }) => waitForAbort(signal), close: async () => {} }
    },
  }
}

async function unusedPort() {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  const address = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function waitForHttp(url) {
  const deadline = Date.now() + 15_000
  let error
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      error = new Error(`${url} returned ${response.status}`)
    } catch (caught) { error = caught }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw error ?? new Error(`${url} did not become ready`)
}

async function assertViteHmr(port) {
  const source = await (await waitForHttp(`http://127.0.0.1:${port}/@vite/client`)).text()
  const token = source.match(/const wsToken = "([^"]+)"/)?.[1]
  assert.ok(token, "Vite client did not expose its HMR token")
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, "vite-hmr")
  try {
    await Promise.race([
      new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }) }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("vite-hmr did not connect within 2 seconds")), 2_000)),
    ])
    assert.equal(socket.protocol, "vite-hmr")
  } finally { socket.close() }
}

async function waitForOpenStream(reader) {
  for (let index = 0; index < 10; index++) {
    const pending = reader.read()
    const outcome = await Promise.race([
      pending.then((value) => ({ type: "read", value })),
      new Promise((resolve) => setTimeout(() => resolve({ type: "pending" }), 50)),
    ])
    if (outcome.type === "pending") return { pending }
    assert.equal(outcome.value.done, false, "event stream closed before dev host stop")
  }
  assert.fail("event stream never reached an open, pending read")
}

async function assertPortsFree(ports) {
  for (const port of ports) await waitForPortFree(port)
}

async function waitForPortFree(port) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const server = createServer()
    const free = await new Promise((resolve) => {
      server.once("error", () => resolve(false))
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)))
    })
    if (free) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail(`port ${port} was not released`)
}
