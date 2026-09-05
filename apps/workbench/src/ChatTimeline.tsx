import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime, useAuiState, type ThreadMessageLike } from "@assistant-ui/react"
import { Badge, Button } from "@radix-ui/themes"
import { ArrowDown, ArrowRight, ArrowUp, Check, FileText, LoaderCircle, RotateCcw, Square } from "lucide-react"
import { createContext, useContext, useId } from "react"
import { visibleMessageText, type InterviewMessage, type InterviewState } from "./interviewContract.js"
import type { useInterview } from "./useInterview.js"

type Interview = ReturnType<typeof useInterview>
const ThreadContext = createContext<{ interview: Interview; openDraft: (version: number) => void; blocked: boolean } | null>(null)

function toMessage(message: InterviewMessage): ThreadMessageLike {
  return { id: message.id, role: message.role, content: [{ type: "text", text: visibleMessageText(message) }],
    ...(message.role === "assistant" ? { status: message.status === "running" ? { type: "running" as const }
      : { type: "complete" as const, reason: "stop" as const } } : {}) }
}

export function ChatTimeline({ interview, onSources, onDraft, blocked, readOnly }: { interview: Interview; onSources: () => void; onDraft: (version: number) => void; blocked: boolean; readOnly: boolean }) {
  const { state, ready, error } = interview
  const inputId = useId()
  const runtime = useExternalStoreRuntime({ messages: state.messages, convertMessage: toMessage, isRunning: state.active,
    onNew: async (message) => { const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"); if (ready && !blocked && !interview.busy && !interview.pending && text.trim()) await interview.send(text) },
    onCancel: interview.cancel,
  })
  return <ThreadContext.Provider value={{ interview, openDraft: onDraft, blocked }}><AssistantRuntimeProvider runtime={runtime}>
    <section className="interview-workspace" aria-label="持续需求对话">
      <header className="interview-bar"><div><span className="context-dot" /><span>{state.cancellationRequested ? "正在停止本轮" : state.active ? "正在梳理需求" : state.confirmedVersion ? "需求已确认" : "明确目标与边界"}</span></div>
        {state.drafts.length > 0 && <Button variant="ghost" color="gray" onClick={() => onDraft(state.drafts.at(-1)!.version)}><FileText size={14} />需求草稿 · v{state.drafts.at(-1)!.version}<ArrowRight size={14} /></Button>}
      </header>
      <ThreadPrimitive.Root className="interview-thread">
        <ThreadPrimitive.Viewport className="thread-viewport">
          <div className="thread-column">
            {ready && state.messages.length === 0 && <div className="thread-welcome"><span className="welcome-mark"><FileText size={22} /></span><h2>从你想完成的事开始</h2><p>说说目标、已有入口，以及希望得到的结果。<br />我会和你明确关键取舍，再整理成可确认的需求草稿。</p><p className="welcome-example">例如：收集某个旗舰店的冰箱商品和评价，保留商品链接。</p></div>}
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            {!ready && <div role="status" className="turn-status"><LoaderCircle size={13} className="spin" />正在读取需求对话</div>}
            {error && <div role="alert" className="thread-error">{error}<Button size="1" variant="soft" onClick={() => interview.reconnect()}>重新连接</Button></div>}
            {interview.pending && !interview.busy && <div className="thread-error"><p>请核对当前对话后重发本次请求。</p>{interview.pending.type === "message" && <p className="pending-message">{interview.pending.text}</p>}<Button size="1" onClick={() => void interview.retrySubmission()}>重发本次请求</Button><Button size="1" variant="ghost" onClick={interview.dismissSubmission}>关闭请求提示</Button></div>}
            {state.confirmedVersion && <div className="confirmed-next"><Check size={16} /><div><strong>需求 v{state.confirmedVersion} 已确认</strong><p>接下来依据这份范围调研真实来源，再制定抓取计划。</p></div><Button variant="soft" onClick={onSources}>查看来源调研<ArrowRight size={14} /></Button></div>}
          </div>
        </ThreadPrimitive.Viewport>
        <div className="thread-bottom"><ThreadPrimitive.ScrollToBottom className="scroll-latest" aria-label="回到最新消息"><ArrowDown size={16} /></ThreadPrimitive.ScrollToBottom>
          <ComposerPrimitive.Root className="chat-composer" onSubmitCapture={(event) => { if (blocked || !ready || interview.busy || interview.pending) { event.preventDefault(); event.stopPropagation() } }}>
            <ComposerPrimitive.Input id={inputId} aria-label="输入需求或回答" placeholder="回答、补充、纠正或追问……" disabled={!ready || readOnly} className="chat-input" />
            <div className="chat-composer-footer"><span>{state.active ? "可以停止本轮，修改后继续" : "Enter 发送 · Shift + Enter 换行"}</span>{state.active
              ? <ComposerPrimitive.Cancel className="send-message" aria-label="停止生成" disabled={state.cancellationRequested}><Square size={15} /></ComposerPrimitive.Cancel>
              : <ComposerPrimitive.Send className="send-message" disabled={!ready || blocked || interview.busy || Boolean(interview.pending)} aria-label="发送消息"><ArrowUp size={19} /></ComposerPrimitive.Send>}</div>
          </ComposerPrimitive.Root>
          <p className="composer-caption">先确认需求，再调研来源与制定计划。发送消息不会启动浏览器操作。</p>
        </div>
      </ThreadPrimitive.Root>
    </section>
  </AssistantRuntimeProvider></ThreadContext.Provider>
}

function UserMessage() {
  return <MessagePrimitive.Root className="chat-message user-message"><span className="sr-only">你：</span><MessagePrimitive.Parts /></MessagePrimitive.Root>
}

function AssistantMessage() {
  const context = useContext(ThreadContext)!
  const id = useAuiState((state) => state.message.id)
  const item = context.interview.state.messages.find((entry) => entry.id === id)
  if (!item) return null
  const isLast = context.interview.state.messages.at(-1)?.id === id
  return <MessagePrimitive.Root className="chat-message assistant-message"><div className="assistant-label"><span className="assistant-mark">B</span>需求助手</div>
    <div className="assistant-body"><MessagePrimitive.Parts />
      {isLast && context.interview.state.active && <div className="turn-status" role="status"><LoaderCircle size={13} className="spin" />{context.interview.state.cancellationRequested ? "正在停止，保留已有对话" : "正在思考"}</div>}
      {isLast && !context.interview.state.active && ["failed", "cancelled"].includes(item.status) && <Button disabled={context.blocked || context.interview.busy || Boolean(context.interview.pending)} size="1" variant="soft" color="gray" onClick={() => void context.interview.retry()}><RotateCcw size={13} />重试本轮</Button>}
      <TurnArtifacts item={item} state={context.interview.state} blocked={context.blocked || context.interview.busy || Boolean(context.interview.pending)} onDraft={context.openDraft} onAnswer={context.interview.answer} />
    </div>
  </MessagePrimitive.Root>
}

function TurnArtifacts({ item, state, onDraft, onAnswer, blocked }: { item: InterviewMessage; state: InterviewState; onDraft: (v: number) => void; onAnswer: (value: string, questionId: string) => Promise<void>; blocked: boolean }) {
  const isCurrent = state.messages.at(-1)?.id === item.id && !state.active && !blocked
  return <>
    {item.question && <div className="decision-block"><p className="decision-question">{item.question.prompt}</p><div className="decision-options">{item.question.options.map((option, index) => <button type="button" key={option.label} disabled={!isCurrent} onClick={() => void onAnswer(option.label, item.id)} className="decision-option"><span className="option-number">{index + 1}</span><span><span className="option-label">{option.label}{option.recommended && <Badge size="1" variant="soft">建议</Badge>}</span><span className="option-description">{option.description}</span></span></button>)}</div><p className="decision-hint">也可以直接输入不同的答案，或继续追问。</p></div>}
    {item.draftVersion && <button type="button" className="draft-artifact" onClick={() => onDraft(item.draftVersion!)}><FileText size={22} /><span><strong>{state.drafts.find((draft) => draft.version === item.draftVersion)?.title ?? "需求草稿"}</strong><small>需求草稿 · v{item.draftVersion} · {state.confirmedVersion === item.draftVersion ? "已确认" : "查看内容"}</small></span><ArrowRight size={16} /></button>}
  </>
}
