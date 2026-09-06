import { desc, eq, sql } from "drizzle-orm"
import { chainRecordSchema, type ChainRecord } from "@browser-capture/contracts/chain"
import { chains, executions, plans } from "../database/schema.js"
import { executionRecordSchema, type PlanRecord, type PlanProposal } from "@browser-capture/contracts/plan"
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
  candidate(plan: PlanRecord, step: PlanProposal["steps"][number]) {
    const compatible = this.store.db.select().from(plans).all().map((row) => row.body).filter((item) => item.taskId === plan.taskId
      && item.requirementVersion === plan.requirementVersion && item.requirementRevision === plan.requirementRevision && item.sourceDigest === plan.sourceDigest)
    const candidate = this.list(plan.taskId).find((chain) => chain.status === "verified" && compatible.some((previous) => previous.id === chain.planId
      && previous.proposal?.steps.some((oldStep) => oldStep.id === chain.stepId && oldStep.kind === step.kind
        && JSON.stringify([...oldStep.sourceIds].sort()) === JSON.stringify([...step.sourceIds].sort()))))
    return candidate ? { graph: candidate.graph, sample: candidate.sample, verification: candidate.verification,
      validationOutcomes: candidate.validationOutcomes } : null
  }
  repairRows(plan: PlanRecord, step: PlanProposal["steps"][number], fields: string[]) {
    const previous = this.store.db.select().from(executions).orderBy(desc(sql`rowid`)).all().map((row) => executionRecordSchema.parse(row.body))
      .filter((run) => run.taskId === plan.taskId && run.planId === plan.id)
      .map((run) => run.capture?.steps.find((item) => item.stepId === step.id)).find((item) => item?.rows.length)
    return previous?.rows.filter((row) => row.missing.length || fields.some((field) => !row.fields[field])).slice(0, 6) ?? []
  }
  save(record: ChainRecord) {
    this.store.task(record.taskId); record.sequence++; record.updatedAt = new Date().toISOString()
    const body = chainRecordSchema.parse(record)
    this.store.db.insert(chains).values({ id: body.id, taskId: body.taskId, executionId: body.executionId, body })
      .onConflictDoUpdate({ target: chains.id, set: { body } }).run()
  }
}
