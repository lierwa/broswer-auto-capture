/* Product Alignment:
 * natural-language task: a user explains where an existing browser task ran incorrectly.
 * reusable chain boundary: one validated operation set changes the reusable chain only after acceptance.
 * runtime inputs: the source execution input remains immutable; a later trial supplies new input.
 * dynamic task outputs: original result/failure evidence and later trial results stay execution-owned.
 * generic platform capability used: versioned drafts, chain operations, immutable executions, SQLite jobs.
 * replay model calls: zero except an explicit llm node; user-requested suggestion is a separate audited model use.
 * site/task-specific code added: no.
 */
import type { TaskDraft, TaskRun } from "@browser-capture/contracts"
import { z } from "zod"
import { taskAuthoringJobSchema, type TaskAdjustmentRecord, type TaskAuthoringJob,
  type TaskChainCommand, type TaskExecution } from "@browser-capture/contracts/api"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import type { ProductStore } from "../database/store.js"
import { DomainError } from "../errors.js"
import { draftFromRelease, draftReference, previewTaskDraftAdjustment, releaseReference } from "./chain-revision.js"
import { appendExecutionReview } from "./execution-review.js"
import type { TaskProductService } from "./product.js"
import type { TaskContractRepository } from "./repository.js"
import { adjustmentPrompt, adjustmentSuggestionJsonSchema, adjustmentSuggestionSchema, parseAdjustmentSuggestion,
  type AdjustmentSuggestion } from "./adjustment-prompt.js"
import { savedAdjustmentSuggestion } from "./adjustment-recovery.js"

type Request = Extract<TaskChainCommand, { type: "request_chain_adjustment" }>
type Accept = Extract<TaskChainCommand, { type: "accept_chain_adjustment" }>
type Recover = Extract<TaskChainCommand, { type: "recover_chain_adjustment" }>
type Decline = Extract<TaskChainCommand, { type: "reject_chain_adjustment" | "cancel_chain_adjustment" }>

export class TaskAdjustmentService {
  constructor(private readonly store: ProductStore, private readonly repository: TaskContractRepository,
    private readonly product: TaskProductService, private readonly ai: AIModelProvider,
    private readonly assertExecutable: (taskId: string,
      chains: TaskDraft["content"]["steps"][number]["chain"][]) => void) {}

  request(taskId: string, command: Request) {
    return this.store.db.transaction(() => {
      if (this.store.operation("task-adjustment:request", command.requestId, command)) return null
      const previous = this.repository.latestAdjustmentJob(taskId)
      if (previous && ["generating", "pending"].includes(previous.adjustment?.decision ?? "")
        && ["queued", "running", "waiting_for_human"].includes(previous.status)) {
        throw new DomainError("adjustment_active", "请先处理当前修改建议，再提出新的问题。", 409)
      }
      const execution = this.repository.execution(taskId, command.executionId)
      const currentDraft = this.repository.draft(taskId)
      const release = this.product.currentRelease(taskId)
      if (currentDraft) this.product.assertCurrentDraftRequirement(taskId, currentDraft)
      if (!currentDraft && (!release || !execution.release || !sameReference(execution.release, releaseReference(release)))) {
        throw new DomainError("adjustment_source_stale", "原运行不属于当前发布版本；请先查看版本或需求。", 409)
      }
      const reviewed = appendExecutionReview(execution, { ...command, decision: "chain_revision", feedback: command.feedback })
      const step = reviewed.steps.find((item) => sameReference(item.chain, command.chain))
      if (!step || command.stepId && command.stepId !== step.stepId) {
        throw new DomainError("adjustment_step_mismatch", "所选步骤不属于这次运行。", 409)
      }
      const baselineStep = sourceContent(currentDraft, release)?.steps.find((item) => item.stepId === step.stepId)
      if (!baselineStep || !sameReference({ id: baselineStep.chain.id, version: baselineStep.chain.version,
        digest: executableChainDigest(baselineStep.chain) }, command.chain)) {
        throw new DomainError("adjustment_source_stale", "原运行链路与当前显示的草稿或发布版本不同，请重新定位。", 409)
      }
      if (command.nodeId && !baselineStep.chain.nodes.some((node) => node.id === command.nodeId)) {
        throw new DomainError("adjustment_node_mismatch", "所选动作已不在当前链路中。", 409)
      }
      const baseline: TaskAdjustmentRecord["baseline"] = currentDraft
        ? { kind: "draft", draft: draftReference(currentDraft) }
        : { kind: "release", release: releaseReference(release!) }
      const now = new Date(Math.max(Date.now(), Date.parse(previous?.updatedAt ?? "1970-01-01T00:00:00.000Z") + 1))
        .toISOString(), id = stableUuid(taskId, "chain-adjustment", command.requestId)
      const runs = this.sourceRuns(taskId, reviewed)
      const job = taskAuthoringJobSchema.parse({ id, taskId, type: "adjustment", key: command.requestId,
        status: "queued", sequence: 0, reason: "问题与运行证据已保存，等待生成修改建议。",
        resultId: null, browserRunId: null, waitpoint: null, audit: null,
        adjustment: { sourceExecutionId: reviewed.id, sourceEvidenceDigest: evidenceDigest(reviewed, runs),
          sourceChain: command.chain, stepId: step.stepId, nodeId: command.nodeId,
          feedback: command.feedback, baseline, candidate: null, decision: "generating", guidance: null,
          acceptedDraft: null }, createdAt: now, updatedAt: now })
      this.repository.saveExecution(reviewed)
      this.repository.saveJob(job)
      this.store.recordOperation("task-adjustment:request", command.requestId, command, id)
      return job
    })
  }

