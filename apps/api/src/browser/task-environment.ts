import { eq } from "drizzle-orm"
import { browserModeSchema, taskBrowserEnvironmentSchema } from "@browser-capture/contracts/browser-profile"
import type { ProductStore } from "../database/store.js"
import { browserSettings } from "../database/schema.js"
import { conflict } from "../errors.js"

/** WHY：缺少任务覆盖就是动态跟随全局；选择不是运行资源，不能锁住其它任务。 */
export function taskBrowserEnvironment(store: ProductStore, taskId: string) {
  store.task(taskId)
  const row = store.db.select().from(browserSettings).where(eq(browserSettings.id, `task:${taskId}`)).get()
  const clock = store.db.select().from(browserSettings).where(eq(browserSettings.id, `task-browser-revision:${taskId}`)).get()
  return taskBrowserEnvironmentSchema.parse({ mode: row?.mode ?? store.browserEnvironment().mode,
    override: row?.mode ?? null, revision: clock?.revision ?? row?.revision ?? 0 })
}

export function saveTaskBrowserEnvironment(store: ProductStore, taskId: string, raw: unknown, revision: number) {
  const mode = browserModeSchema.nullable().parse(raw)
  return store.db.transaction(tx => {
    const current = taskBrowserEnvironment(store, taskId)
    if (revision !== current.revision) conflict("本任务浏览器选择已变化，请刷新后重试。")
    if (current.override === mode) return current
    const id = `task:${taskId}`
    // WHY：清除覆盖仍递增 revision；旧页面不能在“设置→清除”之后覆盖新的任务偏好。
    tx.insert(browserSettings).values({ id: `task-browser-revision:${taskId}`, mode: current.mode, revision: revision + 1 })
      .onConflictDoUpdate({ target: browserSettings.id, set: { mode: current.mode, revision: revision + 1 } }).run()
    if (mode === null) tx.delete(browserSettings).where(eq(browserSettings.id, id)).run()
    else tx.insert(browserSettings).values({ id, mode, revision: revision + 1 }).onConflictDoUpdate({
      target: browserSettings.id, set: { mode, revision: revision + 1 },
    }).run()
    return taskBrowserEnvironment(store, taskId)
  })
}
