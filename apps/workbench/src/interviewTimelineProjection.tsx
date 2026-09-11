import { Button } from "@radix-ui/themes";
import { ArrowRight, Check, FileText, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import {
  buildCommonSurfaceReplyPayload,
  commonQuestionAnswerFromSubmit,
  createCommonQuestionFromPanel,
  createCommonQuestionSurface,
  type CommonSurfaceQuestion,
} from "@agent-platform/ai-connect/ui-contracts";
import { projectAIInvocationTimeline } from "@agent-platform/ai-connect-react/components/AIInvocationTimeline";
import {
  commonQuestionModules,
  createAnsweredInteractionTimelineEntry,
  createQuestionModuleRegistry,
  projectInteractiveTimelineValue,
  type ConversationEntry,
  type InteractiveTimelineItem,
  type InteractiveTimelineProps,
  type InteractiveTimelineValue,
} from "@agent-platform/ai-connect-react/chat";
import type { InterviewMessage, InterviewState } from "./interviewContract.js";

type TimelineSubmit = Parameters<InteractiveTimelineProps["commands"]["submit"]>[0];
type QuestionSurface = NonNullable<InteractiveTimelineValue["presentedSurface"]>;
type ProjectionInput = {
  state: InterviewState;
  blocked: boolean;
  onDraft(version: number): void;
  onPlan(): void;
  onRetry(): Promise<void>;
};

export const interviewQuestionRegistry = createQuestionModuleRegistry(commonQuestionModules);

export function projectInterviewTimeline(input: ProjectionInput): InteractiveTimelineValue {
  const latest = input.state.messages.at(-1);
  const active = activeQuestionMessage(input.state);
  const activeSurface = active ? interviewQuestionSurface(active) : null;
  const activeInteraction = active && activeSurface
    ? {
        interactionId: active.id,
        kind: "question" as const,
        title: questionStem(activeSurface.questions[0]!),
        submitLabel: "提交回答",
        questions: [{
          header: questionStem(activeSurface.questions[0]!),
          question: questionStem(activeSurface.questions[0]!),
          options: questionOptions(activeSurface.questions[0]!),
        }],
        surface: activeSurface,
      }
    : null;
  const errorMessage = interviewErrorMessage(latest);
  return projectInteractiveTimelineValue({
    entries: projectInterviewEntries(input),
    activeInteraction,
    status: input.state.active
      ? "generating"
      : activeInteraction
        ? "waiting_for_user"
        : errorMessage
          ? "error"
          : "idle",
    hooks: projectInterviewActivity(input.state).hooks,
    currentRun: currentInterviewRun(input.state),
    canRetry: latest?.role === "assistant" && latest.status === "failed",
  });
}

export function projectInterviewEntries(input: ProjectionInput): ConversationEntry<InteractiveTimelineItem>[] {
  const times = interviewMessageTimes(input.state);
  const decisions = new Map(
    input.state.decisions
      .filter((decision) => decision.messageId && (decision.kind === "option" || decision.kind === "free_text"))
      .map((decision) => [decision.messageId!, decision] as const),
  );
  return input.state.messages.flatMap((message, index) => {
    const createdAt = times.incomplete ? index : times.byMessage.get(message.id)!;
    const decision = decisions.get(message.id);
    if (decision) {
      const answered = answeredInteractionEntry(input.state, decision, createdAt);
      if (answered) return [answered];
    }
    return messageEntries(message, index, createdAt, input);
  });
}

function messageEntries(
  message: InterviewMessage,
  index: number,
  createdAt: number,
  input: ProjectionInput,
): ConversationEntry<InteractiveTimelineItem>[] {
  const entries = message.parts?.length
    ? orderedMessagePartEntries(message, createdAt)
    : legacyMessageEntry(message, createdAt);
  // WHY：终态 parts 是正文与 Card 顺序的权威；旧消息才读取 parser 过滤后的 message.text。
  // AI text.delta 仍只进入公共 lifecycle/activity hooks，避免重复或泄露结构协议。
  entries.push(...assistantContentEntries(message, index, createdAt, input));
  return entries;
}

function orderedMessagePartEntries(
  message: InterviewMessage,
  createdAt: number,
): ConversationEntry<InteractiveTimelineItem>[] {
  return (message.parts ?? []).map((part, index) => {
    if (part.type === "card") return {
      id: part.card.id,
      role: message.role,
      createdAt,
      value: { kind: "card" as const, card: part.card },
    };
    const entryId = index === 0 ? message.id : `${message.id}:part:${part.id}`;
    return messageEntry(message, entryId, part.id, part.text, createdAt);
  });
}

function legacyMessageEntry(
  message: InterviewMessage,
  createdAt: number,
): ConversationEntry<InteractiveTimelineItem>[] {
  return message.text || message.status !== "running"
    ? [messageEntry(message, message.id, `${message.id}:text`, message.text, createdAt)]
    : [];
}

function messageEntry(
  message: InterviewMessage,
  entryId: string,
  partId: string,
  text: string,
  createdAt: number,
): ConversationEntry<InteractiveTimelineItem> {
  return {
    id: entryId,
    role: message.role,
    createdAt,
    value: { kind: "message", message: {
      id: entryId,
      role: message.role,
      createdAt,
      items: [{
        id: partId, messageId: message.id, role: message.role, createdAt,
        kind: "text", text, isStreaming: message.status === "running",
      }],
    } },
  };
}

function assistantContentEntries(
  message: InterviewMessage,
  index: number,
  createdAt: number,
  input: ProjectionInput,
): ConversationEntry<InteractiveTimelineItem>[] {
  if (message.role !== "assistant") return [];
  const content: Array<{ id: string; node: ReactNode }> = [];
  if (message.draftVersion) content.push({ id: "artifacts", node: (
    <TurnArtifacts item={message} state={input.state} onDraft={input.onDraft} />
  ) });
  if (index === input.state.messages.length - 1 && input.state.confirmedVersion) {
    content.push({ id: "confirmed", node: (
      <ConfirmedNext version={input.state.confirmedVersion} onPlan={input.onPlan} />
    ) });
  }
  if (index === input.state.messages.length - 1 && input.state.cancellationRequested) {
    content.push({ id: "cancelling", node: (
      <div className="turn-status" role="status"><LoaderCircle size={13} className="spin" />正在停止，保留已有对话</div>
    ) });
  }
  if (index === input.state.messages.length - 1 && message.status === "cancelled" && !input.blocked) {
    content.push({ id: "cancelled-retry", node: (
      <Button size="1" variant="soft" onClick={() => void input.onRetry().catch(() => undefined)}>重新提交本轮</Button>
    ) });
  }
  return content.map(({ id, node }) => ({
    id: `${message.id}:${id}`,
    role: "assistant" as const,
    createdAt,
    value: { kind: "content" as const, id: `${message.id}:${id}`, content: node },
  }));
}

function answeredInteractionEntry(
  state: InterviewState,
  decision: InterviewState["decisions"][number],
  createdAt: number,
): ConversationEntry<InteractiveTimelineItem> | null {
  if (!decision.questionId) return null;
  const answerMessage = decision.messageId
    ? state.messages.find((message) => message.id === decision.messageId)
    : undefined;
  if (answerMessage?.interactionReply
    && answerMessage.interactionReply.surfaceId === decision.questionId) {
    return createAnsweredInteractionTimelineEntry({
      createdAt,
      interaction: {
        interactionId: decision.questionId,
        kind: "common_surface",
        state: "submitted",
        surface: answerMessage.interactionReply.surface,
        surfaceSubmit: answerMessage.interactionReply.surfaceSubmit,
      },
    });
  }
  const source = state.messages.find((message) => message.id === decision.questionId);
  const surface = source ? interviewQuestionSurface(source) : null;
  if (!surface) return null;
  const data = answerData(source!, decision);
  if (!data) return null;
  return createAnsweredInteractionTimelineEntry({
    createdAt,
    interaction: {
      interactionId: decision.questionId,
      kind: "common_surface",
      state: "submitted",
      surface,
      surfaceSubmit: {
        answers: [{ questionId: decision.questionId, data }],
        displayText: decision.text,
      },
    },
  });
}

function answerData(message: InterviewMessage, decision: InterviewState["decisions"][number]) {
  if (!message.question || !("prompt" in message.question)) return null;
  if (decision.kind === "free_text" && message.question.options.length === 0) return { text: decision.text };
  if (decision.kind !== "option" || !message.question.options.length) return null;
  const selectedIndex = message.question.options.findIndex((option) => option.label === decision.text);
  return selectedIndex < 0 ? null : { selectedOptionIds: [optionId(selectedIndex)] };
}

function activeQuestionMessage(state: InterviewState) {
  if (state.active) return undefined;
  const latest = state.messages.at(-1);
  if (latest?.role !== "assistant" || !latest.question) return undefined;
  return state.unresolved.some((item) => item.id === latest.id && item.status === "open") ? latest : undefined;
}

const optionId = (index: number) => `option:${index + 1}`;

function interviewQuestionSurface(message: InterviewMessage): QuestionSurface | null {
  if (message.role !== "assistant" || !message.question) return null;
  const question = message.question;
  let canonical: CommonSurfaceQuestion;
  if ("prompt" in question) {
    if (question.options.length > 0
      && new Set(question.options.map((option) => option.label)).size !== question.options.length) return null;
    canonical = createCommonQuestionFromPanel({ id: message.id, panel: {
      mode: question.options.length ? "choice" : "free_form",
      prompt: question.prompt,
      options: question.options.map((option, index) => ({ id: optionId(index), ...option })),
      ...(question.options.length ? { inputs: [{ id: "other", label: "其他补充", kind: "textarea", role: "follow_up",
        placeholder: "补充选项之外的约束或说明（可选）" }] } : {
        placeholder: "直接回答当前问题，或补充你的要求……", multiline: true,
      }),
    } });
  } else canonical = question;
  try {
    return createCommonQuestionSurface({ id: message.id, submitLabel: "提交回答", questions: [canonical] });
  } catch { return null; }
}

export function submittedInterviewAnswer(state: InterviewState, submission: TimelineSubmit) {
  const active = activeQuestionMessage(state);
  const surface = active ? interviewQuestionSurface(active) : null;
  const answer = surface ? commonQuestionAnswerFromSubmit({
    surface, submit: submission, questionId: active!.id,
  }) : undefined;
  if (!active || !surface || !answer) throw new Error("interview_answer_invalid");
  return {
    text: commonAnswerText(surface.questions[0]!, answer),
    answer: {
      type: "common_question" as const,
      questionId: active.id,
      surfaceSubmit: buildCommonSurfaceReplyPayload({ surface, submit: submission }).surfaceSubmit,
    },
  };
}

function questionStem(question: CommonSurfaceQuestion) {
  return (question.data as { stem: string }).stem;
}

function questionOptions(question: CommonSurfaceQuestion) {
  if (question.type !== "choice" && question.type !== "multi_choice") return [];
  return (question.data as { options: Array<{ label: string; subtitle?: string }> }).options
    .map(({ label, subtitle }) => ({ label, description: subtitle ?? "" }));
}

function commonAnswerText(question: CommonSurfaceQuestion, answer: Record<string, unknown>) {
  if (question.type === "free_form") return String(answer.text);
  const data = question.data as { options: Array<{ id: string; label: string }>; inputs?: Array<{ id: string; label: string }> };
  const lines = (answer.selectedOptionIds as string[])
    .map((id) => data.options.find((option) => option.id === id)!.label);
  const values = answer.inputValues as Record<string, string> | undefined;
  for (const input of data.inputs ?? []) {
    const value = values?.[input.id]?.trim();
    if (value) lines.push(`${input.label}：${value}`);
  }
  return lines.join("\n");
}

export function interviewMessageTimes(state: InterviewState) {
  const byMessage = new Map<string, number>();
  for (const turn of state.turns) {
    const createdAt = Date.parse(turn.createdAt);
    if (!Number.isFinite(createdAt)) continue;
    byMessage.set(turn.userMessageId, createdAt);
    byMessage.set(turn.assistantMessageId, createdAt);
  }
  return { byMessage, incomplete: state.messages.some((message) => !byMessage.has(message.id)) };
}

function projectInterviewActivity(state: InterviewState) {
  return projectAIInvocationTimeline(state.messages.flatMap((message) => message.aiEvents));
}

function currentInterviewRun(state: InterviewState): InteractiveTimelineValue["currentRun"] {
  const latest = state.messages.at(-1);
  if (!state.active && latest?.status !== "failed") return null;
  const turn = state.turns.find((candidate) => candidate.id === state.activeTurnId)
    ?? state.turns.findLast((candidate) => candidate.assistantMessageId === latest?.id);
  if (!turn) return null;
  const createdAt = Date.parse(turn.createdAt);
  return {
    id: turn.id,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    status: latest?.status === "failed" ? "error" : latest?.text ? "streaming" : "working",
    ...(state.cancellationRequested ? { statusText: "正在停止" } : {}),
  };
}

export function interviewErrorMessage(message: InterviewMessage | undefined) {
  return message?.role === "assistant" && message.status === "failed" ? "本轮结果未提交，可以重试。" : undefined;
}

function ConfirmedNext({ version, onPlan }: { version: number; onPlan(): void }) {
  return <div className="confirmed-next"><Check size={16} /><div><strong>需求 v{version} 已确认</strong>
    <p>接下来依据这份范围制定计划，并按需核验真实来源。</p></div>
    <Button variant="soft" onClick={onPlan}>制定抓取计划<ArrowRight size={14} /></Button></div>;
}

function TurnArtifacts({ item, state, onDraft }: { item: InterviewMessage; state: InterviewState; onDraft: (v: number) => void }) {
  return <button type="button" className="draft-artifact" onClick={() => onDraft(item.draftVersion!)}>
    <FileText size={22} /><span><strong>{state.drafts.find((draft) => draft.version === item.draftVersion)?.title ?? "需求草稿"}</strong>
      <small>需求草稿 · v{item.draftVersion} · {state.confirmedVersion === item.draftVersion ? "已确认" : "查看内容"}</small>
    </span><ArrowRight size={16} /></button>;
}
