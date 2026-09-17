import type {
  ChainNode, InvokeChainResult, JsonValue, NodeCapabilityResult, ResumeVerificationResult,
  RunBinding, TaskCheckpoint, TaskConsumption, TaskRun, TaskRunMode, TaskRunRequest, VersionReference,
} from "@browser-capture/contracts"
export type { NodeCapabilityResult }

export interface CapabilityNodeInvocation {
  binding: RunBinding
  node: Extract<ChainNode, { kind: "capability" }>
  input: Record<string, JsonValue>
  config: JsonValue
  resumeCondition?: { operator: "exists"; path: (string | number)[] }
    | { operator: "equals"; path: (string | number)[]; expected: JsonValue }
  idempotencyKey: string
  signal: AbortSignal
}

export interface BrowserNodeInvocation {
  binding: RunBinding
  node: Extract<ChainNode, { kind: "browser" }>
  arguments: Record<string, JsonValue>
  target?: { kind: "semantic"; role: JsonValue; name: JsonValue } | { kind: "locator"; strategy: string; value: JsonValue }
  idempotencyKey: string
  signal: AbortSignal
}

export interface ObserveNodeInvocation {
  binding: RunBinding
  node: Extract<ChainNode, { kind: "observe" }>
  target?: BrowserNodeInvocation["target"]
  signal: AbortSignal
}

export interface HumanNodeInvocation {
  binding: RunBinding
  node: Extract<ChainNode, { kind: "human" }>
  checkpoint: TaskCheckpoint
  resuming: boolean
  resumeCondition: { operator: "exists"; path: (string | number)[] }
    | { operator: "equals"; path: (string | number)[]; expected: JsonValue }
  signal: AbortSignal
}

export interface LlmNodeInvocation {
  binding: RunBinding
  mode: TaskRunMode
  node: Extract<ChainNode, { kind: "llm" }>
  input: JsonValue
  callId: string
  signal: AbortSignal
  onModelCall?(report: ModelCallReport): Promise<void>
}

export type ModelCallReport = Readonly<{
  callId: string
  purpose: "agent" | "judge" | "workflow_generation" | "variable_suggestion" | "extract" | "output_conversion" | "semantic_annotation"
  model: string
  intendedAt: string
  status: "intended" | "completed" | "failed" | "interrupted"
  reportedInvocations: number | null
}>

export interface InvokeChainInvocation {
  parent: RunBinding
  chain: VersionReference
  input: JsonValue
  invocationId: string
  stableKey: string
  idempotencyKey: string
  signal: AbortSignal
}

export interface TaskChainCapabilities {
  capability?(invocation: CapabilityNodeInvocation): Promise<NodeCapabilityResult>
  browser?(invocation: BrowserNodeInvocation): Promise<NodeCapabilityResult>
  observe?(invocation: ObserveNodeInvocation): Promise<NodeCapabilityResult>
  human?(invocation: HumanNodeInvocation): Promise<NodeCapabilityResult>
  llm?(invocation: LlmNodeInvocation): Promise<NodeCapabilityResult & { reportedInvocations: number | null }>
  invoke?(invocation: InvokeChainInvocation): Promise<InvokeChainResult>
  verifyResume?(checkpoint: TaskCheckpoint, signal: AbortSignal): Promise<ResumeVerificationResult>
  persist?(run: TaskRun): Promise<void> | void
  now?(): Date
  activeElapsedMs?(): number
  browserCommandCount?(): number
  accountConsumption?(delta: Partial<TaskConsumption>, mode?: "claim" | "settle"): void
}

export class RuntimeBudgetExceededError extends Error {
  constructor(message: string) { super(message) }
}

export interface RuntimeControl {
  checkpoint?: TaskCheckpoint
  resumeRequest?: unknown
  pauseAtCheckpoint?: boolean
  signal?: AbortSignal
}

export interface TaskChainRuntimeInput {
  chain: unknown
  request: TaskRunRequest | unknown
  capabilities: TaskChainCapabilities
  control?: RuntimeControl
}
