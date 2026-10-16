import { isDeepStrictEqual } from "node:util"
import type { JsonValue, ValueSchema } from "@browser-capture/contracts"

const scalar = (schema: ValueSchema) => ["string", "number", "integer", "boolean"].includes(schema.type)
const field = (schema: ValueSchema) => scalar(schema) || schema.type === "array" && scalar(schema.items)
  && (schema.maxItems === undefined || schema.maxItems > 0 && schema.maxItems <= 300)
const record = (schema: ValueSchema) => schema.type === "object" && Object.keys(schema.properties).length > 0
  && Object.keys(schema.properties).length <= 100 && Object.values(schema.properties).every(field)

/** WHY：与 Python ReadSpec 公共形态一致；省略路径只允许合同中唯一可读位置，不能信任产物自报。 */
export function contractReadPaths(schema: ValueSchema, path: string[] = []): string[][] {
  const readable = scalar(schema) || record(schema)
    || schema.type === "array" && (scalar(schema.items) || record(schema.items))
  return [...(readable ? [path] : []), ...(schema.type === "object"
    ? schema.required.flatMap(name => contractReadPaths(schema.properties[name]!, [...path, name])) : [])]
}

export function contractOwnsValue(schema: ValueSchema, value: JsonValue) {
  if (schema.type === "null") return value === null
  if (schema.type === "string" && schema.enum?.length === 1) return isDeepStrictEqual(value, schema.enum[0])
  return (schema.type === "integer" || schema.type === "number") && schema.minimum !== undefined
    && schema.minimum === schema.maximum && value === schema.minimum
}
