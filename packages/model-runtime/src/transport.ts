import path from "node:path"
import { fileURLToPath } from "node:url"

import { execa } from "execa"
import ndjson from "ndjson"

export interface TransportResult {
  exitCode?: number
  signal?: string
  stderr: string
}

export interface CodexAppServerTransport {
  next(): Promise<IteratorResult<unknown>>
  send(method: string, id: number, params: object): void
  notify(method: string, params?: object): void
  kill(): void
  close(): Promise<void>
  result(): Promise<TransportResult>
}

export interface TransportOptions {
  cwd: string
  executable?: string
  packageRoot?: string
}

export type TransportFactory = (options: TransportOptions) => CodexAppServerTransport

export function startCodexAppServerTransport(options: TransportOptions): CodexAppServerTransport {
  const serverArgs = [
    "app-server",
    "--stdio",
    "--disable",
    "plugins",
    "--disable",
    "hooks",
    "--disable",
    "memories",
    "--disable",
    "shell_tool",
    "--disable",
    "unified_exec",
  ]
  const executable = options.executable ?? "npm"
  const executableArgs = options.executable
    ? serverArgs
    : ["--prefix", options.packageRoot ?? defaultPackageRoot(), "exec", "--", "codex", ...serverArgs]
  const subprocess = execa(executable, executableArgs, {
    cwd: options.cwd,
    env: normalizedEnvironment(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    reject: false,
    cleanup: true,
    buffer: false,
    forceKillAfterDelay: 2_000,
  })
  if (!subprocess.stdin || !subprocess.stdout || !subprocess.stderr) {
    subprocess.kill("SIGTERM")
    throw new Error("Codex App Server stdio pipe unavailable")
  }
  const input = subprocess.stdin
  const iterator = subprocess.stdout.pipe(ndjson.parse())[Symbol.asyncIterator]()
  let stderr = ""
  subprocess.stderr.on("data", (chunk: Buffer | string) => {
    stderr = `${stderr}${String(chunk)}`.slice(-4_000)
  })
  const resultPromise: Promise<TransportResult> = subprocess.then(
    (result) => ({
      ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
      ...(result.signal === undefined ? {} : { signal: String(result.signal) }),
      stderr,
    }),
    () => ({ stderr }),
  )
  let closed = false
  return {
    next: () => iterator.next(),
    send: (method, id, params) => {
      input.write(`${JSON.stringify({ method, id, params })}\n`)
    },
    notify: (method, params = {}) => {
      input.write(`${JSON.stringify({ method, params })}\n`)
    },
    kill: () => {
      subprocess.kill("SIGTERM")
    },
    close: async () => {
      if (closed) return
      closed = true
      input.end()
      subprocess.kill("SIGTERM")
      await resultPromise
    },
    result: () => resultPromise,
  }
}

function defaultPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
}

function normalizedEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  const pathKeys = Object.keys(environment).filter((key) => key.toLowerCase() === "path")
  const inheritedPath = environment.PATH ?? pathKeys.map((key) => environment[key]).find(Boolean)
  for (const key of pathKeys) delete environment[key]
  // WHY：Windows 环境键不区分大小写；收口为唯一 PATH，保证 npm 启动的 codex 能找到当前 Node。
  environment.PATH = [path.dirname(process.execPath), inheritedPath]
    .filter((value): value is string => Boolean(value))
    .join(path.delimiter)
  return environment
}
