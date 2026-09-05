import type { z } from "zod"

import type { CodexRunEvent } from "./client.js"
import { PRODUCT_MODEL_ID, PRODUCT_REASONING_EFFORT } from "./contracts.js"
import { protocolError } from "./errors.js"
import {
  agentDeltaParamsSchema,
  itemNotificationParamsSchema,
  threadItemSchema,
  turnCompletedParamsSchema,
  turnStartedParamsSchema,
} from "./wire.js"

export interface TurnState {
  threadRequestId: number
  turnRequestId: number
  threadId: string | undefined
  turnId: string | undefined
  finalOutputText: string | undefined
  terminalStatus: "completed" | "interrupted" | "failed" | "inProgress" | undefined
  interrupted: boolean
  timedOut: boolean
  interruptSent: boolean
  turnStartSent: boolean
  reportedModel: typeof PRODUCT_MODEL_ID | null
  reportedEffort: typeof PRODUCT_REASONING_EFFORT | null
  activeItems: Set<string>
  commentaryItems: Set<string>
}

export function createTurnState(threadRequestId: number, turnRequestId: number): TurnState {
  return {
    threadRequestId,
    turnRequestId,
    threadId: undefined,
    turnId: undefined,
    finalOutputText: undefined,
    terminalStatus: undefined,
    interrupted: false,
    timedOut: false,
    interruptSent: false,
    turnStartSent: false,
    reportedModel: null,
    reportedEffort: null,
    activeItems: new Set(),
    commentaryItems: new Set(),
  }
}

export function handleNotification(
  method: string,
  params: unknown,
  state: TurnState,
): CodexRunEvent[] {
  if (method === "turn/started") return handleTurnStarted(params, state)
  if (method === "item/started" || method === "item/completed") {
    return handleItemLifecycle(method, params, state)
  }
  if (method === "item/agentMessage/delta") return handleAgentDelta(params, state)
  if (method === "turn/completed") return handleTurnCompleted(params, state)
  return []
}

export function threadStartParams(cwd: string): object {
  return {
    model: PRODUCT_MODEL_ID,
    cwd,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
    config: { model_reasoning_effort: PRODUCT_REASONING_EFFORT, web_search: "disabled" },
  }
}

export function turnStartParams(
  threadId: string,
  prompt: string,
  outputSchema: Record<string, unknown>,
  skill?: { name: string; path: string },
): object {
  return {
    threadId,
    input: [{ type: "text", text: prompt, text_elements: [] }, ...(skill ? [{ type: "skill", ...skill }] : [])],
    model: PRODUCT_MODEL_ID,
    effort: PRODUCT_REASONING_EFFORT,
    outputSchema,
  }
}

function handleTurnStarted(params: unknown, state: TurnState): CodexRunEvent[] {
  const parsed = turnStartedParamsSchema.safeParse(params)
  if (!parsed.success) throw protocolError("turn.started.params")
  if (!state.threadId) return []
  if (parsed.data.threadId !== state.threadId) return []
  if (state.turnId && state.turnId !== parsed.data.turn.id) return []
  state.turnId = parsed.data.turn.id
  return []
}

function handleItemLifecycle(
  method: "item/started" | "item/completed",
  params: unknown,
  state: TurnState,
): CodexRunEvent[] {
  const parsed = itemNotificationParamsSchema.safeParse(params)
  if (!parsed.success) throw protocolError(`${method}.params`)
  if (!matchesScope(parsed.data, state)) return []
  const item = parsed.data.item
  if (method === "item/started") {
    state.activeItems.add(item.id)
    if (item.type === "agentMessage" && item.phase === "commentary") {
      state.commentaryItems.add(item.id)
    }
  } else {
    if (!state.activeItems.has(item.id)) return []
    if (isFinalMessage(item)) state.finalOutputText = item.text
  }
  return [{
    type: "item_lifecycle",
    itemId: bounded(item.id),
    itemType: bounded(item.type),
    status: method === "item/started" ? "started" : "completed",
  }]
}

function handleAgentDelta(params: unknown, state: TurnState): CodexRunEvent[] {
  const parsed = agentDeltaParamsSchema.safeParse(params)
  if (!parsed.success) throw protocolError("item.agent_message.delta.params")
  if (!matchesScope(parsed.data, state)) return []
  if (!state.commentaryItems.has(parsed.data.itemId)) return []
  return [{ type: "commentary_delta", delta: parsed.data.delta }]
}

function handleTurnCompleted(params: unknown, state: TurnState): CodexRunEvent[] {
  const parsed = turnCompletedParamsSchema.safeParse(params)
  if (!parsed.success) throw protocolError("turn.completed.params")
  if (!matchesScope({ ...parsed.data, turnId: parsed.data.turn.id }, state)) return []
  state.terminalStatus = parsed.data.turn.status
  state.finalOutputText ??= finalMessage(parsed.data.turn.items)
  return []
}

function matchesScope(value: { threadId: string; turnId: string }, state: TurnState): boolean {
  if (!state.threadId || !state.turnId) return false
  return value.threadId === state.threadId && value.turnId === state.turnId
}

function finalMessage(items: z.output<typeof threadItemSchema>[]): string | undefined {
  return [...items].reverse().find(isFinalMessage)?.text
}

function isFinalMessage(item: z.output<typeof threadItemSchema>): boolean {
  return item.type === "agentMessage" && item.phase !== "commentary" && Boolean(item.text)
}

function bounded(value: string): string {
  return value.trim().slice(0, 240)
}
