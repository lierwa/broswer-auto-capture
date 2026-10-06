import { z } from "zod"
import type { FastifyInstance } from "fastify"
import { browserModeSchema } from "@browser-capture/contracts/browser-profile"
import type { ProductStore } from "../database/store.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { DomainError } from "../errors.js"
import { taskBrowserEnvironment, saveTaskBrowserEnvironment } from "./task-environment.js"
import { taskIdSchema } from "@browser-capture/contracts/task"

const selection = z.object({ mode: browserModeSchema, expectedRevision: z.number().int().nonnegative() }).strict()

/** WHY：选择只决定之后的准备/运行；实际账号窗口操作才需要连接互斥与清理。 */
export class BrowserEnvironmentService {
  private changing = false
  constructor(private readonly store: ProductStore, private readonly upstream: UpstreamBrowserRuntime,
    private readonly assertAvailable: () => void, private readonly disconnectExtension?: () => Promise<void>) {}
  snapshot() { return this.store.browserEnvironment() }
  taskSnapshot(taskId: string) { return taskBrowserEnvironment(this.store, taskId) }
  taskSelect(taskId: string, mode: unknown, revision: number) {
    return saveTaskBrowserEnvironment(this.store, taskId, mode, revision)
  }
  assertStable() {
    if (this.changing) throw new DomainError("browser_environment_changing", "浏览器环境正在切换，请稍后重试。", 409)
  }
  async select(raw: unknown) {
    const command = selection.parse(raw)
    const current = this.snapshot()
    if (current.revision !== command.expectedRevision) {
      throw new DomainError("browser_environment_changed", "浏览器选择已变化，请重新读取后再保存。", 409)
    }
    if (current.mode === command.mode) return current
    // WHY：执行已冻结自己的 browser 快照；保存偏好不能检查、断开或回收它的连接与窗口。
    return this.store.saveBrowserEnvironment(command.mode, command.expectedRevision)
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
  app.get("/api/task-browser-environment", request => service.taskSnapshot(
    z.object({ taskId: taskIdSchema }).parse(request.query).taskId))
  app.put("/api/task-browser-environment", request => {
    assertWritable()
    const body = z.object({ taskId: taskIdSchema, mode: browserModeSchema.nullable(),
      expectedRevision: z.number().int().nonnegative() }).strict().parse(request.body)
    return service.taskSelect(body.taskId, body.mode, body.expectedRevision)
  })
}
