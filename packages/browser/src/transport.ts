import { spawn } from "node:child_process"
import type { CommandExecutor } from "./contracts.js"
import { BrowserError } from "./contracts.js"

// WHY：只启动固定 BrowserSkill 可执行文件和参数数组，不接受 shell/脚本/模型命令；stderr 不进入产品日志。
export function bskExecutor(cwd: string): CommandExecutor {
  return async (args, signal) => new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const child = spawn(process.platform === "win32" ? "bsk.exe" : "bsk", [...args], { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] })
    let stdout = "", oversized = false
    const cancel = () => child.kill()
    const timeout = setTimeout(cancel, 30_000)
    signal?.addEventListener("abort", cancel, { once: true })
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length + chunk.length > 2_000_000) { oversized = true; child.kill(); return }
      stdout += chunk
    })
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener("abort", cancel) }
    child.once("error", () => { cleanup(); reject(new BrowserError("command_failed")) })
    child.once("close", (code) => { cleanup(); resolve({ stdout, exitCode: oversized ? -1 : code ?? -1 }) })
  })
}
