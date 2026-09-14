import { randomUUID } from "node:crypto"
import { asc } from "drizzle-orm"
import { getDomain } from "tldts"
import { z } from "zod"
import type { ProductStore } from "../database/store.js"
import { originAccessBlocks, originAccessEvents } from "../database/schema.js"

const policySchema = z.object({
  minimumIntervalMs: z.number().int().nonnegative(),
  jitterMs: z.number().int().nonnegative(),
  windowMs: z.number().int().positive(),
  maxAccessesPerWindow: z.number().int().positive(),
  activityWindowMs: z.number().int().positive(),
  activityStepMs: z.number().int().nonnegative(),
  maxActivityDelayMs: z.number().int().nonnegative(),
  cooldownMs: z.number().int().positive(),
  humanChallengeCooldownMs: z.number().int().positive(),
}).strict()

export type OriginAccessPolicy = z.infer<typeof policySchema>
export const conservativeOriginAccessPolicy: OriginAccessPolicy = Object.freeze({
  minimumIntervalMs: 25_000,
  jitterMs: 10_000,
  windowMs: 120_000,
  maxAccessesPerWindow: 3,
  activityWindowMs: 10 * 60_000,
  activityStepMs: 2_000,
  maxActivityDelayMs: 20_000,
  cooldownMs: 30 * 60_000,
  humanChallengeCooldownMs: 5 * 60_000,
})

type GateOptions = Readonly<{
  policy?: OriginAccessPolicy
  now?: () => number
  random?: () => number
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}>

export class OriginAccessBlockedError extends Error {
  readonly code = "origin_access_cooling"
  constructor(readonly origin: string, readonly retryAt: number) {
    super(`origin_access_cooling:${origin}:${new Date(retryAt).toISOString()}`)
  }
}

/** 所有真实浏览器阶段共用的持久来源门；策略只识别 origin、时间和访问动作。 */
export class OriginAccessGate {
  private readonly policy: OriginAccessPolicy
  private readonly now: () => number
  private readonly random: () => number
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>

  constructor(private readonly store: ProductStore, options: GateOptions = {}) {
    this.policy = policySchema.parse(options.policy ?? conservativeOriginAccessPolicy)
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.wait = options.wait ?? abortableWait
  }

  async acquire(origin: string, runId: string, action: string, signal: AbortSignal) {
    const normalized = normalizeOrigin(origin), scope = accessScope(normalized)
    const jitter = Math.floor(Math.min(1, Math.max(0, this.random())) * this.policy.jitterMs)
    for (;;) {
      signal.throwIfAborted()
      const now = this.now(), block = this.blockForScope(scope)
      if (block && block.blockedUntil > now) {
        if (!isHumanChallengeDeferral(block.reason)) throw new OriginAccessBlockedError(normalized, block.blockedUntil)
        await this.wait(block.blockedUntil - now, signal); continue
      }
      const activity = this.eventsForScope(scope).filter((event) => event.occurredAt > now - this.policy.activityWindowMs)
      const events = activity.filter((event) => event.occurredAt > now - this.policy.windowMs)
      const last = activity.at(-1)?.occurredAt
      const activityDelay = Math.min(this.policy.maxActivityDelayMs,
        Math.max(0, activity.length - 1) * this.policy.activityStepMs)
      const intervalAt = last === undefined ? now : last + this.policy.minimumIntervalMs + activityDelay + jitter
      const windowAt = events.length < this.policy.maxAccessesPerWindow ? now
        : events[events.length - this.policy.maxAccessesPerWindow]!.occurredAt + this.policy.windowMs
      const allowedAt = Math.max(now, intervalAt, windowAt)
      if (allowedAt > now) { await this.wait(allowedAt - now, signal); continue }
      this.store.db.insert(originAccessEvents).values({ id: randomUUID(), origin: scope, runId, action, occurredAt: now }).run()
      return { origin: normalized, scope, accessedAt: now }
    }
  }

  block(origin: string, runId: string, reason: string, retryAt?: number) {
    const normalized = accessScope(normalizeOrigin(origin)), now = this.now()
    const blockedUntil = Math.max(now + this.policy.cooldownMs, retryAt ?? 0)
    this.store.db.insert(originAccessBlocks).values({ origin: normalized, runId, reason, blockedUntil, updatedAt: now })
      .onConflictDoUpdate({ target: originAccessBlocks.origin, set: { runId, reason, blockedUntil, updatedAt: now } }).run()
    return blockedUntil
  }

  deferAfterHumanChallenge(origin: string, runId: string, reason: string) {
    const normalized = accessScope(normalizeOrigin(origin)), now = this.now()
    const blockedUntil = now + this.policy.humanChallengeCooldownMs
    const existing = this.blockForScope(normalized)
    if (existing && existing.blockedUntil >= blockedUntil && !isHumanChallengeDeferral(existing.reason)) return existing.blockedUntil
    const storedReason = `human_challenge:${reason}`
    this.store.db.insert(originAccessBlocks).values({ origin: normalized, runId, reason: storedReason, blockedUntil, updatedAt: now })
      .onConflictDoUpdate({ target: originAccessBlocks.origin, set: { runId, reason: storedReason, blockedUntil, updatedAt: now } }).run()
    return blockedUntil
  }

  snapshot(origin: string) {
    const normalized = normalizeOrigin(origin), scope = accessScope(normalized)
    return { origin: normalized, scope, block: this.blockForScope(scope), events: this.eventsForScope(scope) }
  }

  private blockForScope(scope: string) {
    return this.store.db.select().from(originAccessBlocks).all()
      .filter((block) => accessScope(block.origin) === scope)
      .toSorted((left, right) => right.blockedUntil - left.blockedUntil)[0] ?? null
  }

  private eventsForScope(scope: string) {
    return this.store.db.select().from(originAccessEvents).orderBy(asc(originAccessEvents.occurredAt)).all()
      .filter((event) => accessScope(event.origin) === scope)
  }
}

function normalizeOrigin(value: string) {
  const url = new URL(value)
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) throw new Error("origin_access_origin_invalid")
  return url.origin
}

function accessScope(origin: string) {
  const url = new URL(origin), domain = getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname
  // WHY：访问压力由站点整体评估；协议、搜索域和详情域切换不能重置累计频次。
  return `https://${domain}`
}

function isHumanChallengeDeferral(reason: string) { return reason.startsWith("human_challenge:") }

function abortableWait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, milliseconds)
    signal.addEventListener("abort", aborted, { once: true })
    function done() { signal.removeEventListener("abort", aborted); resolve() }
    function aborted() { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")) }
  })
}
