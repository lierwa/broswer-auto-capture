import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { ProductStore } from "../src/database/store.js"
import { OriginAccessBlockedError, OriginAccessGate } from "../src/browser/origin-access-gate.js"

test("来源访问门跨运行执行间隔、窗口预算和持久冷却", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-origin-access-"))
  let now = 0, waits: number[] = [], store = await ProductStore.open(directory)
  const policy = { minimumIntervalMs: 100, jitterMs: 20, windowMs: 1_000, maxAccessesPerWindow: 2,
    activityWindowMs: 10_000, activityStepMs: 10, maxActivityDelayMs: 100,
    cooldownMs: 5_000, humanChallengeCooldownMs: 2_000 }
  const make = () => new OriginAccessGate(store, { policy, now: () => now, random: () => 0.5,
    wait: async (ms) => { waits.push(ms); now += ms } })
  try {
    let gate = make()
    await gate.acquire("https://example.com", "run-1", "navigate", new AbortController().signal)
    await gate.acquire("https://search.example.com", "run-1", "follow", new AbortController().signal)
    await gate.acquire("https://item.example.com", "run-2", "click", new AbortController().signal)
    assert.deepEqual(waits, [110, 890])
    gate.block("https://verify.example.com", "run-2", "rate_limited")
    await store.close()

    store = await ProductStore.open(directory); gate = make()
    await assert.rejects(gate.acquire("https://example.com", "run-3", "navigate", new AbortController().signal),
      (error) => error instanceof OriginAccessBlockedError && error.retryAt === 6_000)
    now = 6_000
    await gate.acquire("https://example.com", "run-3", "navigate", new AbortController().signal)
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("人工验证后的站点级冷却会等待且不作为外部失败抛出", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-origin-human-"))
  let now = 0, waits: number[] = []
  const store = await ProductStore.open(directory)
  const policy = { minimumIntervalMs: 0, jitterMs: 0, windowMs: 1_000, maxAccessesPerWindow: 10,
    activityWindowMs: 10_000, activityStepMs: 0, maxActivityDelayMs: 0,
    cooldownMs: 5_000, humanChallengeCooldownMs: 2_000 }
  try {
    const gate = new OriginAccessGate(store, { policy, now: () => now, random: () => 0,
      wait: async (ms) => { waits.push(ms); now += ms } })
    gate.deferAfterHumanChallenge("https://cfe.m.example.com", "run-1", "captcha")
    await gate.acquire("https://item.example.com", "run-1", "observe_after_challenge", new AbortController().signal)
    assert.deepEqual(waits, [2_000])
    assert.equal(gate.snapshot("https://search.example.com").scope, "https://example.com")
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})
