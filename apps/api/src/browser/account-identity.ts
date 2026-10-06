import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { BrowserIdentity } from "@browser-capture/contracts/browser-account"
import type { DailyChromeExtension } from "./daily-extension.js"
import type { AccountRepository } from "./account-repository.js"
import { DomainError } from "../errors.js"

export class AccountIdentities {
  constructor(private directory: string, private daily: DailyChromeExtension, private repository: AccountRepository) {}
  async identify(kind: BrowserIdentity["kind"]) {
    const binding = kind === "daily" ? await this.daily.accountBinding() : await this.dedicated()
    if (!binding) throw new DomainError("account_authorization_required", "请返回浏览器设置授权 Chrome；已保存的账号目录仍可查看。", 409)
    const existing = this.repository.list("identity").find(value => value.kind === kind && value.binding === binding.binding)
    return existing ?? this.repository.save("identity", { id: randomUUID(), kind, ...binding, createdAt: new Date().toISOString() })
  }
  async assertBound(identity: BrowserIdentity) {
    const binding = identity.kind === "daily" ? await this.daily.accountBinding() : await this.dedicated()
    if (!binding || binding.binding !== identity.binding) throw new DomainError("account_profile_changed",
      "当前浏览器授权与此账号目录不一致，请返回设置选择对应 Chrome。旧检查记录已保留。", 409)
    if (identity.kind === "daily" && !await this.daily.endpoint(false)) throw new DomainError("account_authorization_required", "请先授权 Chrome。", 409)
  }
  async current(kind: BrowserIdentity["kind"]) {
    if (kind === "daily") {
      const binding = await this.daily.accountBinding()
      return this.repository.list("identity").find(v => v.kind === kind && v.binding === binding?.binding) ?? null
    }
    try {
      const binding = (await readFile(path.join(this.directory, "browser-profile/default/.bat-account-identity"), "utf8")).trim()
      return this.repository.list("identity").find(v => v.kind === kind && v.binding === binding) ?? null
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
  }
  private async dedicated() {
    const directory = path.join(this.directory, "browser-profile", "default")
    const file = path.join(directory, ".bat-account-identity")
    await mkdir(directory, { recursive: true })
    // WHY：随机身份跟随真实 Profile；路径、显示模式和显示名均不是主键。只在明确写操作创建。
    try { await writeFile(file, randomUUID(), { flag: "wx", mode: 0o600 }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
    return { binding: z.uuid().parse((await readFile(file, "utf8")).trim()), name: "专属浏览器" }
  }
}
