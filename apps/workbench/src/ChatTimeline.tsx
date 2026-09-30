import { Button } from "@radix-ui/themes";
import { FileText, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ComposerModelControl,
} from "@agent-platform/ai-connect-react";
import { InteractiveTimeline as SharedChatTimeline } from "@agent-platform/ai-connect-react/chat";
import {
  interviewMessageTimes,
  interviewQuestionRegistry,
  projectInterviewTimeline,
  submittedInterviewAnswer,
} from "./interviewTimelineProjection.js";
import type { useInterview } from "./useInterview.js";
import type { useModelSettings } from "./useModelSettings.js";
import { interviewAgentUI } from "./interviewAgentUI.js";
import { currentDraft } from "./interviewContract.js";

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
  onPlan(): void;
  onDraft(version: number): void;
  blockedReason: string | undefined;
  readOnly: boolean;
  appearance: "light" | "dark";
  modelSettings: TimelineModelSettings;
};

export function ChatTimeline({
  taskId,
  interview,
  onPlan,
  onDraft,
  blockedReason,
  readOnly,
  appearance,
  modelSettings,
}: TimelineProps) {
  const { state, ready, error } = interview;
  const modelReady = modelSettings.ready;
  const [draft, setDraft] = useState("");
  const latestDraft = currentDraft(state);
  const controlsBlocked =
    Boolean(blockedReason) || interview.busy || Boolean(interview.pending);
  const messageTimesIncomplete = interviewMessageTimes(state).incomplete;
  const timeline = useMemo(
    () =>
      projectInterviewTimeline({
        state,
        blocked: controlsBlocked || readOnly || !modelReady || !ready,
        onDraft,
        onPlan,
        onRetry: interview.retry,
      }),
    [
      taskId,
      state,
      controlsBlocked,
      readOnly,
      modelReady,
      ready,
      onDraft,
      interview.retry,
      onPlan,
    ],
  );

  return (
    <section className="interview-workspace" aria-label="持续需求对话">
      {latestDraft && <header className="interview-bar">
          <Button
            variant="ghost"
            color="gray"
            onClick={() => onDraft(latestDraft.version)}
          >
            <FileText size={14} />
            查看草案
          </Button>
      </header>}
      <div className="interview-notices">
        {!ready && !error && (
          <div role="status" className="turn-status">
            <LoaderCircle size={13} className="spin" />
            正在读取需求对话
          </div>
        )}
        {error && !interview.pending && (
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
            <p role={error ? "alert" : undefined}>{error || "请核对当前对话后重发本次请求。"}</p>
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
            {error && <Button size="1" variant="soft" onClick={() => interview.reconnect()}>
              重新连接
            </Button>}
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
        // WHY：失败重试已作为同轮 content 组合，禁用共享壳的孤立 retry footer；状态事实仍由原投影提供。
        value={{ ...timeline, canRetry: false }}
        commands={{
          send: async (text) => {
            if (!ready || controlsBlocked || readOnly || !text.trim()) return;
            await sendInterviewMessage(text, modelReady, interview.send);
          },
          stop: interview.cancel,
          retry: interview.retry,
          submit: async (submission) => {
            const submitted = submittedInterviewAnswer(state, submission);
            await interview.submit(submitted.text, submitted.answer);
          },
        }}
        // WHY：其他任务的发送互斥不应让本任务的受控草稿失去聚焦和输入能力。
        sendDisabled={!modelReady || Boolean(blockedReason)}
        disabled={!ready || interview.busy || Boolean(interview.pending) || readOnly}
        readOnly={readOnly}
        composerSubmitMode="enter"
        contentEntrance={{ mode: "queued" }}
        composition={{
          questions: interviewQuestionRegistry,
          cards: interviewAgentUI.cards,
          composerDraft: { value: draft, onChange: setDraft },
          theme: {
            assistantName: "需求助手",
            composerLabel: "输入需求或回答",
            composerPlaceholder: "回答、补充、纠正或追问……",
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
          emptyStateFooter: (
            <p className="composer-caption">
              描述你想完成的事
            </p>
          ),
        }}
      />
      {blockedReason && <p className="interview-send-reason" role="status">{blockedReason}</p>}
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
