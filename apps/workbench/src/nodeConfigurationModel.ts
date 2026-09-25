import { nodeBindings, type ChainNode, type JsonValue, type TaskChain, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { actionPresentation } from "./chainNodePresentation.js"

export type BindingChoice = { key: string; label: string; binding: ValueBinding; schema: ValueSchema }

export function schemaFields(schema: ValueSchema, path: (string | number)[] = []): { path: (string | number)[]; schema: ValueSchema }[] {
  if (schema.type !== "object") return [{ path, schema }]
  return Object.entries(schema.properties).flatMap(([key, child]) => [{ path: [...path, key], schema: child },
    ...(child.type === "object" ? schemaFields(child, [...path, key]) : [])])
}

export function bindingChoices(chain: TaskChain, node: ChainNode): BindingChoice[] {
  const upstream = new Set<string>(), pending = [node.id]
  while (pending.length) {
    const current = pending.pop()!
    for (const edge of chain.edges.filter((item) => item.to === current)) {
      if (edge.from === node.id || upstream.has(edge.from)) continue
      upstream.add(edge.from); pending.push(edge.from)
    }
  }
  const input = schemaFields(chain.inputContract.schema).filter((field) => field.schema.type !== "null")
    .map(({ path, schema }) => choice(`任务输入 · ${path.join(".") || "全部输入"}`, { source: "input", path }, schema))
  return [...input, ...chain.nodes.filter((item) => upstream.has(item.id)).flatMap((item) => {
    const fields = [{ path: [], schema: item.outputContract.schema }, ...schemaFields(item.outputContract.schema).filter((field) => field.path.length)]
    return fields.filter((field) => field.schema.type !== "null").map(({ path, schema }) => choice(
      `${actionPresentation(item).title} · ${path.join(".") || "全部输出"}`, { source: "node", nodeId: item.id, path }, schema))
  })]
}

function choice(label: string, binding: ValueBinding, schema: ValueSchema): BindingChoice {
  return { key: JSON.stringify(binding), label, binding, schema }
}

export function editableInputs(node: ChainNode): Record<string, ValueBinding> | null {
  if (node.kind === "function") return node.inputs
  if (node.kind === "capability") return node.input
  if (node.kind === "browser" || node.kind === "data") return node.arguments
  if (node.kind === "invoke" || node.kind === "llm") return { input: node.input }
  return null
}

export function replaceInputs(node: ChainNode, inputs: Record<string, ValueBinding>): ChainNode {
  if (node.kind === "function") return { ...node, inputs }
  if (node.kind === "capability") return { ...node, input: inputs }
  if (node.kind === "browser" || node.kind === "data") return { ...node, arguments: inputs }
  if ((node.kind === "invoke" || node.kind === "llm") && inputs.input) return { ...node, input: inputs.input }
  return node
}

export function valueSchema(value: JsonValue): ValueSchema {
  if (value === null) return { type: "null" }
  if (typeof value === "string") return { type: "string" }
  if (typeof value === "boolean") return { type: "boolean" }
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" }
  if (Array.isArray(value)) return { type: "array", items: value.length ? valueSchema(value[0]!) : { type: "string" } }
  return { type: "object", properties: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, valueSchema(item)])),
    required: Object.keys(value), additionalProperties: false }
}

export function outputConsumers(chain: TaskChain, node: ChainNode) {
  return chain.nodes.filter((item) => nodeBindings(item).some((binding) => binding.source === "node" && binding.nodeId === node.id))
    .map((item) => actionPresentation(item).title)
}

export const schemaTypeLabels: Record<ValueSchema["type"], string> = {
  string: "文本", number: "数值", integer: "整数", boolean: "布尔值", object: "对象", array: "列表", null: "空值",
}

export function defaultSchema(type: ValueSchema["type"]): ValueSchema {
  if (type === "object") return { type, properties: {}, required: [], additionalProperties: false }
  if (type === "array") return { type, items: { type: "string" } }
  return { type }
}
