import { parseAIEvent, type AIEvent } from "@agent-platform/ai-connect/client"
import { z } from "zod"

// WHY：所有宿主记录都在持久化边界复用公共 parser，避免页面或业务模块复制事件协议。
export const aiEventSchema = z.unknown().transform((value, context): AIEvent => {
  try { return parseAIEvent(value) }
  catch {
    context.addIssue({ code: "custom", message: "模型调用事件无效" })
    return z.NEVER
  }
})
export type { AIEvent }
