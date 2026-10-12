import type { ValueSchema } from "@browser-capture/contracts"

export function collectOrigins(values: unknown[]) {
  return [...new Set(collectUrls(values).map((value) => new URL(value).origin))]
}

export function collectUrls(values: unknown[]) {
  const urls = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const candidates = [value, ...value.matchAll(/https?:\/\/[^\s\])\]}>"']+/gi)].map((item) => typeof item === "string" ? item : item[0])
      for (const candidate of candidates) {
        try { const url = new URL(candidate); if (["http:", "https:"].includes(url.protocol)) urls.add(url.href) }
        catch { /* 普通任务文本不是 URL。 */ }
      }
      return
    }
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value && typeof value === "object") for (const item of Object.values(value)) visit(item)
  }
  for (const value of values) visit(value)
  return [...urls].slice(0, 64)
}

export function valueJsonSchema(schema: ValueSchema): Record<string, unknown> {
  if (schema.type === "null") return { type: "null" }
  if (schema.type === "boolean") return { type: "boolean" }
  if (schema.type === "string") return { type: "string", ...(schema.enum ? { enum: schema.enum } : {}),
    ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }), ...(schema.maxLength === undefined ? {} : { maxLength: schema.maxLength }) }
  if (schema.type === "number" || schema.type === "integer") return { type: schema.type,
    ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }), ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }) }
  if (schema.type === "array") return { type: "array", items: valueJsonSchema(schema.items),
    ...(schema.minItems === undefined ? {} : { minItems: schema.minItems }), ...(schema.maxItems === undefined ? {} : { maxItems: schema.maxItems }) }
  if (schema.type !== "object") throw new Error("unsupported_value_schema")
  return { type: "object", properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, valueJsonSchema(value)])),
    required: schema.required, additionalProperties: schema.additionalProperties }
}
