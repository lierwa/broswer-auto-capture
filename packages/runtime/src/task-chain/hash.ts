import { createHash } from "node:crypto"
import type { TaskChain } from "@browser-capture/contracts"

export function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function stableUuid(...parts: string[]): string {
  const hex = createHash("sha256").update(parts.join("\u0000")).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

// WHY：验证证据引用被验证的可执行定义；若把证据自身纳入 digest，会形成自引用且每次追加证据都会改写执行身份。
export function executableChainDigest(chain: TaskChain): string {
  return digestJson({ ...chain, validation: { status: "candidate", evidence: [] } })
}
