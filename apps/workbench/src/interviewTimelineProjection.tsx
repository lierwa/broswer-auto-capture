import { Button } from "@radix-ui/themes";
import { ArrowRight, Check, FileText, LoaderCircle } from "lucide-react";
import {
  createChatTimelineValue,
  type ChatMessage,
  type ChatMessagePart,
  type ChatTimelineViewProps,
} from "@agent-platform/ai-connect-react";
import {
  commonChoiceQuestionModules,
  createQuestionModuleRegistry,
} from "@agent-platform/ai-connect-react/chat";
import type { InterviewMessage, InterviewState } from "./interviewContract.js";

type TimelineValue = ChatTimelineViewProps["value"];
type TimelineSubmit = Parameters<ChatTimelineViewProps["commands"]["submit"]>[0];
type QuestionSurface = NonNullable<TimelineValue["presentedSurface"]>;
export const interviewQuestionRegistry = createQuestionModuleRegistry(commonChoiceQuestionModules);

export function projectInterviewTimeline(input: {
  resetKey: string;
  state: InterviewState;
  blocked: boolean;
  onDraft(version: number): void;
  onSources(): void;
  onRetry(): Promise<void>;
}): TimelineValue {
  const latest = input.state.messages.at(-1);
  const errorMessage = interviewErrorMessage(latest);
  const base = createChatTimelineValue({
    resetKey: input.resetKey,
    messages: projectInterviewMessages(input),
    running: input.state.active,
    ...(errorMessage ? { errorMessage } : {}),
    canRetry: latest?.role === "assistant" && latest.status === "failed",
  });
  const withHistory = projectAnsweredInteractions(base, input.state);
  const activeMessage = activeChoiceMessage(input.state);
  const presentedSurface = activeMessage
    ? interviewQuestionSurface(activeMessage)
    : null;
  return {
    ...withHistory,
    activeInteraction: presentedSurface
      ? {
          interactionId: activeMessage!.id,
          kind: "question",
          title: activeMessage!.question!.prompt,
          submitLabel: presentedSurface.submitLabel ?? "提交回答",
          questions: [],
          surface: presentedSurface,
        }
      : null,
    presentedSurface,
    status: input.state.active
      ? "generating"
      : presentedSurface
        ? "waiting_for_user"
        : errorMessage
          ? "error"
          : "idle",
  };
}

export function projectInterviewMessages(input: {
  state: InterviewState;
  blocked: boolean;
  onDraft(version: number): void;
  onSources(): void;
  onRetry(): Promise<void>;
}): ChatMessage[] {
  const { byMessage: createdAtByMessage, incomplete } = interviewMessageTimes(
    input.state,
  );
  return input.state.messages.map((item, index) => {
    return {
      id: item.id,
      role: item.role,
      createdAt: incomplete ? index : createdAtByMessage.get(item.id)!,
      content:
        item.role === "user" ? item.text : assistantParts(item, index, input),
    };
  });
}

export function interviewMessageTimes(state: InterviewState) {
  const byMessage = new Map<string, number>();
  for (const turn of state.turns) {
    const createdAt = Date.parse(turn.createdAt);
    if (!Number.isFinite(createdAt)) continue;
    byMessage.set(turn.userMessageId, createdAt);
    byMessage.set(turn.assistantMessageId, createdAt);
  }
  // WHY：旧数据没有保存逐消息时间；保留原数组顺序，并由本地壳隐藏占位时间，避免显示 1970 年。
  return {
    byMessage,
    incomplete: state.messages.some((message) => !byMessage.has(message.id)),
  };
}

function assistantParts(
  item: InterviewMessage,
  index: number,
  input: Parameters<typeof projectInterviewMessages>[0],
): ChatMessagePart[] {
  const parts: ChatMessagePart[] = [
    {
      id: "text",
      type: "text",
      text: item.text,
      ...(item.status === "running" ? { streaming: true } : {}),
    },
  ];
  // WHY：模型调用事件仍由需求状态保存用于审计，正常对话只呈现用户完成下一步所需的信息。
  // 非权威 authoring preview 不进入原 Timeline/Composer；只有 terminal open Interaction 才展示 Question。
  if (item.draftVersion)
    parts.push({
      id: "artifacts",
      type: "content",
      content: (
        <TurnArtifacts
          item={item}
          state={input.state}
          onDraft={input.onDraft}
        />
      ),
    });
  if (
    index === input.state.messages.length - 1 &&
    input.state.confirmedVersion
  ) {
    parts.push({
      id: "confirmed",
      type: "content",
      content: (
        <ConfirmedNext
          version={input.state.confirmedVersion}
          onSources={input.onSources}
        />
      ),
    });
  }
  if (
    index === input.state.messages.length - 1 &&
    input.state.cancellationRequested
  ) {
    parts.push({
      id: "cancelling",
      type: "content",
      content: (
        <div className="turn-status" role="status">
          <LoaderCircle size={13} className="spin" />
          正在停止，保留已有对话
        </div>
      ),
    });
  }
  if (
    index === input.state.messages.length - 1 &&
    item.status === "cancelled" &&
    !input.blocked
  ) {
    parts.push({
      id: "cancelled-retry",
      type: "content",
      content: (
        <Button
          size="1"
          variant="soft"
          onClick={() => void input.onRetry().catch(() => undefined)}
        >
          重新提交本轮
        </Button>
      ),
    });
  }
  return parts;
}

