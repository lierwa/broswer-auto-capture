import { readFile, access } from "node:fs/promises"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { ProviderCredentialStore } from "@agent-platform/ai-connect/integration/credentials/provider-credential-store"
import { CDPRelayServer } from "../../../../vendor/daily-chrome-extension/cdpRelay.js"
import { DomainError } from "../errors.js"

const tokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/)
const bindingSchema = z.object({ profileDirectory: z.string().min(1).max(100)
  .refine(value => !value.includes("/") && !value.includes("\\") && value !== "." && value !== ".."),
  token: tokenSchema.optional() }).strict()
const profileSchema = z.object({ name: z.string().min(1) }).passthrough()
const metadataSchema = z.object({ profile: z.object({ info_cache: z.record(z.string(), profileSchema) }) }).passthrough()
const credentialRef = "daily-chrome"

export class DailyChromeExtension {
  private credentials: ProviderCredentialStore
  private relay: CDPRelayServer | undefined
  private changing: Promise<unknown> | undefined
  constructor(private root: string, private directory: string, private assertIdle: () => void,
    private platform = process.platform, private home = homedir(),
    private environment: NodeJS.ProcessEnv = process.env) {
    // WHY：复用已安装公共凭据存储，独立文件，不能混入模型账号或另写锁/密钥系统。
    this.credentials = new ProviderCredentialStore({ path: path.join(directory, "daily-chrome", "auth.json") })
  }

  private dataRoot() {
    if (this.platform === "darwin") return path.join(this.home, "Library/Application Support/Google/Chrome")
    if (this.platform === "win32") return path.join(this.environment.LOCALAPPDATA ?? path.join(this.home, "AppData/Local"), "Google/Chrome/User Data")
    throw new DomainError("daily_chrome_platform_unsupported", "日常 Chrome 扩展首版支持 macOS 和 Windows。", 409)
  }

  async profiles() {
    try {
      // 只读取 Chrome Profile 名称/目录的元数据；不读取 Profile 内容、Cookie 或页面。
      const metadata = metadataSchema.parse(JSON.parse(await readFile(path.join(this.dataRoot(), "Local State"), "utf8")))
      return Object.entries(metadata.profile.info_cache).map(([id, value]) => ({ id, name: value.name }))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  }

  async snapshot() {
    const record = await this.credentials.get(credentialRef)
    return { paired: record?.type === "api" && Boolean(record.key),
      profileDirectory: record?.type === "api" ? record.env?.PROFILE_DIRECTORY ?? null : null,
      connected: this.relay?.isConnected() ?? false, busy: Boolean(this.changing),
      extensionDirectory: path.join(this.root, "work/daily-chrome-extension/extension"), profiles: await this.profiles() }
  }

  private async extensionIdentity() {
    const manifest = z.object({ key: z.string().min(1) }).passthrough().parse(JSON.parse(await readFile(
      path.join(this.root, "vendor/daily-chrome-extension/extension/manifest.json"), "utf8")))
    return [...createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32)]
      .map(value => String.fromCharCode(97 + parseInt(value, 16))).join("")
  }

