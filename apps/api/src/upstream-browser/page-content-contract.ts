import type { ResultSpec, ValueSchema } from "@browser-capture/contracts"

// WHY：技术信封由宿主固定，不能让最终业务字段反向决定采集策略。
export const contentValueSchema: ValueSchema = { type: "object", properties: { content: { type: "string" } },
  required: ["content"], additionalProperties: false }
export const CONTENT_SOURCE = "page-content"
export function isContentResult(spec: ResultSpec) {
  return spec.mode === "data" && spec.fields.some(field => field.producerRef === CONTENT_SOURCE)
}
