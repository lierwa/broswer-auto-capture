import { useEffect, useMemo, useSyncExternalStore } from "react"
import { InterviewConnection } from "./interviewConnection.js"

export function useInterview(taskId: string) {
  const connection = useMemo(() => new InterviewConnection(taskId), [taskId])
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot)
  useEffect(() => { connection.start(); return () => connection.stop() }, [connection])
  const operation = () => ({ requestId: crypto.randomUUID(), expectedRevision: view.state.revision })
  return { ...view,
    send: (text: string) => connection.dispatch({ type: "message", text, ...operation() }),
    answer: (text: string, questionId: string) => connection.dispatch({ type: "message", text, answer: { type: "choice", questionId, label: text }, ...operation() }),
    reply: (text: string, questionId: string) => connection.dispatch({ type: "message", text, answer: { type: "free_text", questionId, text }, ...operation() }),
    retry: () => connection.dispatch({ type: "retry", ...operation() }),
    cancel: async () => { if (view.state.activeTurnId) await connection.dispatch({ type: "cancel", turnId: view.state.activeTurnId }) },
    confirm: (version: number) => connection.dispatch({ type: "confirm", version, ...operation() }),
    reconnect: () => connection.start(), retrySubmission: connection.retrySubmission, dismissSubmission: connection.dismissSubmission,
  }
}
