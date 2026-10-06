import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { createApplication } from "../../src/app.js"
import type { UpstreamBrowserRuntime } from "../../src/upstream-browser/service.js"
import type { JsonValue } from "@browser-capture/contracts"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../../src/upstream-browser/cleanup.js"

export async function directoryFixture(serveUi = false) {
  const state = { daily: "A", dedicated: "B", gate: false, inactive: false, refusal: false, noUid: false,
    endDelay: 0, ending: false, restoreFails: false, calls: 0, writes: 0, waits: 0 }
  const windows = new Set<string>(), backups = new Map<string, string>()
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "confirmed", code: null })), false)
  const upstream: UpstreamBrowserRuntime = {
    async withSession() { throw Error("implicit_model_forbidden") },
    async withCapabilities(input, work) {
      state.calls++; windows.add(input.ownerId)
      const result = await work({ capability: async invocation => ({ outcome: "success", output: invocation.node.id === "read"
        ? [{ state: "signed-in", identity: "Synthetic B" }] : null }) })
      input.onHandoff?.("human_wait", { ownerId: input.ownerId, leaseId: input.ownerId, targetDigest: "b".repeat(64), active: true, reason: null })
      return result
    },
    async managedWindowAction(input) {
      if (input.action === "end" && state.endDelay) { state.ending = true; await new Promise(resolve => setTimeout(resolve, state.endDelay)) }
      if (state.refusal) throw Error("connection_refused")
      if (input.action === "end") windows.delete(input.ownerId)
      return { report, window: { ownerId: input.ownerId, leaseId: input.leaseId, active: !state.inactive && windows.has(input.ownerId), targetDigest: null, reason: null,
        ...(input.action === "page" ? { page: { url: "https://fixture.test/account" } } : {}) } }
    },
    async accountSession(input, signal) {
      if (input.action === "open_page") return { phase: "opened" }
      if (state.gate) { state.waits++; await new Promise((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason)
        else signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      }) }
      signal.throwIfAborted()
      if (input.action === "pick_marker") return { selector: '[id="account-name"]', preview: "Synthetic B", url: (input.payload as { url: string }).url }
      const name = state[input.kind], payload = (input.payload ?? {}) as { rollbackRef: string; state: { cookies: { value: string }[] } }
      if (input.action === "check" || input.action === "observe") {
        const status = name === "unknown" ? "inconclusive" : name === "none" ? "unauthenticated" : "authenticated"
        return { status, reason: status === "authenticated" ? "platform_confirmed" : status === "unauthenticated" ? "login_required" : "network_error",
          identityKey: status === "authenticated" && !state.noUid ? name.toLowerCase().repeat(64) : null,
          displayIdentity: status === "authenticated" ? `Synthetic ${name}` : null, identityConfirmed: status === "authenticated" && !state.noUid,
          evidence: ["owned_fixture"], sources: [{ package: "fixture", commit: "fixture", file: "fixture", callable: "pong", startLine: 1, endLine: 2 }], modelCalls: 0, globalInitSuppressed: false }
      }
      if (input.action === "auth_read") return { cookies: [{ name: "SESSDATA", domain: ".bilibili.com", path: "/", value: name }], storage: {} }
      if (input.action === "auth_prepare") { backups.set(payload.rollbackRef, name); return { phase: "prepared" } }
      if (input.action === "auth_write") { state.writes++; state[input.kind] = payload.state.cookies[0]!.value; return { phase: "written" } }
      if (input.action === "auth_restore") { if ((input.payload as { offline?: boolean })?.offline) return { phase: "browser_required" }
        if (state.restoreFails) throw Error("account_rollback_target_changed")
        state[input.kind] = backups.get(payload.rollbackRef)!; backups.delete(payload.rollbackRef); return { phase: "restored" } }
      backups.delete(payload.rollbackRef); return { phase: "abandoned" }
    },
  }
  const directory = await mkdtemp(path.join(tmpdir(), "bat-unified-account-"))
  const api = await createApplication({ root: process.cwd(), directory, upstreamBrowserRuntime: upstream, serveUi })
  api.dailyChrome.accountBinding = async () => ({ binding: "d".repeat(64), name: "Owned daily fixture" })
  api.dailyChrome.endpoint = async () => "ws://owned-fixture.invalid"
  const command = async (type: string, platformId = "bilibili") => {
    await api.accounts.directoryCommand({ type, requestId: randomUUID(), platformId, revision: api.accounts.directory.current(platformId)?.revision ?? 0 })
    await api.accounts.settled(); return api.accounts.directory.snapshot()
  }
  return { api, state, command, directory, upstream }
}
