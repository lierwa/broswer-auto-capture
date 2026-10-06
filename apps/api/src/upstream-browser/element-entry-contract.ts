import { z } from "zod"
import type { ValueSchema } from "@browser-capture/contracts"

export const legacyElementEntryValueSchema: ValueSchema = { type: "object", properties: {
  kind: { type: "string", minLength: 1, maxLength: 7 }, tabId: { type: "string", minLength: 4, maxLength: 4 },
  url: { type: "string", minLength: 1, maxLength: 32000 }, selector: { type: "string", minLength: 1, maxLength: 2000 },
  ordinal: { type: "integer", minimum: 1, maximum: 300 }, text: { type: "string", minLength: 0, maxLength: 8000 },
  backendNodeId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  documentRootId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } },
  required: ["kind", "tabId", "url", "selector", "ordinal", "text", "backendNodeId", "documentRootId"], additionalProperties: false }
export const elementEntryValueSchema: ValueSchema = { ...legacyElementEntryValueSchema,
  properties: { ...legacyElementEntryValueSchema.properties, navigationUrl: { type: "string", minLength: 1, maxLength: 32000 } } }
export const elementEntrySchema = z.object({ kind: z.literal("element"), tabId: z.string().length(4),
  url: z.string().url(), selector: z.string().min(1).max(2000), ordinal: z.number().int().min(1).max(300),
  text: z.string().max(8000), backendNodeId: z.number().int().positive(), documentRootId: z.number().int().positive(),
  navigationUrl: z.string().url().max(32000).optional() }).strict()
