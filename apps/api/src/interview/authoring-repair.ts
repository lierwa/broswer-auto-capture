import type { AuthoringTurnResult } from "@agent-platform/ai-connect/integration/authoring"
import type { InterviewMessagePart, InterviewState } from "@browser-capture/contracts/interview"
import type { AIModelProvider, PreparedMainAIModel } from "../ai/model.js"
import { createInterviewRepairAuthoring, interviewCanonicalMessages, parseInterviewAuthoringOutput } from "./protocol.js"
import type { InterviewSourceReferences } from "./source-references.js"
import { DraftValidationError } from "./draft-validation.js"

type RunInput = Parameters<PreparedMainAIModel["run"]>[0]
type UI = Parameters<typeof createInterviewRepairAuthoring>[2]

function repairFailure(error: unknown, result: AuthoringTurnResult): {
  root: "interview-markdown" | "question-panel"; reason: string;
} | null {
  const root = result.blocks.find((block) => block.rootTag === "interview-markdown" || block.rootTag === "question-panel")?.rootTag
  if (root !== "interview-markdown" && root !== "question-panel" || !(error instanceof Error)) return null
  // WHY：只修复作者输出格式。身份、来源真实性、流丢失、网络和持久化错误不得靠模型重试掩盖。
  const format = /^(?:interview_(?:authoring_invalid|authoring_cardinality_invalid|question_projection_invalid|output_invalid|result_and_completion_required|entry_section_required|entry_required|entry_order_invalid|navigation_scope_required|navigation_scope_invalid)|preparation_[a-z_]+(?::[^\r\n]+)?)$/u
  if (!format.test(error.message)) return null
  const diagnostics = result.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n")
  const reason = error instanceof DraftValidationError ? error.repairReason() : error.message
  return { root, reason: `${reason}\n${diagnostics}`.slice(0, 2_000) }
}

/** WHY：B-A-T 只编排一次领域准入修复；语法、注册与解析全部复用同一 AI Connect 协议。 */
export async function settleInterviewAuthoring(input: {
  result: AuthoringTurnResult; state: InterviewState; parts: InterviewMessagePart[];
  runId: string; questionId: string; references: InterviewSourceReferences; rejected: string;
  skill: string; ui: UI; provider: AIModelProvider; selection: PreparedMainAIModel["selection"];
  signal: AbortSignal; onEvent: RunInput["onEvent"]; onRepair(reason: string): void; onCompleted(): void;
}) {
  const parse = (result: AuthoringTurnResult, parts: InterviewMessagePart[]) => parseInterviewAuthoringOutput(
    result, input.state, parts, input.runId, input.questionId, false, input.references)
  let failure: ReturnType<typeof repairFailure>
  try { return { output: parse(input.result, input.parts) } }
  catch (error) {
    failure = repairFailure(error, input.result)
    if (!failure) throw error
  }
  input.signal.throwIfAborted()
  input.onRepair(failure.reason)
  const authoring = createInterviewRepairAuthoring(input.state, input.skill, input.ui, input.references,
    failure.root, failure.reason, input.rejected)
  // WHY：独立 repair session 无搜索 extension，原主调用不确认；成功以后再确认准确候选。
  const model = await input.provider.prepareMain(input.selection, "interview-repair")
  let streamed = "", acceptedInvocationId: string | undefined
  try {
    const generated = await model.run({
      runId: `${input.runId}:repair`, sessionId: `${input.runId}:repair`,
      messages: interviewCanonicalMessages(input.state), activeTask: authoring.prompt, tools: [], signal: input.signal,
      onEvent(event) {
        if (event.type === "text.delta") streamed += event.text
        if (event.type === "generation.completed") acceptedInvocationId = event.invocationId
        input.onEvent(event)
      },
    })
    input.onCompleted()
    input.signal.throwIfAborted()
    if (streamed !== generated.outputText) throw new Error("interview_authoring_stream_text_mismatch")
    if (!acceptedInvocationId) throw new Error("interview_model_history_incomplete")
    authoring.session.push(generated.outputText)
    const result = authoring.session.finish()
    // WHY：修复正文不混入流式历史；通过同一 parser 后一次替换可见结果，首败事件仍完整保留。
    const output = parse(result, result.text ? [{ id: `${input.runId}:text:repair`, type: "text", text: result.text }] : [])
    if (failure.root === "interview-markdown" ? !output.draft : !output.question) throw new Error("interview_output_invalid")
    return { output, acceptedInvocationId, confirmAcceptedStep: generated.confirmAcceptedStep, closeRepair: () => model.close() }
  } catch (error) {
    await model.close().catch(() => undefined)
    throw error
  }
}
