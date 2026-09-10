import { execFile } from "node:child_process"
import { createServer as createHttpServer } from "node:http"
import { createConnection } from "node:net"
import path from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify } from "node:util"
import findProcess from "find-process"
import { createServer as createViteServer } from "vite"
import { createApplication } from "../apps/api/src/app.js"

const DEFAULT_PORTS = { web: 4173, api: 4175 }
const RELEASE_TIMEOUT_MS = 5_000
const execFileAsync = promisify(execFile)

export class DevStartError extends Error {}

export async function ensureDevPortsAvailable(options) {
  const inspect = options.inspect ?? inspectDevPorts
  const initial = await inspect(options.ports)
  if (!initial.length) return
  options.onConflict?.(initial)
  if (!options.interactive) throw new DevStartError("开发端口已被占用；非交互模式不会停止现有进程，也没有启动新服务。")
  if (!await options.confirm(initial)) throw new DevStartError("已保留现有进程，没有启动新服务。")

  const current = await inspect(options.ports)
  assertOwnersUnchanged(initial, current)
  if (!current.length) return
  options.onStopping?.(current)
  await stopConfirmedOwners(current, options.terminate ?? terminateProcess)
  await waitForRelease(initial, options.ports, inspect)
}

export async function launchDevServices({ root, ports, dataDirectory, outputStream = process.stdout, applicationOptions = {} }) {
  const directory = path.resolve(dataDirectory ?? process.env.BROWSER_CAPTURE_DATA_DIRECTORY
    ?? process.env.BROWSER_CAPTURE_INTERVIEW_DATA_DIRECTORY ?? path.join(root, "data"))
  const application = await createApplication({ ...applicationOptions, root, directory, serveUi: false })
  let vite
  let webServer
  try {
    await application.app.listen({ host: "127.0.0.1", port: ports.api })
    webServer = createHttpServer()
    vite = await createViteServer({
      root: path.join(root, "apps", "workbench"),
      configFile: path.join(root, "apps", "workbench", "vite.config.ts"),
      logLevel: outputStream === process.stdout ? "info" : "silent",
      server: {
        middlewareMode: { server: webServer },
        hmr: { server: webServer },
        proxy: { "/api": { target: `http://127.0.0.1:${ports.api}`, changeOrigin: false } },
      },
    })
    webServer.on("request", (request, response) => vite.middlewares(request, response, () => {
      response.statusCode = 404
      response.end()
    }))
    await listen(webServer, ports.web)
  } catch (error) {
    await closeServices({ vite, webServer, app: application.app })
    throw error
  }
  outputStream.write(`浏览器工作台：http://127.0.0.1:${ports.web}/\n`)
  outputStream.write(`浏览器工作台 API：http://127.0.0.1:${ports.api}/\n`)
  let settle
  const result = new Promise((resolve, reject) => { settle = { resolve, reject } })
  let stopping = false
  return {
    result,
    async stop() {
      if (stopping) return result
      stopping = true
      try { await closeServices({ vite, webServer, app: application.app }); settle.resolve() }
      catch (error) { settle.reject(error); throw error }
    },
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off("listening", onListening); reject(error) }
    const onListening = () => { server.off("error", onError); resolve() }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(port, "127.0.0.1")
  })
}

async function closeServices({ vite, webServer, app }) {
  const closeWeb = webServer?.listening ? new Promise((resolve, reject) => webServer.close((error) => error ? reject(error) : resolve())) : undefined
  const force = setTimeout(() => {
    webServer?.closeAllConnections?.()
    app.server.closeAllConnections?.()
  }, 1_000)
  force.unref()
  const closed = await Promise.allSettled([vite?.close(), closeWeb, app.close()])
  clearTimeout(force)
  const failures = closed.filter((item) => item.status === "rejected")
  if (failures.length) throw new AggregateError(failures.map((item) => item.reason), "开发服务关闭失败")
}

export async function inspectDevPorts(ports, dependencies = {}) {
  const listenerPids = dependencies.listenerPids ?? tcpListenerPids
  const finder = dependencies.finder ?? findProcess
  const requested = [{ role: "Workbench", port: ports.web }, { role: "API", port: ports.api }]
  const groups = await Promise.all(requested.map(async ({ role, port }) => {
    const pids = await listenerPids(port)
    return Promise.all(pids.map(async (pid) => normalizeOwner(role, port, await findPid(pid, finder))))
  }))
  return groups.flat()
}

async function tcpListenerPids(port) {
  if (!await isListening(port)) return []
  let pids
  try { pids = process.platform === "win32" ? await windowsListenerPids(port) : await lsofListenerPids(port) }
  catch {
    if (!await isListening(port)) return []
    throw new DevStartError(`无法核实端口 ${port} 的 TCP 监听进程；为避免误停，已停止启动。`)
  }
  if (!pids.length && await isListening(port)) throw new DevStartError(`端口 ${port} 存在 TCP 监听，但进程身份无法核实；已停止启动。`)
  return pids
}

async function lsofListenerPids(port) {
  const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"])
  return uniquePids(stdout.split(/\r?\n/).filter((line) => line.startsWith("p")).map((line) => line.slice(1)))
}

async function windowsListenerPids(port) {
  const command = `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique`
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command])
  return uniquePids(stdout.split(/\r?\n/))
}

function uniquePids(values) {
  return [...new Set(values.map(Number).filter((pid) => Number.isSafeInteger(pid) && pid > 1))]
}

