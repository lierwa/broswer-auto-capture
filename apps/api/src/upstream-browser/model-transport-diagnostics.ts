import { AsyncLocalStorage } from "node:async_hooks"
import { channel } from "node:diagnostics_channel"
import { z } from "zod"

const networkCodes = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT"] as const
export const modelTransportDiagnosticSchema = z.object({
  code: z.enum(networkCodes).nullable(), httpStatus: z.number().int().min(400).max(599).nullable(),
}).strict()
type Diagnostic = z.infer<typeof modelTransportDiagnosticSchema>
type Scope = { diagnostic?: Diagnostic }
const scope = new AsyncLocalStorage<Scope>(), requests = new WeakMap<object, Scope>()

function networkCode(value: unknown, depth = 0): Diagnostic["code"] {
  if (!value || typeof value !== "object" || depth > 3) return null
  const error = value as { code?: unknown; cause?: unknown; errors?: unknown[] }
  const code = z.enum(networkCodes).safeParse(error.code)
  return code.success ? code.data : networkCode(error.cause, depth + 1)
    ?? error.errors?.slice(0, 4).map(item => networkCode(item, depth + 1)).find(Boolean) ?? null
}

// WHY：官方诊断通道只保存白名单错误码/HTTP状态；用请求身份隔离并发，不读取正文、URL或凭据。
channel("undici:request:create").subscribe(raw => {
  const request = (raw as { request?: object }).request, current = scope.getStore()
  if (request && current) requests.set(request, current)
})
channel("undici:request:error").subscribe(raw => {
  const { request, error } = raw as { request: object; error: unknown }, current = requests.get(request)
  const code = networkCode(error)
  if (current && code) current.diagnostic = { code, httpStatus: current.diagnostic?.httpStatus ?? null }
})
channel("undici:request:headers").subscribe(raw => {
  const { request, response } = raw as { request: object; response: { statusCode: number } }
  const current = requests.get(request), status = response.statusCode
  if (current && status >= 400 && status <= 599) current.diagnostic = { code: null, httpStatus: status }
})

export function withModelTransport<T>(work: (diagnostic: () => Diagnostic | undefined) => Promise<T>) {
  const current: Scope = {}
  return scope.run(current, () => work(() => current.diagnostic))
}
