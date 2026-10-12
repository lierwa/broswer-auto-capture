import assert from "node:assert/strict"
import path from "node:path"
import { z } from "zod"
import { browserEnvironmentSchema } from "@browser-capture/contracts/browser-profile"

const healthSchema = z.object({ development: z.object({ root: z.string(), pid: z.number().int().positive() }) })
const dailySchema = z.object({ paired: z.boolean(), connected: z.boolean(), busy: z.boolean(),
  profileDirectory: z.string().nullable(), popupRequest: z.unknown().nullable() })

/** WHY：验收只能消费系统的既有选择与授权，不能自动创建替代环境或把 UI 客户端当作任务浏览器。 */
export function productBrowserBoundary(root: string, raw: { health: unknown; environment: unknown; daily: unknown }) {
  const { development } = healthSchema.parse(raw.health)
  const environment = browserEnvironmentSchema.parse(raw.environment), daily = dailySchema.parse(raw.daily)
  assert.equal(path.resolve(development.root), path.resolve(root), "acceptance_checkout_mismatch")
  assert.equal(environment.mode, "daily", "acceptance_requires_selected_daily_browser")
  assert.ok(daily.paired && daily.connected && daily.profileDirectory, "acceptance_requires_existing_daily_authorization")
  assert.ok(!daily.busy && !daily.popupRequest, "acceptance_daily_browser_not_idle")
  return { development, environment, profileDirectory: daily.profileDirectory }
}

export function assertProductBrowserUnchanged(before: ReturnType<typeof productBrowserBoundary>,
  after: ReturnType<typeof productBrowserBoundary>) {
  assert.deepEqual(after, before, "acceptance_product_browser_changed")
}