function activeChoiceMessage(state: InterviewState) {
  if (state.active) return undefined;
  const latest = state.messages.at(-1);
  if (latest?.role !== "assistant" || !latest.question?.options.length) return undefined;
  return state.unresolved.some(
    (item) => item.id === latest.id && item.status === "open",
  )
    ? latest
    : undefined;
}

const optionId = (index: number) => `option:${index + 1}`;

export function interviewQuestionSurface(
  message: InterviewMessage,
): QuestionSurface | null {
  if (message.role !== "assistant" || !message.question?.options.length)
    return null;
  return {
    id: message.id,
    submitLabel: "提交回答",
    questions: [
      {
        id: message.id,
        type: "choice",
        data: {
          stem: message.question.prompt,
          options: message.question.options.map((option, index) => ({
            id: optionId(index),
            label: option.label,
            subtitle: option.description,
            recommended: option.recommended,
          })),
          inputs: [
            {
              id: "free-answer",
              label: "不同答案",
              kind: "textarea",
              role: "follow_up",
              placeholder: "输入不同答案，或继续追问",
            },
          ],
        },
      },
    ],
  };
}

function projectAnsweredInteractions(
  value: TimelineValue,
  state: InterviewState,
): TimelineValue {
  let turns = value.turns;
  for (const decision of state.decisions) {
    if (
      decision.kind !== "option" ||
      !decision.questionId ||
      !decision.messageId
    )
      continue;
    const source = state.messages.find(
      (message) => message.id === decision.questionId,
    );
    if (!source) continue;
    const surface = interviewQuestionSurface(source);
    const selectedIndex = source.question?.options.findIndex(
      (option) => option.label === decision.text,
    );
    if (!surface || selectedIndex === undefined || selectedIndex < 0) continue;
    turns = turns.map((turn) => {
      const original = turn.entries.find(
        (entry) =>
          entry.value.kind === "message" &&
          entry.value.message.id === decision.messageId,
      );
      if (!original) return turn;
      const interaction = {
        interactionId: source.id,
        kind: "common_surface" as const,
        state: "submitted" as const,
        surface,
        surfaceSubmit: {
          answers: [
            {
              questionId: source.id,
              data: { selectedOptionIds: [optionId(selectedIndex)] },
            },
          ],
          displayText: decision.text,
        },
      };
      return {
        ...turn,
        entries: [
          {
            id: `answered-interaction:${source.id}`,
            role: "user" as const,
            createdAt: original.createdAt,
            value: { kind: "answered-interaction" as const, interaction },
          },
          ...turn.entries.filter(
            (entry) =>
              entry.value.kind !== "message" ||
              entry.value.message.id !== decision.messageId,
          ),
        ],
      };
    });
  }
  return { ...value, turns };
}

export function selectedInterviewOption(
  state: InterviewState,
  submission: TimelineSubmit,
) {
  const active = activeChoiceMessage(state);
  const answer = submission.answers.length === 1 ? submission.answers[0] : null;
  const selected =
    answer?.data &&
    typeof answer.data === "object" &&
    !Array.isArray(answer.data) &&
    Array.isArray(answer.data.selectedOptionIds) &&
    answer.data.selectedOptionIds.length === 1
      ? answer.data.selectedOptionIds[0]
      : null;
  const optionIndex = active?.question?.options.findIndex(
    (_option, index) => optionId(index) === selected,
  );
  if (
    !active ||
    answer?.questionId !== active.id ||
    optionIndex === undefined ||
    optionIndex < 0
  )
    throw new Error("interview_option_selection_invalid");
  return {
    questionId: active.id,
    label: active.question!.options[optionIndex]!.label,
  };
}

export function interviewErrorMessage(message: InterviewMessage | undefined) {
  return message?.role === "assistant" && message.status === "failed"
    ? "本轮结果未提交，可以重试。"
    : undefined;
}

function ConfirmedNext({
  version,
  onSources,
}: {
  version: number;
  onSources(): void;
}) {
  return (
    <div className="confirmed-next">
      <Check size={16} />
      <div>
        <strong>需求 v{version} 已确认</strong>
        <p>接下来依据这份范围调研真实来源，再制定抓取计划。</p>
      </div>
      <Button variant="soft" onClick={onSources}>
        查看来源调研
        <ArrowRight size={14} />
      </Button>
    </div>
  );
}

function TurnArtifacts({
  item,
  state,
  onDraft,
}: {
  item: InterviewMessage;
  state: InterviewState;
  onDraft: (v: number) => void;
}) {
  return (
    <button
      type="button"
      className="draft-artifact"
      onClick={() => onDraft(item.draftVersion!)}
    >
      <FileText size={22} />
      <span>
        <strong>
          {state.drafts.find((draft) => draft.version === item.draftVersion)
            ?.title ?? "需求草稿"}
        </strong>
        <small>
          需求草稿 · v{item.draftVersion} ·{" "}
          {state.confirmedVersion === item.draftVersion
            ? "已确认"
            : "查看内容"}
        </small>
      </span>
      <ArrowRight size={16} />
    </button>
  );
}
