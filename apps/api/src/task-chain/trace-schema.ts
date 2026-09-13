import type { JsonValue, TaskDataContract, ValueSchema } from "@browser-capture/contracts"

const text: ValueSchema = { type: "string" }
const object = (properties: Record<string, ValueSchema>, required = Object.keys(properties)): ValueSchema =>
  ({ type: "object", properties, required, additionalProperties: true })
const array = (items: ValueSchema): ValueSchema => ({ type: "array", items })

/** WHY：工具的稳定协议定义集合元素类型；首个样本的空集合不能把后续页面锁成 object[]。 */
export function observationContract(id: string, type: "observe" | "page" | "read" | "tabs"): TaskDataContract {
  const schema = type === "tabs" ? array(object({ tabId: { type: "number" }, active: { type: "boolean" }, url: text }))
    : type === "read" ? object({ url: text, observedAt: text, truncated: { type: "boolean" },
      matches: array(object({ text, tag: text, attributes: object({}) })) })
      : object({ url: text, title: text, text, truncated: { type: "boolean" }, observedAt: text,
        links: array(object({ url: text, title: text })), headings: array(object({ level: { type: "number" }, text })), paragraphs: array(text) },
      type === "observe" ? ["url", "text", "truncated", "observedAt"] : undefined)
  return { id, version: 1, dialect: "bat-value-schema/v1", schema }
}

export function outputFieldContract(id: string, contract: TaskDataContract, path: (string | number)[], sample: JsonValue): TaskDataContract {
  let schema = contract.schema
  for (const key of path) {
    const child = typeof key === "number" && schema.type === "array" ? schema.items
      : typeof key === "string" && schema.type === "object" ? schema.properties[key] : undefined
    if (!child) return inferredContract(id, sample)
    schema = child
  }
  return { ...contract, id, schema }
}

export function inferredContract(id: string, value: JsonValue): TaskDataContract {
  return { id, version: 1, dialect: "bat-value-schema/v1", schema: inferredSchema(value) }
}
export function inferredSchema(value: JsonValue): ValueSchema {
  if (value === null) return { type: "null" }
  if (typeof value === "string") return { type: "string" }
  if (typeof value === "boolean") return { type: "boolean" }
  if (typeof value === "number") return { type: "number" }
  if (Array.isArray(value)) {
    const first = value[0]
    return { type: "array", items: first === undefined ? { type: "object", properties: {}, required: [], additionalProperties: true }
      : inferredSchema(first) }
  }
  return { type: "object", properties: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, inferredSchema(child)])),
    required: Object.keys(value), additionalProperties: true }
}
