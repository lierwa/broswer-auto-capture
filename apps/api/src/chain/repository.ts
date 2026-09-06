import { desc, eq, sql } from "drizzle-orm"
import { chainRecordSchema, type ChainRecord } from "@browser-capture/contracts/chain"
import { chains } from "../database/schema.js"
import type { ProductStore } from "../database/store.js"

export class ChainRepository {
  constructor(private store: ProductStore) {
    for (const row of store.db.select().from(chains).all()) {
      const record = chainRecordSchema.parse(row.body)
      if (!["exploring", "compiled", "validating"].includes(record.status)) continue
      record.status = "interrupted"; record.reason = "服务已中断，已验证历史保留；继续前需要核验授权及浏览器。"
      for (const audit of record.audits) if (audit.status === "intended") audit.status = "interrupted"
      this.save(record)
    }
  }
  list(taskId: string) {
    this.store.task(taskId)
    return this.store.db.select().from(chains).where(eq(chains.taskId, taskId)).orderBy(desc(sql`rowid`)).all().map((row) => chainRecordSchema.parse(row.body))
  }
  save(record: ChainRecord) {
    this.store.task(record.taskId); record.sequence++; record.updatedAt = new Date().toISOString()
    const body = chainRecordSchema.parse(record)
    this.store.db.insert(chains).values({ id: body.id, taskId: body.taskId, executionId: body.executionId, body })
      .onConflictDoUpdate({ target: chains.id, set: { body } }).run()
  }
}
