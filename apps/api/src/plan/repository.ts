import { desc, sql } from "drizzle-orm"
import { planRecordSchema, executionRecordSchema, type PlanRecord, type ExecutionRecord } from "@browser-capture/contracts/plan"
import { plans, executions } from "../database/schema.js"
import type { ProductStore } from "../database/store.js"

export class PlanRepository {
  constructor(private store: ProductStore) {
    for (const record of this.plans()) {
      if (record.status !== "generating") continue
      record.status = "interrupted"; record.reason = "服务已重启，计划生成中断，可重新生成。"
      if (record.audit.status === "intended") record.audit.status = "interrupted"
      this.savePlan(record)
    }
    for (const record of this.executions()) {
      if (record.status !== "running") continue
      record.status = "interrupted"; record.reason = "服务已重启，执行已中断；保留原授权，恢复前需要核验浏览器与检查点。"; this.saveExecution(record)
    }
  }
  plans() { return this.store.db.select().from(plans).orderBy(desc(sql`rowid`)).all().map((row) => planRecordSchema.parse(row.body)) }
  executions() { return this.store.db.select().from(executions).orderBy(sql`rowid`).all().map((row) => executionRecordSchema.parse(row.body)) }
  savePlan(record: PlanRecord) {
    this.store.task(record.taskId); record.sequence++; record.updatedAt = new Date().toISOString()
    const body = planRecordSchema.parse(record)
    this.store.db.insert(plans).values({ id: body.id, taskId: body.taskId, body }).onConflictDoUpdate({ target: plans.id, set: { body } }).run()
  }
  saveExecution(record: ExecutionRecord) {
    this.store.task(record.taskId); record.sequence++; record.updatedAt = new Date().toISOString()
    const body = executionRecordSchema.parse(record)
    this.store.db.insert(executions).values({ id: body.id, taskId: body.taskId, planId: body.planId, status: body.status, body })
      .onConflictDoUpdate({ target: executions.id, set: { status: body.status, body } }).run()
  }
}
