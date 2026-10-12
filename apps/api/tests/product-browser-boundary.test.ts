import assert from "node:assert/strict"
import test from "node:test"
import path from "node:path"
import { assertProductBrowserUnchanged, productBrowserBoundary } from "./helpers/product-browser-boundary.js"

const root = process.cwd()
const input = () => ({ health: { development: { root, pid: 100 } }, environment: { mode: "daily", revision: 55 },
  daily: { paired: true, connected: true, busy: false, profileDirectory: "Default", popupRequest: null } })

test("acceptance uses the existing idle product browser without changing its selection", () => {
  const raw = input(), before = structuredClone(raw)
  assertProductBrowserUnchanged(productBrowserBoundary(root, raw), productBrowserBoundary(root, raw))
  assert.deepEqual(raw, before)
})

test("a different checkout or selected browser cannot silently become daily acceptance", () => {
  const raw = input(); raw.health.development.root = path.join(root, "another-checkout")
  assert.throws(() => productBrowserBoundary(root, raw), /acceptance_checkout_mismatch/)
  for (const mode of ["dedicated-visible", "dedicated-headless"]) {
    const raw = input(); raw.environment.mode = mode
    assert.throws(() => productBrowserBoundary(root, raw), /requires_selected_daily/)
  }
})

test("missing authorization, disconnect, pause or an active popup never trigger automatic pairing", () => {
  for (const patch of [{ paired: false }, { connected: false }, { profileDirectory: null },
    { busy: true }, { popupRequest: { url: "fixture" } }]) {
    const raw = { ...input(), daily: { ...input().daily, ...patch } }
    assert.throws(() => productBrowserBoundary(root, raw), /acceptance_/)
  }
})

test("host restart, profile substitution and selection changes invalidate the original boundary", () => {
  const before = productBrowserBoundary(root, input())
  const restarted = input(); restarted.health.development.pid++
  const switched = input(); switched.daily.profileDirectory = "Profile 1"
  const selected = input(); selected.environment.revision++
  for (const raw of [restarted, switched, selected]) {
    assert.throws(() => assertProductBrowserUnchanged(before, productBrowserBoundary(root, raw)), /product_browser_changed/)
  }
})