  async generate(taskId: string, jobId: string, signal: AbortSignal) {
    try {
      const started = this.store.db.transaction(() => {
        const job = this.repository.job(taskId, jobId)
        if (job.status !== "queued" || job.adjustment?.decision !== "generating"
          || this.repository.latestAdjustmentJob(taskId)?.id !== job.id) return null
        const base = this.baseDraft(taskId, job.adjustment)
        const execution = this.repository.execution(taskId, job.adjustment.sourceExecutionId)
        const runs = this.sourceRuns(taskId, execution)
        const requirement = this.repository.requirement(taskId, base.requirement.version)
        if (digestJson(requirement) !== base.requirement.digest) {
          throw new DomainError("adjustment_requirement_stale", "已确认需求发生变化，请重新定位。", 409)
        }
        const selection = this.ai.selection()
        job.status = "running"; job.sequence++; job.reason = "正在依据已保存的需求、链路和运行证据生成建议。"
        job.audit = { purpose: "chain_adjustment", model: selection.modelId, effort: selection.reasoningEffort,
          status: "intended", reportedInvocations: null, events: [], escalations: [] }
        job.updatedAt = new Date().toISOString(); this.repository.saveJob(job)
        return { job, base, execution, runs, requirement, selection }
      })
      if (!started) return
      if (signal.aborted) throw new Error("adjustment_aborted")
      const { job, base, execution, runs, requirement, selection } = started
      const model = await this.ai.prepare(selection, signal)
      const onEvent: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"] = (event) => {
        this.store.db.transaction(() => {
          const current = this.repository.job(taskId, jobId)
          if (current.status !== "running" || current.adjustment?.decision !== "generating" || !current.audit) return
          current.audit.events.push(event); current.updatedAt = new Date().toISOString()
          this.repository.saveJob(current)
        })
      }
      const raw = await model.generateObject({
        prompt: adjustmentPrompt({ requirement, base, execution, adjustment: job.adjustment!, runs }),
        jsonSchema: adjustmentSuggestionJsonSchema(), parse: (value) => adjustmentSuggestionSchema.parse(value),
        signal, onEvent,
      })
      if (signal.aborted) throw new Error("adjustment_aborted")
      this.finish(taskId, jobId, parseAdjustmentSuggestion(raw), signal)
    } catch (error) { this.fail(taskId, jobId, signal, error) }
  }

  private finish(taskId: string, jobId: string, result: AdjustmentSuggestion, signal: AbortSignal) {
    this.store.db.transaction(() => {
      const job = this.repository.job(taskId, jobId)
      if (signal.aborted || job.status !== "running" || job.adjustment?.decision !== "generating"
        || this.repository.latestAdjustmentJob(taskId)?.id !== job.id) return
      const adjustment = job.adjustment
      const base = this.baseDraft(taskId, adjustment)
      if (result.decision === "suggestion") {
        adjustment.candidate = this.candidateFor(taskId, adjustment, base, result)
        adjustment.decision = "pending"
        job.reason = "建议已通过链路合同校验，等待用户查看差异并决定。"
      } else {
        if (result.operations !== null || !result.question) {
          throw new DomainError("adjustment_suggestion_invalid", "澄清或需求返回缺少准确问题。", 409)
        }
        adjustment.decision = result.decision === "clarification" ? "needs_clarification" : "requirement_revision"
        adjustment.guidance = result.question
        job.reason = result.decision === "clarification" ? "现有证据不足，请补充说明后重新提出修改。"
          : "问题涉及需求目标、来源或结果理解，请返回需求对话。"
      }
      job.status = "waiting_for_human"; job.sequence++; job.updatedAt = new Date().toISOString()
      if (job.audit) { job.audit.status = "completed"; job.audit.reportedInvocations = completedCalls(job.audit.events) }
      this.repository.saveJob(job)
    })
  }

  recovery(taskId: string, job: TaskAuthoringJob | null) {
    if (!job || job.type !== "adjustment" || job.status !== "failed") return null
    try {
      this.recoverableCandidate(taskId, job)
      return { jobId: job.id, available: true,
        reason: "已保存完整模型输出；可在不再次调用模型或浏览器的情况下恢复建议供审阅。" }
    } catch (error) {
      return { jobId: job.id, available: false,
        reason: error instanceof DomainError ? error.message : failureMessage(error) }
    }
  }

  recover(taskId: string, command: Recover) {
    return this.store.db.transaction(() => {
      if (this.store.operation("task-adjustment:recover", command.requestId, command)) return
      const source = this.repository.job(taskId, command.jobId)
      if (source.sequence !== command.expectedSequence) {
        throw new DomainError("adjustment_stale", "失败记录已变化，请刷新后重试。", 409)
      }
      const candidate = this.recoverableCandidate(taskId, source)
      const now = new Date(Math.max(Date.now(), Date.parse(source.updatedAt) + 1)).toISOString()
      const id = stableUuid(taskId, "chain-adjustment-recovery", command.requestId)
      // WHY：旧失败 job 与其模型审计只读保留；恢复只建一份派生审阅 job，不重新生成或修改草稿。
      const job = taskAuthoringJobSchema.parse({ id, taskId, type: "adjustment", key: source.key,
        status: "waiting_for_human", sequence: 0, reason: "已从保存的模型输出恢复建议，等待用户审阅；未再次调用模型或浏览器。",
        resultId: null, browserRunId: null, waitpoint: null, audit: null,
        adjustment: { ...source.adjustment!, candidate, decision: "pending", recoveredFromJobId: source.id,
          guidance: null, acceptedDraft: null }, createdAt: now, updatedAt: now })
      this.repository.saveJob(job)
      this.store.recordOperation("task-adjustment:recover", command.requestId, command, job.id)
    })
  }

  private recoverableCandidate(taskId: string, source: TaskAuthoringJob) {
    if (this.repository.latestAdjustmentJob(taskId)?.id !== source.id) {
      throw new DomainError("adjustment_superseded", "已有更新的修改请求；旧输出不能恢复。", 409)
    }
    const result = savedAdjustmentSuggestion(source)
    const base = this.baseDraft(taskId, source.adjustment!)
    return this.candidateFor(taskId, source.adjustment!, base, result)
  }

  private candidateFor(taskId: string, adjustment: TaskAdjustmentRecord, base: TaskDraft,
    result: AdjustmentSuggestion) {
    if (!result.operations || result.question !== null
      || result.operations.some((item) => item.chainId !== adjustment.sourceChain.id)) {
      throw new DomainError("adjustment_suggestion_invalid", "建议不属于所选链路或缺少完整操作。", 409)
    }
    const preview = previewTaskDraftAdjustment(base, result.operations,
      (chainId) => this.repository.nextChainVersion(taskId, chainId))
    this.assertExecutable(taskId, preview.draft.content.steps.map((step) => step.chain))
    return { summary: result.summary, rationale: result.rationale,
      provenance: "model_generated" as const, operations: result.operations,
      content: preview.draft.content, digest: digestJson(preview.draft.content), diff: preview.diff }
  }

  private fail(taskId: string, jobId: string, signal: AbortSignal, error: unknown) {
    this.store.db.transaction(() => {
      const job = this.repository.job(taskId, jobId)
      if (!["queued", "running"].includes(job.status) || job.adjustment?.decision !== "generating") return
      job.status = signal.aborted ? "interrupted" : "failed"; job.sequence++
      job.reason = signal.aborted ? "建议生成已中断；原运行和链路未改变，可重新提出请求。"
        : `建议生成未完成：${failureMessage(error)}`
      job.updatedAt = new Date().toISOString()
      if (job.audit?.status === "intended") job.audit.status = signal.aborted ? "interrupted" : "failed"
      if (job.audit) job.audit.reportedInvocations = completedCalls(job.audit.events)
      this.repository.saveJob(job)
    })
  }

  accept(taskId: string, command: Accept) {
    return this.store.db.transaction(() => {
      if (this.store.operation("task-adjustment:accept", command.requestId, command)) return
      const job = this.pending(taskId, command.jobId, command.expectedSequence, "pending")
      const proposal = job.adjustment!.candidate!
      this.assertCandidateProvenance(taskId, job)
      const base = this.baseDraft(taskId, job.adjustment!)
      const preview = previewTaskDraftAdjustment(base, proposal.operations,
        (chainId) => this.repository.nextChainVersion(taskId, chainId))
      if (digestJson(preview.draft.content) !== proposal.digest
        || digestJson(preview.diff) !== digestJson(proposal.diff)) {
        throw new DomainError("adjustment_candidate_stale", "建议内容与当前校验结果不一致，请重新提出。", 409)
      }
      this.assertExecutable(taskId, preview.draft.content.steps.map((step) => step.chain))
      this.repository.saveDraft(preview.draft)
      job.adjustment!.acceptedDraft = draftReference(preview.draft)
      job.adjustment!.decision = "accepted"
      job.status = "completed"; job.sequence++; job.reason = "建议已应用到唯一工作草稿；需要重新试跑验证。"
      job.updatedAt = new Date().toISOString()
      this.repository.saveJob(job)
      this.store.recordOperation("task-adjustment:accept", command.requestId, command, preview.draft.id)
    })
  }

  private assertCandidateProvenance(taskId: string, job: TaskAuthoringJob) {
    const proposal = job.adjustment!.candidate!
    if (proposal.provenance !== "model_generated") {
      throw new DomainError("adjustment_untrusted", "修改建议缺少可信生成审计，不能应用。", 409)
    }
    const sourceId = job.adjustment!.recoveredFromJobId
    if (!sourceId) {
      if (job.audit?.purpose !== "chain_adjustment" || job.audit.status !== "completed") {
        throw new DomainError("adjustment_untrusted", "修改建议缺少可信生成审计，不能应用。", 409)
      }
      return
    }
    const source = this.repository.job(taskId, sourceId), original = source.adjustment
    const output = savedAdjustmentSuggestion(source)
    if (!original || digestJson({ ...original, candidate: null, decision: "generating", recoveredFromJobId: null })
      !== digestJson({ ...job.adjustment, candidate: null, decision: "generating", recoveredFromJobId: null })
      || digestJson({ summary: output.summary, rationale: output.rationale, operations: output.operations })
        !== digestJson({ summary: proposal.summary, rationale: proposal.rationale, operations: proposal.operations })) {
      throw new DomainError("adjustment_untrusted", "恢复建议与原模型输出不一致，不能应用。", 409)
    }
  }

  decline(taskId: string, command: Decline) {
    return this.store.db.transaction(() => {
      const scope = command.type === "reject_chain_adjustment" ? "task-adjustment:reject" : "task-adjustment:cancel"
      if (this.store.operation(scope, command.requestId, command)) return
      const job = command.type === "reject_chain_adjustment"
        ? this.pending(taskId, command.jobId, command.expectedSequence, "pending")
        : this.cancellable(taskId, command.jobId, command.expectedSequence)
      job.adjustment!.decision = command.type === "reject_chain_adjustment" ? "rejected" : "cancelled"
      job.status = "completed"; job.sequence++
      if (job.audit?.status === "intended") job.audit.status = "interrupted"
      job.reason = command.type === "reject_chain_adjustment" ? "用户未采用建议；链路保持原样。" : "修改请求已取消；链路保持原样。"
      job.updatedAt = new Date().toISOString()
      this.repository.saveJob(job)
      this.store.recordOperation(scope, command.requestId, command, job.id)
    })
  }

  private pending(taskId: string, jobId: string, sequence: number,
    ...decisions: TaskAdjustmentRecord["decision"][]): TaskAuthoringJob {
    const job = this.repository.job(taskId, jobId)
    if (job.type !== "adjustment" || !job.adjustment || job.sequence !== sequence
      || job.status !== "waiting_for_human" || !decisions.includes(job.adjustment.decision)) {
      throw new DomainError("adjustment_stale", "修改请求已变化，请刷新后重新查看。", 409)
    }
    if (this.repository.latestAdjustmentJob(taskId)?.id !== job.id) {
      throw new DomainError("adjustment_superseded", "已有更新的修改请求；这份建议不能再应用。", 409)
    }
    return job
  }

  private cancellable(taskId: string, jobId: string, sequence: number) {
    const job = this.repository.job(taskId, jobId)
    if (job.type !== "adjustment" || !job.adjustment || job.sequence !== sequence
      || !["queued", "running", "waiting_for_human", "failed", "interrupted"].includes(job.status)
      || ["accepted", "rejected", "cancelled"].includes(job.adjustment.decision)) {
      throw new DomainError("adjustment_stale", "修改请求已变化，请刷新后重新查看。", 409)
    }
    if (this.repository.latestAdjustmentJob(taskId)?.id !== job.id) {
      throw new DomainError("adjustment_superseded", "已有更新的修改请求；这份建议不能再应用。", 409)
    }
    return job
  }

  private sourceRuns(taskId: string, execution: TaskExecution): TaskRun[] {
    return execution.steps.flatMap((step) => step.runIds.map((id) => this.repository.run(taskId, id)))
  }

  private baseDraft(taskId: string, adjustment: TaskAdjustmentRecord) {
    const execution = this.repository.execution(taskId, adjustment.sourceExecutionId)
    if (evidenceDigest(execution, this.sourceRuns(taskId, execution)) !== adjustment.sourceEvidenceDigest) {
      throw new DomainError("adjustment_evidence_stale", "原运行证据已变化，请重新确认问题。", 409)
    }
    if (adjustment.baseline.kind === "draft") {
      const draft = this.repository.draft(taskId)
      if (!draft || draft.id !== adjustment.baseline.draft.id
        || draft.revision !== adjustment.baseline.draft.revision
        || draft.checksum !== adjustment.baseline.draft.checksum) {
        throw new DomainError("adjustment_baseline_stale", "活动草稿已变化，请重新生成修改建议。", 409)
      }
      this.product.assertCurrentDraftRequirement(taskId, draft)
      return draft
    }
    if (this.repository.draft(taskId)) {
      throw new DomainError("adjustment_baseline_stale", "已有活动草稿，不能覆盖它。", 409)
    }
    const release = this.product.currentRelease(taskId)
    if (!release || !sameReference(releaseReference(release), adjustment.baseline.release)) {
      throw new DomainError("adjustment_baseline_stale", "发布基线已变化，请重新生成修改建议。", 409)
    }
    return draftFromRelease(release)
  }
}

