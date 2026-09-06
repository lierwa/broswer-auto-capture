import { z } from "zod"
import { setTimeout as delay } from "node:timers/promises"
import { BrowserError, commandSchema, type BrowserGrant, type BrowserCommand } from "./contracts.js"

export type Invoke = (command: string, args: string[], cleanup?: boolean) => Promise<unknown>
const tabsSchema = z.object({ tabs: z.array(z.object({ tab_id: z.number().int(), active: z.boolean(), scope: z.literal("agent"), url: z.string() })) })
const observationSchema = z.object({ text: z.string(), tab_id: z.number().int(), truncated: z.boolean() })
const actionResultSchema = z.object({ tab_id: z.number().int() })
export class BrowserSession {
  private active = true
  private pending: Promise<string | null> | null = null
  private manual = false
  constructor(private readonly grant: BrowserGrant, private readonly sessionId: string, private readonly invoke: Invoke) {}
  async close() { this.active = false; await this.pending?.catch(() => {}) }
  async command(raw: unknown): Promise<string | null> {
    const command = commandSchema.parse(raw)
    if (!this.active) throw new BrowserError("session_closed")
    if (this.manual) throw new BrowserError("manual_required")
    if (this.pending) throw new BrowserError("busy")
    if (!this.grant.actions.includes(command.type)) throw new BrowserError("permission_denied")
    const pending = this.execute(command)
    this.pending = pending
    try { return await pending } finally { this.pending = null }
  }
  private allow(url: string) {
    if (url === "about:blank") return
    const value = new URL(url)
    if (value.username || value.password || !["http:", "https:"].includes(value.protocol) || !this.grant.allowedOrigins.includes(value.origin)) throw new BrowserError("origin_denied")
  }
  private async currentTab() {
    const result = tabsSchema.parse(await this.invoke("tab_list", ["tab", "list", "--scope", "agent", "--session", this.sessionId]))
    const active = result.tabs.filter((tab) => tab.active)
    if (active.length !== 1) throw new BrowserError("invalid_response")
    this.allow(active[0]!.url)
    return active[0]!.tab_id
  }
  private async observe() {
    const tab = await this.currentTab()
    const result = observationSchema.parse(await this.invoke("observe", ["observe", "--session", this.sessionId, "--tab-id", String(tab), "--max-tokens", "12000"]))
    if (result.tab_id !== tab) throw new BrowserError("invalid_response")
    // WHY：明确访问闸门使会话终止为待人工；不能继续点击或试图填写验证码。来源语义判断在 F3 补充。
    if (/验证码|安全验证|访问受限|异常访问|请先登录|登录后继续|人机验证|verify you are human|access denied|captcha/i.test(result.text)) {
      this.manual = true; throw new BrowserError("manual_required")
    }
    if (await this.currentTab() !== tab) throw new BrowserError("invalid_response")
    return result
  }
  private async execute(command: BrowserCommand) {
    if (command.type === "navigate") {
      this.allow(command.url)
      const result = actionResultSchema.parse(await this.invoke("navigate", ["navigate", command.url, "--session", this.sessionId]))
      if (await this.currentTab() !== result.tab_id) throw new BrowserError("invalid_response")
      return null
    }
    if (command.type === "observe") return this.observeUntil(command.until)
    const observed = await this.observe()
    if (observed.truncated) throw new BrowserError("invalid_response")
    // WHY：链路保存语义角色/名称，每次动作前重新观察并定位；临时 @eN 从不成为下一动作输入。
    const refs = [...observed.text.matchAll(/@e\d+\s+(\w+)\s+"((?:\\.|[^"\\])*)"/g)]
      .filter((match) => match[1] === command.target.role && JSON.parse(`"${match[2]}"`) === command.target.name)
      .map((match) => match[0].split(/\s/)[0]!)
    if (!refs.length) throw new BrowserError("target_missing")
    if (refs.length !== 1) throw new BrowserError("target_ambiguous")
    const ref = refs[0]!, tab = String(observed.tab_id)
    const args = command.type === "click" ? ["click", ref]
      : command.type === "fill" ? ["fill", ref, "--value", command.value] : ["press", command.key, "--ref", ref]
    const result = actionResultSchema.parse(await this.invoke(command.type, [...args, "--session", this.sessionId, "--tab-id", tab]))
    if (result.tab_id !== observed.tab_id || await this.currentTab() !== observed.tab_id) throw new BrowserError("invalid_response")
    return null
  }
  private async observeUntil(until?: { text: string; timeoutMs: number }) {
    const deadline = Date.now() + (until?.timeoutMs ?? 0)
    // WHY：点击完成不代表异步页面已经更新；等待业务可见文本，有时间和命令双重上限，不重复点击。
    do {
      const observed = await this.observe()
      if (!until || observed.text.includes(until.text)) return observed.text
      if (Date.now() >= deadline) throw new BrowserError("readiness_timeout")
      await delay(Math.min(100, deadline - Date.now()))
    } while (true)
  }
}
