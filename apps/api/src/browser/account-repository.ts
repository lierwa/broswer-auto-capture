import { and, eq } from "drizzle-orm"
import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { accountCheckSchema, accountEntrySchema, accountMaintenanceSchema, accountMethodSchema,
  browserIdentitySchema } from "@browser-capture/contracts/browser-account"
import type { ProductStore } from "../database/store.js"
import { platformCheckSchema, platformMethodSchema, customBindingSchema, transferSchema, platformOperationSchema } from "@browser-capture/contracts/platform-account"
import { DomainError } from "../errors.js"
import { logicalAccountSchema, directoryOperationSchema, logicalAccountRevisionSchema, type LogicalAccount } from "@browser-capture/contracts/account-directory"

const facts = sqliteTable("browserAccountFacts", { kind: text().notNull(), id: text().primaryKey(),
  body: text({ mode: "json" }).$type<unknown>().notNull() })
const schemas = { identity: browserIdentitySchema, entry: accountEntrySchema, check: accountCheckSchema,
  maintenance: accountMaintenanceSchema, method: accountMethodSchema,
  platformCheck: platformCheckSchema, platformMethod: platformMethodSchema, binding: customBindingSchema, transfer: transferSchema, platformOperation: platformOperationSchema,
  logicalAccount: logicalAccountSchema, directoryOperation: directoryOperationSchema, logicalAccountRevision: logicalAccountRevisionSchema }
type Kind = keyof typeof schemas
type Fact<K extends Kind> = z.infer<typeof schemas[K]>

/** WHY：账号是 B-A-T 自有目录事实，仍使用原 ProductStore 的 SQLite/锁/事务。 */
export class AccountRepository {
  constructor(readonly store: ProductStore) {}
  list<K extends Kind>(kind: K): Fact<K>[] {
    return this.store.db.select().from(facts).where(eq(facts.kind, kind)).all()
      .map(row => schemas[kind].parse(row.body) as Fact<K>)
  }
  get<K extends Kind>(kind: K, id: string): Fact<K> {
    const row = this.store.db.select().from(facts).where(and(eq(facts.kind, kind), eq(facts.id, id))).get()
    if (!row) throw new DomainError("account_not_found", "账号记录已不存在，请刷新。", 404)
    return schemas[kind].parse(row.body) as Fact<K>
  }
  save<K extends Kind>(kind: K, raw: z.input<typeof schemas[K]>): Fact<K> {
    const body = schemas[kind].parse(raw) as Fact<K>
    const existing = this.store.db.select({ kind: facts.kind }).from(facts).where(eq(facts.id, body.id)).get()
    if (existing && existing.kind !== kind) throw new DomainError("account_fact_id_collision", "账号事实编号冲突，已保留原记录。", 409)
    this.store.db.insert(facts).values({ kind, id: body.id, body })
      .onConflictDoUpdate({ target: facts.id, set: { body } }).run()
    return body
  }
  saveLogical(account: LogicalAccount) {
    return this.store.db.transaction(() => {
      const previous = this.list("logicalAccount").find(v => v.id === account.id)
      if (previous && previous.revision !== account.revision) this.save("logicalAccountRevision", {
        id: randomUUID(), accountId: previous.id, archivedAt: new Date().toISOString(), account: previous })
      return this.save("logicalAccount", account)
    })
  }
  current(id: string, revision: number) {
    const entry = this.get("entry", id)
    if (entry.deletedAt || entry.revision !== revision) throw new DomainError("account_revision_changed", "平台资料已变化，请刷新后重试。", 409)
    return entry
  }
  active(identityId?: string) { return this.list("maintenance").find(value => value.status !== "closed"
    && (!identityId || value.browserIdentityId === identityId)) ?? null }
  usable(methodId: string) {
    const method = this.get("method", methodId)
    if (!method.chain || method.state !== "candidate") return false
    const checks = this.list("check").filter(check => check.methodId === methodId && check.auditComplete && check.modelCalls === 0)
    return checks.some(check => check.result?.outcome === "verified") && checks.some(check => check.result?.outcome === "unauthenticated")
  }
  recover() {
    for (const operation of this.list("directoryOperation")) if (!operation.finishedAt) this.save("directoryOperation", {
      ...operation, phase: "finished", status: "interrupted", finishedAt: new Date().toISOString(), reason: "服务重启，本次操作已中断，请重试。" })
    for (const operation of this.list("platformOperation")) if (!operation.finishedAt) this.save("platformOperation", {
      ...operation, status: "interrupted", finishedAt: new Date().toISOString(), reason: "服务重启，本次操作已中断；原登录窗口保留。" })
    for (const session of this.list("maintenance")) if (session.status !== "closed") this.save("maintenance", {
      ...session, status: "cleanup_required", reason: "服务已重启，请核验并释放原维护窗口。", updatedAt: new Date().toISOString() })
    for (const check of this.list("check")) if (!check.finishedAt) this.save("check", { ...check,
      finishedAt: new Date().toISOString(), runStatus: "interrupted", result: { outcome: "inconclusive",
        identityConfirmed: false, displayIdentity: null, reason: "interrupted" } })
    for (const method of this.list("method")) if (method.state === "building") this.save("method", {
      ...method, state: "failed", reason: "服务已重启，本次建立未完成。" })
    for (const check of this.list("platformCheck")) if (!check.finishedAt) this.save("platformCheck", {
      ...check, status: "interrupted", finishedAt: new Date().toISOString(), result: { status: "inconclusive", reason: "interrupted",
        identityKey: null, displayIdentity: null, identityConfirmed: false, sources: [], evidence: [], modelCalls: 0, globalInitSuppressed: false } })
    for (const transfer of this.list("transfer")) if (transfer.rollbackRef || !["completed", "rolled_back", "cancelled", "expired", "abandoned"].includes(transfer.status)) {
      const changed = Boolean(transfer.rollbackRef) || ["write_started", "checking_target", "rolling_back", "target_pending"].includes(transfer.status)
      this.save("transfer", { ...transfer, status: changed ? "target_pending" : "expired", confirmationRef: null,
        reason: changed ? "服务已重启，目标会话需要核验或恢复。" : "服务已重启，旧共享确认已失效。", updatedAt: new Date().toISOString() })
    }
  }
}
