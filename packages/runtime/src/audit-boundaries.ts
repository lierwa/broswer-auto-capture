import type { ExecutionEvent } from "@browser-capture/contracts/run"

export interface ExplicitLlmGateway {
  invoke(input: string, options: { signal?: AbortSignal }): Promise<string>
}

export interface ExplicitLlmInvocation {
  nodeId: string
  model: string
  input: string
  signal?: AbortSignal
}

/** WHY: 只有这个显式网关包装器能写入模型调用事件；普通 adapter 的类型中不存在模型依赖。 */
export async function invokeExplicitLlmGateway(
  gateway: ExplicitLlmGateway,
  invocation: ExplicitLlmInvocation,
  record: (event: ExecutionEvent) => Promise<void>,
) {
  const event: ExecutionEvent = {
    type: "llm_gateway_call_intended",
    at: new Date().toISOString(),
    nodeId: invocation.nodeId,
    model: invocation.model,
  }
  await record(event)
  const options = invocation.signal ? { signal: invocation.signal } : {}
  return gateway.invoke(invocation.input, options)
}
