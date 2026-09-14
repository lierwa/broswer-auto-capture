import { spawn } from "node:child_process"
import type { CommandExecutor } from "./contracts.js"
import { BrowserError } from "./contracts.js"

export class CommandLaunchError extends BrowserError {
  constructor() { super("command_failed") }
}

// WHY：只启动固定 BrowserSkill 可执行文件和参数数组，不接受 shell/脚本/模型命令；stderr 不进入产品日志。
export function bskExecutor(cwd: string): CommandExecutor {
  return async (args, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new BrowserError("cancelled")); return }
    const child = spawn(process.platform === "win32" ? "bsk.exe" : "bsk", [...args], { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] })
    let stdout = "", spawned = false, settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let exitSettle: ReturnType<typeof setTimeout> | undefined
    let cancellation: ReturnType<typeof setTimeout> | undefined
    const terminate = (signal: NodeJS.Signals = "SIGTERM") => {
      try { child.kill(signal) } catch {}
      child.stdout.destroy()
    }
    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      if (exitSettle) clearTimeout(exitSettle)
      if (cancellation) clearTimeout(cancellation)
      signal?.removeEventListener("abort", cancel)
      child.stdout.removeListener("data", onData)
      child.removeListener("spawn", onSpawn)
      child.removeListener("error", onError)
      child.once("error", () => {})
      child.removeListener("exit", onExit)
      child.removeListener("close", onClose)
    }
    const fail = (error: BrowserError, terminateChild = false) => {
      if (settled) return
      settled = true; cleanup()
      if (terminateChild) terminate()
      reject(error)
    }
    const finish = (exitCode: number, terminateChild = false) => {
      if (settled) return
      settled = true; cleanup()
      if (terminateChild) terminate()
      resolve({ stdout, exitCode })
    }
    const cancel = () => {
      if (settled) return
      if (!spawned || process.platform === "win32") { fail(new BrowserError("cancelled"), true); return }
      // WHY：request-help 是 daemon 中的长命令；先给 CLI 发送 Ctrl-C 并等它退出，让 daemon 清除 busy 后才能关闭所属 session。
      try { child.kill("SIGINT") } catch { fail(new BrowserError("cancelled"), true); return }
      cancellation = setTimeout(() => fail(new BrowserError("cancelled"), true), 2_000)
    }
    const onData = (chunk: string) => {
      if (stdout.length + chunk.length > 2_000_000) { finish(-1, true); return }
      stdout += chunk
    }
    const onSpawn = () => { spawned = true }
    const onError = () => fail(spawned ? new BrowserError("command_failed") : new CommandLaunchError(), true)
    // WHY：CLI 已退出但它启动的 daemon 继承 stdout 时不会产生 close；exit 后让当前数据事件排空即可按真实退出码结算。
    const onExit = (code: number | null) => {
      if (signal?.aborted) { fail(new BrowserError("cancelled")); return }
      exitSettle = setTimeout(() => finish(code ?? -1), 0)
    }
    const onClose = (code: number | null) => signal?.aborted ? fail(new BrowserError("cancelled")) : finish(code ?? -1)
    // WHY：daemon 可能继承 CLI 的 stdout；超时必须自己结束 Promise，不能把 close 当作 kill 的确认信号。
    timeout = setTimeout(() => fail(new BrowserError("command_failed"), true), commandTimeoutMs(args))
    signal?.addEventListener("abort", cancel, { once: true })
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", onData)
    child.once("spawn", onSpawn)
    child.once("error", onError)
    child.once("exit", onExit)
    child.once("close", onClose)
    if (signal?.aborted) cancel()
  })
}

function commandTimeoutMs(args: readonly string[]) {
  if (!args.includes("request-help")) return 30_000
  const index = args.indexOf("--timeout"), value = index >= 0 ? args[index + 1] : "5m"
  const match = /^(\d+)(ms|s|m)$/.exec(value ?? "")
  if (!match) return 315_000
  const multiplier = match[2] === "m" ? 60_000 : match[2] === "s" ? 1_000 : 1
  // WHY：BrowserSkill 的业务等待截止后仍需给 daemon/extension 留出结果回传余量；产品等待点不因传输收敛而自动重试。
  return Number(match[1]) * multiplier + 15_000
}
