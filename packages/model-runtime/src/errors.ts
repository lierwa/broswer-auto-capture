export type ModelRuntimeErrorCode =
  | "authentication_required"
  | "busy"
  | "connection_failed"
  | "invalid_output"
  | "protocol_error"
  | "timeout"

export class ModelRuntimeError extends Error {
  constructor(
    readonly code: ModelRuntimeErrorCode,
    message: string,
    readonly diagnostic: string,
  ) {
    super(message)
    this.name = "ModelRuntimeError"
  }
}

export function protocolError(phase: string): ModelRuntimeError {
  return new ModelRuntimeError(
    "protocol_error",
    "Codex App Server 返回了无法识别的协议消息，本轮未完成。",
    `phase=${boundedLabel(phase)}`,
  )
}

export function authenticationError(source: string): ModelRuntimeError {
  return new ModelRuntimeError(
    "authentication_required",
    "本机 Codex 尚未使用 ChatGPT 登录，请先完成官方登录后重试。",
    `source=${boundedLabel(source)}`,
  )
}

export function timeoutError(phase: string, timeoutMs: number): ModelRuntimeError {
  return new ModelRuntimeError(
    "timeout",
    "Codex App Server 响应超时，本轮未完成。",
    `phase=${boundedLabel(phase)} timeoutMs=${timeoutMs}`,
  )
}

function boundedLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120)
}
