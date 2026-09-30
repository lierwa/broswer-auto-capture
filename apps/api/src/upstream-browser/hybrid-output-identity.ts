import { isDeepStrictEqual } from "node:util"
import type { ValueBinding, ValueSchema } from "@browser-capture/contracts"

type Field = { path: Array<string | number>; binding: ValueBinding }
export type BindingSchema = (binding: ValueBinding) => ValueSchema | null

/** WHY：只消除完整值复制；拆字段重组可能改变键序，而现有 equals/源码消费者能观察该差异。 */
export function identityOutput(fields: Field[], target: ValueSchema, sourceSchema?: BindingSchema): ValueBinding | null {
  const first = fields[0]
  if (fields.length !== 1 || !first || first.path.length || !sourceSchema || first.binding.source === "constant") return null
  return isDeepStrictEqual(sourceSchema(first.binding), target) ? first.binding : null
}

/** WHY：同一封闭对象只需一次已有 assemble；保留字段顺序和变量写，不能以 schema 猜整值键序。 */
export function projectedOutput(fields: Field[], sourceSchema?: BindingSchema) {
  const first = fields[0]?.binding
  if (!first || first.source === "constant" || !first.path.length || !sourceSchema) return null
  const source = { ...first, path: first.path.slice(0, -1) }
  const paths: Record<string, Field["path"]> = {}
  const keys: string[] = []
  for (const field of fields) {
    const binding = field.binding, key = binding.source === "constant" ? null : binding.path.at(-1)
    if (binding.source === "constant" || typeof key !== "string" || Object.hasOwn(paths, key)
      || !isDeepStrictEqual({ ...binding, path: binding.path.slice(0, -1) }, source)) return null
    keys.push(key); paths[key] = field.path
  }
  const schema = sourceSchema(source)
  if (!isDeepStrictEqual(Object.keys(paths), keys) || schema?.type !== "object" || schema.additionalProperties
    || Object.keys(schema.properties).length !== keys.length
    || keys.some(key => !Object.hasOwn(schema.properties, key) || !schema.required.includes(key))) return null
  return { source, paths }
}

export function bindingSchemaInGraph(binding: ValueBinding, input: ValueSchema,
  nodes: ReadonlyArray<{ id: string; outputContract: { schema: ValueSchema } }>, variables: Record<string, { schema: ValueSchema }>) {
  if (binding.source === "constant") return null
  let schema: ValueSchema | undefined = binding.source === "input" ? input : binding.source === "node"
    ? nodes.find(node => node.id === binding.nodeId)?.outputContract.schema : variables[binding.name]?.schema
  for (const part of binding.path) {
    if (schema?.type === "object" && typeof part === "string") schema = schema.properties[part]
    else if (schema?.type === "array" && typeof part === "number") schema = schema.items
    else return null
  }
  return schema ?? null
}