  private async executable() {
    const files = this.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] :
      [this.environment.PROGRAMFILES, this.environment["PROGRAMFILES(X86)"], this.environment.LOCALAPPDATA]
        .filter((value): value is string => Boolean(value)).map(value => path.join(value, "Google/Chrome/Application/chrome.exe"))
    for (const file of files) { try { await access(file); return file } catch {} }
    throw new DomainError("daily_chrome_not_installed", "未找到 Chrome，请先安装 Chrome。", 409)
  }

  private async createRelay(profileDirectory: string, token?: string) {
    if (!(await this.profiles()).some(profile => profile.id === profileDirectory)) {
      throw new DomainError("daily_chrome_profile_missing", "所绑定的 Chrome Profile 已不存在，请重新连接授权。", 409)
    }
    return new CDPRelayServer("chrome", await this.executable(), this.dataRoot(), profileDirectory,
      { extensionId: await this.extensionIdentity(), ...(token ? { token } : { requestAuthorization: true }) })
  }

  private async connect(profileDirectory: string, token: string | undefined, current: () => boolean) {
    this.relay?.stop()
    const relay = await this.createRelay(profileDirectory, token)
    if (!current()) { await relay.close(); throw this.cancelled() }
    this.relay = relay
    try {
      await relay.start()
      await relay.establishExtensionConnection("B-A-T")
      return relay.cdpEndpoint()
    } catch {
      relay.stop()
      throw new DomainError("daily_chrome_extension_not_connected", "扩展未能连接。请确认已在指定 Chrome 加载 B-A-T 扩展；授权已失效时点击重新授权。", 409)
    }
  }

  private exclusive<T>(work: (current: () => boolean) => Promise<T>): Promise<T> {
    this.assertStable()
    const operation: Promise<T> = Promise.resolve().then(() => work(() => this.changing === operation))
      .finally(() => { if (this.changing === operation) this.changing = undefined })
    this.changing = operation
    return operation
  }

  pair(input: unknown) {
    this.assertIdle()
    const binding = bindingSchema.parse(input)
    return this.exclusive(async current => {
      const record = await this.credentials.get(credentialRef)
      if (record?.type === "api" && record.env?.PROFILE_DIRECTORY !== binding.profileDirectory) {
        throw new DomainError("daily_chrome_profile_already_bound", "更换日常 Chrome 前，请先撤销原 Profile 的授权。", 409)
      }
      await this.connect(binding.profileDirectory, binding.token, current)
      if (!current()) { this.close(); throw this.cancelled() }
      const received = tokenSchema.safeParse(binding.token ?? this.relay?.authorizationToken())
      if (!received.success) {
        this.close()
        throw new DomainError("daily_chrome_authorization_missing", "未收到扩展的持久授权，请重新加载 B-A-T 扩展后再次授权。", 409)
      }
      // 只有真实原 token 握手通过才持久化，不能把未连接凭据记作已配对。
      try {
        await this.credentials.set(credentialRef, { type: "api", key: received.data,
          env: { PROFILE_DIRECTORY: binding.profileDirectory } })
      } catch {
        this.close()
        throw new DomainError("daily_chrome_authorization_save_failed", "授权保存失败，连接已断开。", 409)
      }
      return { paired: true }
    })
  }

  async endpoint(): Promise<string | undefined> {
    this.assertStable()
    const record = await this.credentials.get(credentialRef)
    if (record?.type !== "api" || !record.key || !record.env?.PROFILE_DIRECTORY) return undefined
    if (this.relay?.isConnected()) return this.relay.cdpEndpoint()
    return this.exclusive(current => this.connect(record.env!.PROFILE_DIRECTORY!, record.key!, current))
  }

  connectSaved() {
    this.assertIdle()
    return this.endpoint()
  }

  revoke() {
    // WHY：撤销不等待“正在连接”结束；先沿原 relay 断开，再串接原凭据写队列，防止迟到配对覆盖撤销。
    this.relay?.stop()
    this.relay = undefined
    const pending = this.changing
    const operation = (async () => {
      await pending?.catch(() => {})
      this.close()
      await this.credentials.remove(credentialRef)
      return { paired: false }
    })().finally(() => { if (this.changing === operation) this.changing = undefined })
    this.changing = operation
    return operation
  }

  close() { this.relay?.stop(); this.relay = undefined }
  private cancelled() { return new DomainError("daily_chrome_authorization_cancelled", "授权操作已撤销。", 409) }

  assertStable() {
    if (this.changing) throw new DomainError("daily_chrome_authorization_busy", "日常浏览器授权正在处理中。", 409)
  }
  async disconnect() {
    const relay = this.relay
    this.relay = undefined
    await relay?.close()
  }
}
