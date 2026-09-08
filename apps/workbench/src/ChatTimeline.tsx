import { Badge, Button } from "@radix-ui/themes"
import { ArrowRight, Check, FileText, LoaderCircle } from "lucide-react"
import { useMemo, useState } from "react"
import {
  ChatTimeline as SharedChatTimeline,
  ComposerModelControl,
  type ChatMessage,
  type ChatMessagePart,
} from "@agent-platform/ai-connect-react"
import type { InterviewMessage, InterviewState } from "./interviewContract.js"
import type { useInterview } from "./useInterview.js"
import type { useModelSettings } from "./useModelSettings.js"

type Interview = ReturnType<typeof useInterview>
type TimelineModelSettings = Pick<ReturnType<typeof useModelSettings>,
  "accounts" | "selection" | "loading" | "saving" | "error" | "ready" | "save" | "load">
type TimelineProps = {
  taskId: string
  interview: Interview
  onSources(): void
  onDraft(version: number): void
  blocked: boolean
  readOnly: boolean
  appearance: "light" | "dark"
  modelSettings: TimelineModelSettings
}

export function ChatTimeline({ taskId, interview, onSources, onDraft, blocked, readOnly, appearance, modelSettings }: TimelineProps) {
  const { state, ready, error } = interview
  const modelReady = modelSettings.ready
  const [draft, setDraft] = useState("")
  const latest = state.messages.at(-1)
  const retryable = latest?.role === "assistant" && ["failed", "cancelled"].includes(latest.status)
  const controlsBlocked = blocked || interview.busy || Boolean(interview.pending)
  const messageTimesIncomplete = interviewMessageTimes(state).incomplete
  const messages = useMemo(
    () => projectInterviewMessages({ state, blocked: controlsBlocked || readOnly || !modelReady, onDraft, onAnswer: interview.answer, onSources, onRetry: interview.retry }),
    [state, controlsBlocked, readOnly, modelReady, onDraft, interview.answer, interview.retry, onSources],
  )
  const openQuestion = !state.active && latest?.role === "assistant" && latest.question?.options.length === 0
  const errorMessage = interviewErrorMessage(latest)

  return <section className="interview-workspace" aria-label="持续需求对话">
    <header className="interview-bar"><div><span className="context-dot" /><span>{state.cancellationRequested ? "正在停止本轮" : state.active ? "正在梳理需求" : state.confirmedVersion ? "需求已确认" : "明确目标与边界"}</span></div>
      {state.drafts.length > 0 && <Button variant="ghost" color="gray" onClick={() => onDraft(state.drafts.at(-1)!.version)}><FileText size={14} />需求草稿 · v{state.drafts.at(-1)!.version}<ArrowRight size={14} /></Button>}
    </header>
    <div className="interview-notices">
      {!ready && !error && <div role="status" className="turn-status"><LoaderCircle size={13} className="spin" />正在读取需求对话</div>}
      {error && <div role="alert" className="thread-error">{error}<Button size="1" variant="soft" onClick={() => interview.reconnect()}>重新连接</Button></div>}
      {interview.pending && !interview.busy && <div className="thread-error"><p>请核对当前对话后重发本次请求。</p>{interview.pending.type === "message" && <p className="pending-message">{interview.pending.text}</p>}<Button size="1" disabled={!modelReady} onClick={() => { if (modelReady) void interview.retrySubmission() }}>重发本次请求</Button><Button size="1" variant="ghost" onClick={interview.dismissSubmission}>关闭请求提示</Button></div>}
    </div>
    <SharedChatTimeline
      appearance={appearance}
      resetKey={taskId}
      className={`interview-thread${messageTimesIncomplete ? " interview-thread--time-incomplete" : ""}`}
      partClassNames={{ content: "thread-column", composer: "thread-bottom" }}
      messages={messages}
      running={state.active}
      onSend={async (text) => {
        if (!ready || controlsBlocked || readOnly || !text.trim()) return
        await sendInterviewMessage(text, modelReady, interview.send)
      }}
      onStop={interview.cancel}
      sendDisabled={!modelReady}
      {...(retryable && !controlsBlocked && !readOnly && modelReady ? { onRetry: interview.retry } : {})}
      {...(errorMessage ? { errorMessage } : {})}
      disabled={!ready || controlsBlocked}
      readOnly={readOnly}
      composerSubmitMode="enter"
      draft={{ value: draft, onChange: setDraft }}
      composerControls={<ComposerModelControl accounts={modelSettings.accounts} loading={modelSettings.loading}
        saving={modelSettings.saving} disabled={controlsBlocked || readOnly} appearance={appearance}
        ariaLabel="默认聊天模型" onChange={modelSettings.save} onRetry={modelSettings.load}
        {...(modelSettings.selection ? { value: modelSettings.selection } : {})}
        {...(modelSettings.error ? { errorMessage: modelSettings.error } : {})} />}
      contentEntrance={false}
      theme={{
        assistantName: "需求助手",
        composerLabel: "输入需求或回答",
        composerPlaceholder: openQuestion ? "直接回答当前问题，或补充你的要求……" : "回答、补充、纠正或追问……",
      }}
      composerAccessory={state.messages.length === 0 && ready ? <Welcome /> : undefined}
      emptyStateFooter={<p className="composer-caption">先确认需求，再调研来源与制定计划。发送消息不会启动浏览器操作。</p>}
    />
  </section>
}

