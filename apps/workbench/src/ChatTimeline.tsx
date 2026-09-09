import { Button } from "@radix-ui/themes";
import { ArrowRight, FileText, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ChatTimelineView as SharedChatTimeline,
  ComposerModelControl,
} from "@agent-platform/ai-connect-react";
import {
  interviewErrorMessage,
  interviewMessageTimes,
  interviewQuestionRegistry,
  projectInterviewTimeline,
  selectedInterviewOption,
} from "./interviewTimelineProjection.js";
import type { useInterview } from "./useInterview.js";
import type { useModelSettings } from "./useModelSettings.js";

type Interview = ReturnType<typeof useInterview>;
type TimelineModelSettings = Pick<
  ReturnType<typeof useModelSettings>,
  | "accounts"
  | "selection"
  | "loading"
  | "saving"
  | "error"
  | "ready"
  | "save"
  | "load"
>;
type TimelineProps = {
  taskId: string;
  interview: Interview;
  onSources(): void;
  onDraft(version: number): void;
  blocked: boolean;
  readOnly: boolean;
  appearance: "light" | "dark";
  modelSettings: TimelineModelSettings;
};

export function ChatTimeline({
  taskId,
  interview,
  onSources,
  onDraft,
  blocked,
  readOnly,
  appearance,
  modelSettings,
}: TimelineProps) {
  const { state, ready, error } = interview;
  const modelReady = modelSettings.ready;
  const [draft, setDraft] = useState("");
  const latest = state.messages.at(-1);
  const controlsBlocked =
    blocked || interview.busy || Boolean(interview.pending);
  const messageTimesIncomplete = interviewMessageTimes(state).incomplete;
  const timeline = useMemo(
    () =>
      projectInterviewTimeline({
        resetKey: taskId,
        state,
        blocked: controlsBlocked || readOnly || !modelReady,
        onDraft,
        onSources,
        onRetry: interview.retry,
      }),
    [
      taskId,
      state,
      controlsBlocked,
      readOnly,
      modelReady,
      onDraft,
      interview.retry,
      onSources,
    ],
  );
  const openQuestion =
    !state.active &&
    latest?.role === "assistant" &&
    latest.question?.options.length === 0;
  const errorMessage = interviewErrorMessage(latest);

  return (
    <section className="interview-workspace" aria-label="持续需求对话">
      <header className="interview-bar">
        <div>
          <span className="context-dot" />
          <span>
            {state.cancellationRequested
              ? "正在停止本轮"
              : state.active
                ? "正在梳理需求"
                : state.confirmedVersion
                  ? "需求已确认"
                  : "明确目标与边界"}
          </span>
        </div>
        {state.drafts.length > 0 && (
          <Button
            variant="ghost"
            color="gray"
            onClick={() => onDraft(state.drafts.at(-1)!.version)}
          >
            <FileText size={14} />
            需求草稿 · v{state.drafts.at(-1)!.version}
            <ArrowRight size={14} />
          </Button>
        )}
      </header>
      <div className="interview-notices">
        {!ready && !error && (
          <div role="status" className="turn-status">
            <LoaderCircle size={13} className="spin" />
            正在读取需求对话
          </div>
        )}
        {error && (
          <div role="alert" className="thread-error">
            {error}
            <Button
              size="1"
              variant="soft"
              onClick={() => interview.reconnect()}
            >
              重新连接
            </Button>
          </div>
        )}
        {interview.pending && !interview.busy && (
          <div className="thread-error">
            <p>请核对当前对话后重发本次请求。</p>
            {interview.pending.type === "message" && (
              <p className="pending-message">{interview.pending.text}</p>
            )}
            <Button
              size="1"
              disabled={!modelReady}
              onClick={() => {
                if (modelReady) void interview.retrySubmission();
              }}
            >
              重发本次请求
            </Button>
            <Button
              size="1"
              variant="ghost"
              onClick={interview.dismissSubmission}
            >
              关闭请求提示
            </Button>
          </div>
        )}
      </div>
      <SharedChatTimeline
        appearance={appearance}
        resetKey={taskId}
        className={`interview-thread${messageTimesIncomplete ? " interview-thread--time-incomplete" : ""}`}
        partClassNames={{ content: "thread-column", composer: "thread-bottom" }}
        value={timeline}
        commands={{
          send: async (text) => {
            if (!ready || controlsBlocked || readOnly || !text.trim()) return;
            await sendInterviewMessage(text, modelReady, interview.send);
          },
          stop: interview.cancel,
          retry: interview.retry,
          submit: async (submission) => {
            const selected = selectedInterviewOption(state, submission);
            await interview.answer(selected.label, selected.questionId);
          },
        }}
        sendDisabled={!modelReady}
        disabled={!ready || controlsBlocked}
        readOnly={readOnly}
        composerSubmitMode="enter"
        contentEntrance={{ mode: "queued" }}
        composition={{
          questions: interviewQuestionRegistry,
          ...(errorMessage ? { errorMessage } : {}),
          composerDraft: { value: draft, onChange: setDraft },
          theme: {
            assistantName: "需求助手",
            composerLabel: "输入需求或回答",
            composerPlaceholder: openQuestion
              ? "直接回答当前问题，或补充你的要求……"
              : "回答、补充、纠正或追问……",
          },
          composerControls: (
            <ComposerModelControl
              accounts={modelSettings.accounts}
              loading={modelSettings.loading}
              saving={modelSettings.saving}
              disabled={controlsBlocked || readOnly}
              appearance={appearance}
              ariaLabel="默认聊天模型"
              onChange={modelSettings.save}
              onRetry={modelSettings.load}
              {...(modelSettings.selection
                ? { value: modelSettings.selection }
                : {})}
              {...(modelSettings.error
                ? { errorMessage: modelSettings.error }
                : {})}
            />
          ),
          ...(state.messages.length === 0 && ready
            ? { composerAccessory: <Welcome /> }
            : {}),
          emptyStateFooter: (
            <p className="composer-caption">
              先确认需求，再调研来源与制定计划。发送消息不会启动浏览器操作。
            </p>
          ),
        }}
      />
    </section>
  );
}

export function requireModelInvocation(ready: boolean) {
  if (ready) return;
  // WHY：拒绝会让共享 Composer 恢复受控草稿；请求不会到达需求 API，也不会制造失败轮次。
  throw new Error("model_selection_required");
}

export async function sendInterviewMessage(
  text: string,
  modelReady: boolean,
  send: (text: string) => Promise<void>,
) {
  requireModelInvocation(modelReady);
  await send(text);
}

function Welcome() {
  return (
    <div className="thread-welcome">
      <h2>描述这次要采集的内容</h2>
      <p>说明对象、范围和期望字段；需求确认后将继续调研来源并制定计划。</p>
    </div>
  );
}
