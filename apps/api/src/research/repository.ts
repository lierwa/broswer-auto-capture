import { desc, eq, sql } from "drizzle-orm"
import { researchRecordSchema, type ResearchRecord } from "@browser-capture/contracts/research"
import { researchRuns } from "../database/schema.js"
import type { ProductStore } from "../database/store.js"

export class ResearchRepository {
  constructor(private store: ProductStore) {
    for (const row of store.db.select().from(researchRuns).all()) {
      const record = researchRecordSchema.parse(row.body)
      if (record.status !== "running") continue
      record.status = "interrupted"; record.reason = "service_interrupted"; record.current = "服务已重启，已有证据保留，可重新调研。"
      for (const audit of record.audits) if (audit.status === "intended") audit.status = "interrupted"
      this.save(record)
    }
  }
  list(taskId: string) {
    this.store.task(taskId)
    return this.store.db.select().from(researchRuns).where(eq(researchRuns.taskId, taskId)).orderBy(desc(sql`rowid`)).all().map((row) => researchRecordSchema.parse(row.body))
  }
  save(record: ResearchRecord) {
    this.store.task(record.taskId)
    record.sequence += 1; record.updatedAt = new Date().toISOString()
    const body = researchRecordSchema.parse(record)
    this.store.db.insert(researchRuns).values({ id: body.id, taskId: body.taskId, body }).onConflictDoUpdate({ target: researchRuns.id, set: { body } }).run()
  }
}