export function projectInterviewMessages(input: {
  state: InterviewState
  blocked: boolean
  onDraft(version: number): void
  onAnswer(value: string, questionId: string): Promise<void>
  onSources(): void
  onRetry(): Promise<void>
}): ChatMessage[] {
  const { byMessage: createdAtByMessage, incomplete } = interviewMessageTimes(input.state)
  return input.state.messages.map((item, index) => {
    return {
      id: item.id,
      role: item.role,
      createdAt: incomplete ? index : createdAtByMessage.get(item.id)!,
      content: item.role === "user" ? item.text : assistantParts(item, index, input),
    }
  })
}

function interviewMessageTimes(state: InterviewState) {
  const byMessage = new Map<string, number>()
  for (const turn of state.turns) {
    const createdAt = Date.parse(turn.createdAt)
    if (!Number.isFinite(createdAt)) continue
    byMessage.set(turn.userMessageId, createdAt)
    byMessage.set(turn.assistantMessageId, createdAt)
  }
  // WHY：旧数据没有保存逐消息时间；保留原数组顺序，并由本地壳隐藏占位时间，避免显示 1970 年。
  return { byMessage, incomplete: state.messages.some((message) => !byMessage.has(message.id)) }
}

function assistantParts(
  item: InterviewMessage,
  index: number,
  input: Parameters<typeof projectInterviewMessages>[0],
): ChatMessagePart[] {
  const parts: ChatMessagePart[] = [{ id: "text", type: "text", text: item.text }]
  // WHY：模型调用事件仍由需求状态保存用于审计，正常对话只呈现用户完成下一步所需的信息。
  if (item.question || item.draftVersion) parts.push({ id: "artifacts", type: "content",
    content: <TurnArtifacts item={item} state={input.state} blocked={input.blocked}
      onDraft={input.onDraft} onAnswer={input.onAnswer} /> })
  if (index === input.state.messages.length - 1 && input.state.confirmedVersion) {
    parts.push({ id: "confirmed", type: "content", content: <ConfirmedNext version={input.state.confirmedVersion} onSources={input.onSources} /> })
  }
  if (index === input.state.messages.length - 1 && input.state.cancellationRequested) {
    parts.push({ id: "cancelling", type: "content", content: <div className="turn-status" role="status"><LoaderCircle size={13} className="spin" />正在停止，保留已有对话</div> })
  }
  if (index === input.state.messages.length - 1 && item.status === "cancelled" && !input.blocked) {
    parts.push({ id: "cancelled-retry", type: "content", content: <Button size="1" variant="soft" onClick={() => void input.onRetry().catch(() => undefined)}>重新提交本轮</Button> })
  }
  return parts
}

export function interviewErrorMessage(message: InterviewMessage | undefined) {
  return message?.role === "assistant" && message.status === "failed"
    ? "本轮结果未提交，可以重试。"
    : undefined
}

export function requireModelInvocation(ready: boolean) {
  if (ready) return
  // WHY：拒绝会让共享 Composer 恢复受控草稿；请求不会到达需求 API，也不会制造失败轮次。
  throw new Error("model_selection_required")
}

export async function sendInterviewMessage(
  text: string,
  modelReady: boolean,
  send: (text: string) => Promise<void>,
) {
  requireModelInvocation(modelReady)
  await send(text)
}

function Welcome() {
  return <div className="thread-welcome"><h2>描述这次要采集的内容</h2><p>说明对象、范围和期望字段；需求确认后将继续调研来源并制定计划。</p></div>
}

function ConfirmedNext({ version, onSources }: { version: number; onSources(): void }) {
  return <div className="confirmed-next"><Check size={16} /><div><strong>需求 v{version} 已确认</strong><p>接下来依据这份范围调研真实来源，再制定抓取计划。</p></div><Button variant="soft" onClick={onSources}>查看来源调研<ArrowRight size={14} /></Button></div>
}

function TurnArtifacts({ item, state, onDraft, onAnswer, blocked }: { item: InterviewMessage; state: InterviewState; onDraft: (v: number) => void; onAnswer: (value: string, questionId: string) => Promise<void>; blocked: boolean }) {
  const isCurrent = state.messages.at(-1)?.id === item.id && !state.active && !blocked
  const open = item.question?.options.length === 0
  return <>
    {item.question && <div className="decision-block"><p className="decision-question">{item.question.prompt}</p>{open
      ? isCurrent ? null : <p className="decision-hint">这是历史问题，仅供查阅。</p>
      : <><div className="decision-options">{item.question.options.map((option, index) => <button type="button" key={option.label} disabled={!isCurrent} onClick={() => void onAnswer(option.label, item.id)} className="decision-option"><span className="option-number">{index + 1}</span><span><span className="option-label">{option.label}{option.recommended && <Badge size="1" variant="soft">建议</Badge>}</span><span className="option-description">{option.description}</span></span></button>)}</div><p className="decision-hint">{isCurrent ? "也可以在下方输入不同答案，或继续追问。" : "这是历史问题，选项仅供查阅。"}</p></>}</div>}
    {item.draftVersion && <button type="button" className="draft-artifact" onClick={() => onDraft(item.draftVersion!)}><FileText size={22} /><span><strong>{state.drafts.find((draft) => draft.version === item.draftVersion)?.title ?? "需求草稿"}</strong><small>需求草稿 · v{item.draftVersion} · {state.confirmedVersion === item.draftVersion ? "已确认" : "查看内容"}</small></span><ArrowRight size={16} /></button>}
  </>
}
