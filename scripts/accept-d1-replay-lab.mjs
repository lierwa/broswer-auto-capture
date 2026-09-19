import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const lab = path.join(root, "apps", "browser-replay-lab")
const mode = parseMode(process.argv.slice(2))
const token = randomBytes(32).toString("hex")
const primaryPort = await freePort()
let peerPort = await freePort()
while (peerPort === primaryPort) peerPort = await freePort()
const primaryOrigin = `http://127.0.0.1:${primaryPort}`
const peerOrigin = `http://127.0.0.1:${peerPort}`
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-")
const output = path.join(root, "work", "d1-replay-lab", stamp, mode)
await mkdir(output, { recursive: true })
const services = []

try {
  services.push(startVite("primary", primaryPort, peerOrigin))
  services.push(startVite("peer", peerPort, primaryOrigin))
  await Promise.all([waitHttp(primaryOrigin), waitHttp(peerOrigin)])
  const python = resolvePython()
  const result = await runPython(python)
  await writeFile(path.join(output, "runner.log"), result.output)
  if (result.status !== 0) throw new Error(`d1_browser_acceptance_failed:${result.status}`)
  process.stdout.write(`D1 ${mode} evidence: ${path.join(output, "acceptance.json")}\n`)
} finally {
  await Promise.allSettled(services.map(stopProcess))
  await Promise.allSettled([waitClosed(primaryPort), waitClosed(peerPort)])
}

function parseMode(args) {
  const headed = args.includes("--headed")
  const headless = args.includes("--headless")
  if (headed === headless || args.some((value) => !["--headed", "--headless"].includes(value))) {
    throw new Error("usage: node scripts/accept-d1-replay-lab.mjs --headed|--headless")
  }
  return headed ? "headed" : "headless"
}

function startVite(name, port, peerOrigin) {
  const executable = path.join(root, "node_modules", "vite", "bin", "vite.js")
  const child = spawn(process.execPath, [executable, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: lab,
    env: { ...process.env, BAT_FIXTURE_TOKEN: token, VITE_FIXTURE_PEER_ORIGIN: peerOrigin },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const chunks = []
  child.stdout.on("data", (chunk) => chunks.push(String(chunk)))
  child.stderr.on("data", (chunk) => chunks.push(String(chunk)))
  child.once("exit", (code) => {
    if (code && code !== 0) process.stderr.write(`${name} fixture exited ${code}:\n${chunks.join("")}\n`)
  })
  return child
}

function resolvePython() {
  const python = path.join(root, "work", "upstream-browser-hybrid", ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
  if (!existsSync(python)) {
    const setup = spawnSync(process.execPath, [path.join(root, "scripts", "setup-upstream-browser-runner.mjs")], {
      cwd: root, encoding: "utf8", windowsHide: true,
    })
    if (setup.error) throw setup.error
    if (setup.status !== 0) throw new Error(`upstream_setup_failed:${setup.stderr || setup.stdout}`)
  }
  if (!existsSync(python)) throw new Error("hybrid_python_missing")
  return python
}

function runPython(python) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(root, "vendor", "workflow-use", "workflows", "tests", "test_replay_lab_browser.py")], {
      cwd: root,
      env: { ...process.env,
        PYTHONPATH: path.join(root, "vendor", "workflow-use", "workflows"),
        PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false", BROWSER_USE_SETUP_LOGGING: "false",
        BAT_FIXTURE_ORIGIN: primaryOrigin, BAT_FIXTURE_PEER_ORIGIN: peerOrigin,
        BAT_FIXTURE_TOKEN: token, BAT_BROWSER_MODE: mode, BAT_D1_OUTPUT: output,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let text = ""
    child.stdout.on("data", (chunk) => { text += String(chunk); process.stdout.write(chunk) })
    child.stderr.on("data", (chunk) => { text += String(chunk); process.stderr.write(chunk) })
    child.once("error", reject)
    child.once("exit", (status) => resolve({ status, output: text }))
  })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function waitHttp(origin) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const probe = () => {
      const request = http.get(origin, (response) => {
        response.resume()
        if ((response.statusCode ?? 500) < 500) resolve()
        else retry()
      })
      request.once("error", retry)
    }
    const retry = () => Date.now() - started > 20_000
      ? reject(new Error(`fixture_start_timeout:${origin}`)) : setTimeout(probe, 100)
    probe()
  })
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) return resolve()
    const timeout = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL") }, 3000)
    child.once("exit", () => { clearTimeout(timeout); resolve() })
    child.kill("SIGTERM")
  })
}

function waitClosed(port) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const probe = () => {
      const socket = net.connect({ host: "127.0.0.1", port })
      socket.once("connect", () => { socket.destroy(); retry() })
      socket.once("error", () => resolve())
    }
    const retry = () => Date.now() - started > 10_000
      ? reject(new Error(`fixture_cleanup_timeout:${port}`)) : setTimeout(probe, 100)
    probe()
  })
}