async function findPid(pid, finder) {
  let processes
  try { processes = await finder("pid", pid, { strict: true, logLevel: "error" }) }
  catch { throw new DevStartError(`无法核实 PID ${pid} 的进程身份；为避免误停，已停止启动。`) }
  const exact = processes.find((process) => Number(process.pid) === pid)
  if (!exact) throw new DevStartError(`TCP 监听进程 PID ${pid} 已变化；为避免误停，已停止启动。`)
  return exact
}

function normalizeOwner(role, port, info) {
  const pid = Number(info.pid)
  const name = typeof info.name === "string" ? info.name.trim() : ""
  const command = typeof info.cmd === "string" ? info.cmd.trim() : ""
  const directory = inferEntryDirectory(command, info.bin)
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid || !name || !command || !directory) {
    throw new DevStartError(`端口 ${port} 的占用进程身份不完整；为避免误停，已停止启动。`)
  }
  return { role, port, pid, ppid: Number(info.ppid) || 0, name, command, directory }
}

function inferEntryDirectory(command, executable) {
  const tokens = [...command.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3])
  const executablePath = typeof executable === "string" ? executable : ""
  for (const token of tokens) {
    const normalized = token.replaceAll("\\", "/")
    const marker = normalized.indexOf("/node_modules/")
    if (marker > 0) return normalized.slice(0, marker)
  }
  const entry = tokens.find((token) => token !== executablePath && isAbsolutePath(token) && !isNodeExecutable(token))
  return entry ? directoryName(entry) : undefined
}

function isAbsolutePath(value) { return path.isAbsolute(value) || path.win32.isAbsolute(value) }
function directoryName(value) { return path.win32.isAbsolute(value) ? path.win32.dirname(value) : path.dirname(value) }
function isNodeExecutable(value) { return /(?:^|[\\/])node(?:\.exe)?$/i.test(value) }

function assertOwnersUnchanged(initial, current) {
  const expected = new Set(initial.map(identity))
  if (current.some((owner) => !expected.has(identity(owner)))) {
    throw new DevStartError("端口占用者身份已变化；为避免误停，新进程未被停止。请重新运行启动命令。")
  }
}

async function stopConfirmedOwners(owners, terminate) {
  const unique = new Map(owners.map((owner) => [owner.pid, owner]))
  for (const owner of unique.values()) {
    if (owner.pid <= 1 || owner.pid === process.pid) throw new DevStartError("拒绝停止无效或当前启动守卫进程。")
    try { await terminate(owner.pid) }
    catch (error) {
      if (error?.code !== "ESRCH") throw new DevStartError(`无法停止 PID ${owner.pid}；没有启动新服务。`)
    }
  }
}

async function waitForRelease(confirmed, ports, inspect) {
  const expected = new Set(confirmed.map(identity))
  const deadline = Date.now() + RELEASE_TIMEOUT_MS
  while (Date.now() < deadline) {
    const current = await inspect(ports)
    if (!current.length) return
    if (current.some((owner) => !expected.has(identity(owner)))) {
      throw new DevStartError("端口出现新的占用者；新进程未被停止，也没有启动开发服务。")
    }
    await delay(100)
  }
  throw new DevStartError("已确认的进程未在 5 秒内释放端口；没有启动新服务。")
}

function identity(owner) { return `${owner.port}\0${owner.pid}\0${owner.ppid}\0${owner.name}\0${owner.command}\0${owner.directory}` }
function terminateProcess(pid) { process.kill(pid, "SIGTERM") }
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)) }

async function isListening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port })
    socket.setTimeout(300)
    socket.once("connect", () => { socket.destroy(); resolve(true) })
    socket.once("timeout", () => { socket.destroy(); resolve(false) })
    socket.once("error", () => resolve(false))
  })
}

function selectedPorts() {
  const api = Number(process.env.BROWSER_CAPTURE_API_PORT ?? DEFAULT_PORTS.api)
  if (!Number.isInteger(api) || api < 1 || api > 65_535) throw new DevStartError("BROWSER_CAPTURE_API_PORT 必须是 1 到 65535 的整数。")
  return { web: DEFAULT_PORTS.web, api }
}

function showConflicts(conflicts) {
  process.stderr.write("开发端口已被占用：\n")
  for (const owner of conflicts) {
    process.stderr.write(`- ${owner.role} ${owner.port}：PID ${owner.pid}，${owner.name}，入口目录 ${owner.directory}\n`)
  }
  process.stderr.write("停止这些进程会中断其正在处理的请求或任务。\n")
}

async function askForRestart() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const interrupted = new Promise((resolve) => prompt.once("SIGINT", () => resolve("")))
    const answer = await Promise.race([prompt.question("停止以上进程并启动本项目？[y/N] "), interrupted])
    return /^(y|yes)$/i.test(answer.trim())
  } finally { prompt.close() }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const ports = selectedPorts()
  await ensureDevPortsAvailable({
    ports,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    confirm: askForRestart,
    onConflict: showConflicts,
    onStopping: (owners) => process.stderr.write(`正在停止已确认的 PID：${[...new Set(owners.map((owner) => owner.pid))].join(", ")}\n`),
  })
  const running = await launchDevServices({ root, ports })
  let interrupted = false
  const stop = () => { interrupted = true; void running.stop().catch(() => { process.exitCode = 1 }) }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try { await running.result }
  catch { if (!interrupted) throw new DevStartError("API 或 Workbench 启动失败；本次启动的其他服务已停止。") }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`${error instanceof DevStartError ? error.message : "开发服务启动失败。"}\n`); process.exitCode = 1 })
}
