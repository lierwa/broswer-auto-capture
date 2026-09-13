import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { InterviewMessage } from "@browser-capture/contracts/interview"
import type { ModelSelection } from "@agent-platform/ai-connect/client"
import type { BrowserRecord } from "@browser-capture/contracts/browser"
import type { JsonValue, TaskContract } from "@browser-capture/contracts"
import type { TaskAuthoringJob, TaskExecution } from "@browser-capture/contracts/api"

export const tasks = sqliteTable("tasks", {
  id: text().primaryKey(), title: text().notNull(), renamed: integer({ mode: "boolean" }).notNull(),
  archived: integer({ mode: "boolean" }).notNull(), updatedAt: text().notNull(),
  revision: integer().notNull(), sequence: integer().notNull(), confirmedVersion: integer(), activeTurnId: text(),
})
const taskId = () => text("taskId").notNull().references(() => tasks.id)
export const messages = sqliteTable("messages", {
  taskId: taskId(), id: text().notNull(), ordinal: integer().notNull(), body: text({ mode: "json" }).$type<InterviewMessage>().notNull(),
}, (table) => [primaryKey({ columns: [table.taskId, table.id] })])
export const drafts = sqliteTable("drafts", {
  taskId: taskId(), version: integer().notNull(), revision: integer().notNull(), title: text().notNull(), markdown: text().notNull(),
  brief: text({ mode: "json" }).$type<JsonValue | null>(),
}, (table) => [primaryKey({ columns: [table.taskId, table.version] })])
export const turns = sqliteTable("turns", {
  taskId: taskId(), id: text().notNull(), revision: integer().notNull(), userMessageId: text().notNull(), assistantMessageId: text().notNull(),
  status: text({ enum: ["running", "cancelling", "succeeded", "cancelled", "failed", "interrupted"] }).notNull(),
  reason: text(), createdAt: text().notNull(), completedAt: text(),
}, (table) => [primaryKey({ columns: [table.taskId, table.id] })])
export const questions = sqliteTable("questions", {
  taskId: taskId(), id: text().notNull(), revision: integer().notNull(),
  question: text({ mode: "json" }).$type<NonNullable<InterviewMessage["question"]>>().notNull(),
  status: text({ enum: ["open", "answered", "superseded", "resolved"] }).notNull(), answerMessageId: text(),
}, (table) => [primaryKey({ columns: [table.taskId, table.id] })])
export const decisions = sqliteTable("decisions", {
  taskId: taskId(), id: text().notNull(), revision: integer().notNull(), kind: text({ enum: ["option", "free_text", "draft_confirmation"] }).notNull(),
  text: text().notNull(), messageId: text(), questionId: text(), draftVersion: integer(), createdAt: text().notNull(),
}, (table) => [primaryKey({ columns: [table.taskId, table.id] })])
export const audits = sqliteTable("audits", {
  taskId: taskId(), ordinal: integer().notNull(), revision: integer().notNull(), model: text().notNull(), effort: text().notNull(), invocations: integer().notNull(),
}, (table) => [primaryKey({ columns: [table.taskId, table.ordinal] })])
export const operations = sqliteTable("operations", {
  scope: text().notNull(), requestId: text().notNull(), digest: text().notNull(), resultId: text().notNull(),
}, (table) => [primaryKey({ columns: [table.scope, table.requestId] })])
export const imports = sqliteTable("imports", { id: text().primaryKey(), digest: text().notNull(), createdAt: text().notNull() })
export const aiSettings = sqliteTable("aiSettings", {
  subjectId: text().primaryKey(), selection: text({ mode: "json" }).$type<ModelSelection>().notNull(),
})
export const browserRuns = sqliteTable("browserRuns", {
  runId: text().primaryKey(), taskId: taskId(), createdAt: text().notNull(), body: text({ mode: "json" }).$type<BrowserRecord>().notNull(),
})
export const plans = sqliteTable("plans", { id: text().primaryKey(), taskId: taskId(), body: text({ mode: "json" }).$type<JsonValue>().notNull() })
export const chains = sqliteTable("chains", { id: text().primaryKey(), taskId: taskId(), executionId: text().notNull().references(() => executions.id), body: text({ mode: "json" }).$type<JsonValue>().notNull() })
export const executions = sqliteTable("executions", { id: text().primaryKey(), taskId: taskId(), planId: text().notNull().references(() => plans.id),
  status: text().notNull(), body: text({ mode: "json" }).$type<JsonValue>().notNull() })

// 新协议使用独立事实表；旧 plans/chains/executions 只读保留，避免假迁移或破坏历史。
export const taskContracts = sqliteTable("taskContracts", {
  recordId: text().primaryKey(), taskId: taskId(), kind: text({ enum: ["requirement", "plan", "chain", "run"] }).notNull(),
  entityId: text().notNull(), version: integer().notNull(), digest: text().notNull(),
  body: text({ mode: "json" }).$type<TaskContract>().notNull(), createdAt: text().notNull(), updatedAt: text().notNull(),
}, (table) => [uniqueIndex("task_contract_identity").on(table.kind, table.entityId, table.version)])
export const taskAuthoringJobs = sqliteTable("taskAuthoringJobs", {
  id: text().primaryKey(), taskId: taskId(), type: text({ enum: ["plan", "chain"] }).notNull(),
  status: text().notNull(), body: text({ mode: "json" }).$type<TaskAuthoringJob>().notNull(),
})
export const taskExecutions = sqliteTable("taskExecutions", {
  id: text().primaryKey(), taskId: taskId(), planId: text().notNull(), status: text().notNull(),
  body: text({ mode: "json" }).$type<TaskExecution>().notNull(),
})
export const taskArtifacts = sqliteTable("taskArtifacts", {
  artifactId: text().primaryKey(), taskId: taskId(), runId: text().notNull(), mediaType: text().notNull(), digest: text().notNull(),
  body: text({ mode: "json" }).$type<JsonValue>().notNull(), createdAt: text().notNull(),
})
