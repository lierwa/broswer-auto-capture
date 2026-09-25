import { z } from "zod"
import { digestJson } from "@browser-capture/runtime"

export const RUNNER_CLEANUP_STAGES = [
  "capability_close",
  "browser_close",
  "close_protocol",
  "child_exit",
  "process_tree",
  "temporary_directory",
] as const
export const runnerCleanupStageNameSchema = z.enum(RUNNER_CLEANUP_STAGES)
export const runnerCleanupStageStatusSchema = z.enum(["confirmed", "unconfirmed", "not_required"])
export const runnerCleanupCodeSchema = z.enum([
  "cleanup_capability_close_failed",
  "cleanup_browser_close_failed",
  "cleanup_close_protocol_timeout",
  "cleanup_close_protocol_rejected",
  "cleanup_close_protocol_invalid",
  "cleanup_close_protocol_unavailable",
  "cleanup_child_exit_timeout",
  "cleanup_child_exit_nonzero",
  "cleanup_child_exit_signal",
  "cleanup_process_tree_failed",
  "cleanup_process_tree_unconfirmed",
  "cleanup_temp_directory_failed",
])
export const runnerCleanupStageSchema = z.object({
  stage: runnerCleanupStageNameSchema,
  status: runnerCleanupStageStatusSchema,
  code: runnerCleanupCodeSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === "unconfirmed" && value.code === null) {
    context.addIssue({ code: "custom", path: ["code"], message: "unconfirmed cleanup stage requires a code" })
  }
  if (value.status !== "unconfirmed" && value.code !== null) {
    context.addIssue({ code: "custom", path: ["code"], message: "confirmed cleanup stage cannot carry an error code" })
  }
})

export const pythonCleanupResultSchema = z.object({
  closed: z.boolean(),
  stages: z.array(runnerCleanupStageSchema).length(2),
}).strict().superRefine((value, context) => {
  const names = value.stages.map((stage) => stage.stage)
  if (new Set(names).size !== 2 || !names.includes("capability_close") || !names.includes("browser_close")) {
    context.addIssue({ code: "custom", path: ["stages"], message: "python cleanup stages are incomplete" })
  }
  if (value.closed !== value.stages.every((stage) => stage.status !== "unconfirmed")) {
    context.addIssue({ code: "custom", path: ["closed"], message: "python cleanup conclusion does not match stages" })
  }
})

export type RunnerCleanupStage = z.infer<typeof runnerCleanupStageSchema>
export type RunnerCleanupCode = z.infer<typeof runnerCleanupCodeSchema>
export type PythonCleanupResult = z.infer<typeof pythonCleanupResultSchema>

const runnerCleanupReportFactsSchema = z.object({
  status: z.enum(["confirmed", "unconfirmed"]), code: runnerCleanupCodeSchema.nullable(),
  stages: z.array(runnerCleanupStageSchema).length(RUNNER_CLEANUP_STAGES.length),
  activeResources: z.boolean().nullable(),
}).strict()
export const runnerCleanupReportSchema = runnerCleanupReportFactsSchema.extend({
  evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((value, context) => {
  const { evidenceDigest, ...facts } = value
  if (digestJson(facts) !== evidenceDigest) {
    context.addIssue({ code: "custom", path: ["evidenceDigest"], message: "cleanup evidence digest mismatch" })
  }
})
export const executionCleanupAuditSchema = z.object({
  id: z.uuid(), taskId: z.string().min(1), executionId: z.uuid(), ownerId: z.string().min(1),
  attempt: z.number().int().positive(), source: z.enum(["runner", "owner_verification"]),
  status: z.enum(["confirmed", "unconfirmed"]), code: z.string().min(1).max(160).nullable(),
  activeResources: z.boolean().nullable(), evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  stages: z.array(runnerCleanupStageSchema).max(RUNNER_CLEANUP_STAGES.length), createdAt: z.string().datetime(),
}).strict()

export type RunnerCleanupReport = z.infer<typeof runnerCleanupReportSchema>
export type ExecutionCleanupAudit = z.infer<typeof executionCleanupAuditSchema>

export function cleanupReport(stages: RunnerCleanupStage[], activeResources: boolean | null): RunnerCleanupReport {
  const parsed = z.array(runnerCleanupStageSchema).length(RUNNER_CLEANUP_STAGES.length).superRefine((value, context) => {
    const names = value.map((stage) => stage.stage)
    if (new Set(names).size !== RUNNER_CLEANUP_STAGES.length
      || RUNNER_CLEANUP_STAGES.some((stage) => !names.includes(stage))) {
      context.addIssue({ code: "custom", message: "runner cleanup stages are incomplete" })
    }
  }).parse(stages)
  const failed = parsed.find((stage) => stage.status === "unconfirmed")
  const facts = { status: failed ? "unconfirmed" as const : "confirmed" as const,
    code: failed?.code ?? null, stages: parsed, activeResources }
  return runnerCleanupReportSchema.parse({ ...facts, evidenceDigest: digestJson(facts) })
}

export type RuntimePrimaryOutcome<T> =
  | { status: "completed"; value: T }
  | { status: "failed"; error: unknown }

export class RuntimeCleanupRequiredError<T = unknown> extends Error {
  readonly code = "runtime_cleanup_required"
  constructor(readonly ownerId: string, readonly report: RunnerCleanupReport,
    readonly primary: RuntimePrimaryOutcome<T>) {
    super("runtime_cleanup_required")
    this.name = "RuntimeCleanupRequiredError"
  }
}
