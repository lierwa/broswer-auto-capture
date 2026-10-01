import { z } from "zod"
import type { FastifyInstance } from "fastify"
import { browserModeSchema } from "@browser-capture/contracts/browser-profile"
import type { ProductStore } from "../database/store.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { DomainError } from "../errors.js"

const selection = z.object({ mode: browserModeSchema, expectedRevision: z.number().int().nonnegative() }).strict()

/** WHY：选择是产品配置；忙碌标记仅保护一次配置请求，不引入执行/恢复状态机。 */
export class BrowserEnvironmentService {
  private changing = false
  constructor(private readonly store: ProductStore, private readonly upstream: UpstreamBrowserRuntime,
    private readonly assertAvailable: () => void, private readonly disconnectExtension?: () => Promise<void>) {}
  snapshot() { return this.store.browserEnvironment() }
  assertStable() {
    if (this.changing) throw new DomainError("browser_environment_changing", "浏览器环境正在切换，请稍后重试。", 409)
  }
  async select(raw: unknown) {
    const command = selection.parse(raw)
    return this.exclusive(async () => {
      const current = this.snapshot()
      if (current.revision !== command.expectedRevision) {
        throw new DomainError("browser_environment_changed", "浏览器选择已变化，请重新读取后再保存。", 409)
      }
      if (current.mode === command.mode) return current
      await this.disconnectIdle()
      return this.store.saveBrowserEnvironment(command.mode, command.expectedRevision)
    })
  }
  async exclusive<T>(work: () => Promise<T>) {
    this.assertStable(); this.assertAvailable(); this.changing = true
    try { return await work() } finally { this.changing = false }
  }
  async disconnectIdle() {
    const report = await this.upstream.close?.()
    if (report?.status === "unconfirmed") {
      throw new DomainError("browser_environment_cleanup_required", "原浏览器连接清理未确认，请先核验再切换。", 409)
    }
    await this.disconnectExtension?.()
  }
}

export function mountBrowserEnvironment(app: FastifyInstance, service: BrowserEnvironmentService,
  assertWritable: () => void) {
  app.get("/api/browser-environment", () => service.snapshot())
  app.put("/api/browser-environment", request => { assertWritable(); return service.select(request.body) })
}