function sourceContent(draft: TaskDraft | null, release: ReturnType<TaskProductService["currentRelease"]>) {
  return draft?.content ?? release?.content
}

function evidenceDigest(execution: TaskExecution, runs: TaskRun[]) {
  // WHY：建议依据整次已审阅运行与其节点事件；任一来源事实变化都使待接受候选失效。
  return digestJson({ execution, runs })
}

function completedCalls(events: NonNullable<TaskAuthoringJob["audit"]>["events"]) {
  const started = new Set(events.filter((event) => event.type === "generation.started").map((event) => event.invocationId))
  const completed = new Set(events.filter((event) => event.type === "generation.completed").map((event) => event.invocationId))
  return started.size > 0 && [...started].every((id) => completed.has(id)) ? completed.size : null
}

function failureMessage(error: unknown) {
  if (error instanceof DomainError) return error.message
  if (error instanceof z.ZodError) {
    const issues = error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "根对象"}：${issue.code}`)
    return `模型候选不符合节点操作合同（${issues.join("；")}）。原链路未改变，请核对反馈后重新提出。`
  }
  return "模型没有完成可校验建议；原链路未改变。请检查模型设置或稍后重新提出。"
}

function sameReference(left: { id: string; version: number; digest: string }, right: typeof left) {
  return left.id === right.id && left.version === right.version && left.digest === right.digest
}
