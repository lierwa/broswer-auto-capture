import { useEffect, useMemo, useSyncExternalStore } from "react"
import type { CommonSurfaceSubmitPayload } from "@agent-platform/ai-connect/ui-contracts"
import { InterviewConnection } from "./interviewConnection.js"
import { interviewAgentUI } from "./interviewAgentUI.js"

export function useInterview(taskId: string) {
  const connection = useMemo(() => new InterviewConnection(taskId), [taskId])
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot)
  useEffect(() => { connection.start(); return () => connection.stop() }, [connection])
  const operation = () => ({ requestId: crypto.randomUUID(), expectedRevision: view.state.revision })
  const modelOperation = () => ({ ...operation(), ui: interviewAgentUI.capabilities })
  return { ...view,
    send: (text: string) => connection.dispatch({ type: "message", text, ...modelOperation() }),
    submit: (text: string, answer: { type: "common_question"; questionId: string; surfaceSubmit: CommonSurfaceSubmitPayload }) =>
      connection.dispatch({ type: "message", text, answer, ...modelOperation() }),
    answer: (text: string, questionId: string) => connection.dispatch({ type: "message", text, answer: { type: "choice", questionId, label: text }, ...modelOperation() }),
    reply: (text: string, questionId: string) => connection.dispatch({ type: "message", text, answer: { type: "free_text", questionId, text }, ...modelOperation() }),
    retry: () => connection.dispatch({ type: "retry", ...modelOperation() }),
    cancel: async () => { if (view.state.activeTurnId) await connection.dispatch({ type: "cancel", turnId: view.state.activeTurnId }) },
    confirm: (version: number) => connection.dispatch({ type: "confirm", version, ...operation() }),
    reconnect: () => connection.start(), retrySubmission: connection.retrySubmission, dismissSubmission: connection.dismissSubmission,
  }
}
