import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import type { hybridStartRequestSchema } from "./hybrid-protocol.js"

type HybridConfig = ReturnType<typeof hybridStartRequestSchema.parse>["config"]
type PortSource = { platform?: NodeJS.Platform; homeDirectory?: string; environment?: NodeJS.ProcessEnv;
  readPortFile?: (filename: string) => Promise<string> }

/** WHY：只读取 Chrome 公开的连接文件，不读取 Profile 内容，也不通过启动另一实例填补配置缺失。 */
export async function resolveDailyChromeEndpoint(source: PortSource = {}): Promise<string | undefined> {
  const platform = source.platform ?? process.platform, homeDirectory = source.homeDirectory ?? homedir()
  const environment = source.environment ?? process.env
  const roots: Partial<Record<NodeJS.Platform, string>> = {
    darwin: path.join(homeDirectory, "Library", "Application Support", "Google", "Chrome"),
    win32: path.join(environment.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local"), "Google", "Chrome", "User Data"),
    linux: path.join(environment.XDG_CONFIG_HOME ?? path.join(homeDirectory, ".config"), "google-chrome"),
  }
  const root = roots[platform]
  if (!root) return undefined
  let contents: string
  try { contents = await (source.readPortFile ?? ((filename) => readFile(filename, "utf8")))(path.join(root, "DevToolsActivePort")) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error }
  const lines = contents.trim().split(/\r?\n/), port = Number(lines[0])
  if (lines.length !== 2 || !/^[0-9]{1,5}$/.test(lines[0] ?? "") || !Number.isInteger(port) || port < 1 || port > 65_535
    || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(lines[1] ?? "")) {
    throw new Error("hybrid_existing_browser_endpoint_invalid")
  }
  return `ws://127.0.0.1:${port}${lines[1]}`
}

export async function dailyChromeConnection(config: Omit<HybridConfig, "allowedSites">,
  endpointOverride: string | undefined, resolveEndpoint: () => Promise<string | undefined>) {
  const existingBrowser = config.existingBrowser
  const endpoint = existingBrowser?.cdpUrl ?? endpointOverride ?? await resolveEndpoint()
  if (!endpoint) throw new Error("hybrid_existing_browser_endpoint_required")
  if (config.headless) throw new Error("hybrid_existing_browser_headless_unsupported")
  const owner = existingBrowser ?? config.managedWindow
  if (!owner) throw new Error("hybrid_existing_browser_owner_required")
  // WHY：显式连接及恢复身份优先；环境变量不能换掉已有租约或把本次任务归给随机 owner。
  return { ...config, managedWindow: undefined,
    existingBrowser: { cdpUrl: endpoint, ownerId: owner.ownerId, resume: owner.resume } }
}
