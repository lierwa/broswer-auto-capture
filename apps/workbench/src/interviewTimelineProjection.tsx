import { Button } from "@radix-ui/themes";
import { ArrowRight, Check, FileText, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
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
  onSources(): void;
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
        title: active.question!.prompt,
        submitLabel: "提交回答",
        questions: [{
          header: active.question!.prompt,
          question: active.question!.prompt,
          options: active.question!.options.map(({ label, description }) => ({ label, description })),
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
  const entries: ConversationEntry<InteractiveTimelineItem>[] = [];
  // WHY：ProductStore 的 message.text 是 authoring parser 过滤后的业务正文；AI text.delta 仍含
  // 非渲染结构块。调用事件只进入公共 lifecycle/activity hooks，避免正文重复或泄露结构协议。
  if (message.text || message.status !== "running") {
    entries.push({
      id: message.id,
      role: message.role,
      createdAt,
      value: {
        kind: "message",
        message: {
          id: message.id,
          role: message.role,
          createdAt,
          items: [{
            id: `${message.id}:text`, messageId: message.id, role: message.role, createdAt,
            kind: "text", text: message.text, isStreaming: message.status === "running",
          }],
        },
      },
    });
  }
  entries.push(...assistantContentEntries(message, index, createdAt, input));
  return entries;
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
      <ConfirmedNext version={input.state.confirmedVersion} onSources={input.onSources} />
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
  if (decision.kind === "free_text" && message.question?.options.length === 0) return { text: decision.text };
  if (decision.kind !== "option" || !message.question?.options.length) return null;
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
  if (question.options.length > 0
    && new Set(question.options.map((option) => option.label)).size !== question.options.length) return null;
  return {
    id: message.id,
    submitLabel: "提交回答",
    questions: question.options.length
      ? [{
          id: message.id,
          type: "choice",
          data: {
            stem: question.prompt,
            options: question.options.map((option, index) => ({
              id: optionId(index), label: option.label, subtitle: option.description, recommended: option.recommended,
            })),
          },
        }]
      : [{
          id: message.id,
          type: "free_form",
          data: { stem: question.prompt, placeholder: "直接回答当前问题，或补充你的要求……", multiline: true },
        }],
  };
}

export function submittedInterviewAnswer(state: InterviewState, submission: TimelineSubmit) {
  const active = activeQuestionMessage(state);
  const answer = submission.answers.length === 1 ? submission.answers[0] : null;
  if (!active || answer?.questionId !== active.id || !answer.data || typeof answer.data !== "object" || Array.isArray(answer.data)) {
    throw new Error("interview_answer_invalid");
  }
  if (active.question!.options.length === 0) {
    const text = "text" in answer.data && typeof answer.data.text === "string" ? answer.data.text.trim() : "";
    if (!text) throw new Error("interview_answer_invalid");
    return { type: "free_text" as const, questionId: active.id, text };
  }
  const selected = "selectedOptionIds" in answer.data && Array.isArray(answer.data.selectedOptionIds)
    && answer.data.selectedOptionIds.length === 1 ? answer.data.selectedOptionIds[0] : null;
  const optionIndex = active.question!.options.findIndex((_option, index) => optionId(index) === selected);
  if (optionIndex < 0) throw new Error("interview_answer_invalid");
  const label = active.question!.options[optionIndex]!.label;
  return { type: "choice" as const, questionId: active.id, label };
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

function ConfirmedNext({ version, onSources }: { version: number; onSources(): void }) {
  return <div className="confirmed-next"><Check size={16} /><div><strong>需求 v{version} 已确认</strong>
    <p>接下来依据这份范围调研真实来源，再制定抓取计划。</p></div>
    <Button variant="soft" onClick={onSources}>查看来源调研<ArrowRight size={14} /></Button></div>;
}

function TurnArtifacts({ item, state, onDraft }: { item: InterviewMessage; state: InterviewState; onDraft: (v: number) => void }) {
  return <button type="button" className="draft-artifact" onClick={() => onDraft(item.draftVersion!)}>
    <FileText size={22} /><span><strong>{state.drafts.find((draft) => draft.version === item.draftVersion)?.title ?? "需求草稿"}</strong>
      <small>需求草稿 · v{item.draftVersion} · {state.confirmedVersion === item.draftVersion ? "已确认" : "查看内容"}</small>
    </span><ArrowRight size={16} /></button>;
}
