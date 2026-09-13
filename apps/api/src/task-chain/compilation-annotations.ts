import { z } from "zod"
import { valuePathSchema } from "@browser-capture/contracts"
import { readPath } from "@browser-capture/runtime"
import { provenanceSchema, type ExplorationTrace } from "./exploration-trace.js"

export const compilationAnnotationsSchema = z.object({
  replayEventIds: z.array(z.string()).default([]),
  continueOnMissingEventIds: z.array(z.string()).default([]),
  inputBindings: z.array(z.object({ eventId: z.string(), commandPath: valuePathSchema, inputPath: valuePathSchema }).strict()),
  repeatRegions: z.array(z.object({ startEventId: z.string(), endEventId: z.string(), collectionPath: valuePathSchema,
    stableKeyPath: valuePathSchema, maxItems: z.number().int().positive(), itemBindings: z.array(z.object({
      eventId: z.string(), commandPath: valuePathSchema, itemPath: valuePathSchema }).strict()).min(1) }).strict()),
  outputMappings: z.array(provenanceSchema).min(1),
  completion: z.array(z.object({ eventId: z.string(), resultPath: valuePathSchema.describe(
    "相对于对应探索事件 event.output 根节点的路径。例如 event.output 为 {text: ...} 时填写 [\"text\"]，不能填写 [\"output\", \"text\"]。"),
    description: z.string().min(1) }).strict()).min(1),
  reuseBoundary: z.object({ description: z.string().min(1), assumptions: z.array(z.string()), invalidationConditions: z.array(z.string()) }).strict(),
}).strict()
export type CompilationAnnotations = z.infer<typeof compilationAnnotationsSchema>
// WHY：字段来源已经由 complete 校验并持久化；不用模型重新抄写，否则文字改写会破坏身份。
export const compilationModelAnnotationsSchema = compilationAnnotationsSchema.omit({ outputMappings: true }).strict()

export function validateAnnotations(raw: unknown, trace: ExplorationTrace) {
  const value = compilationAnnotationsSchema.parse(raw), events = new Map(trace.events.map((event) => [event.id, event]))
  if (!trace.result) throw new Error("exploration_business_result_missing")
  if (JSON.stringify(value.outputMappings) !== JSON.stringify(trace.result.provenance)) throw new Error("annotation_provenance_changed")
  const candidates = trace.events.filter((event) => event.id !== "initial")
  if (!value.replayEventIds.length && candidates.some((event) => event.status !== "completed")) throw new Error("annotation_replay_path_required")
  const requested = value.replayEventIds.length ? value.replayEventIds : candidates.map((event) => event.id)
  if (new Set(requested).size !== requested.length) throw new Error("annotation_replay_event_invalid")
  const required = [...value.outputMappings.flatMap((item) => item.source === "tool" ? [item.eventId] : item.eventIds),
    ...value.inputBindings.map((item) => item.eventId), ...value.completion.map((item) => item.eventId),
    ...value.repeatRegions.flatMap((item) => [item.startEventId, item.endEventId, ...item.itemBindings.map((binding) => binding.eventId)])]
  // WHY：字段来源和完成条件已由宿主校验；模型漏列它自己引用的成功事件时按原轨迹顺序补齐，不能再次访问页面修编译元数据。
  const replaySet = new Set([...requested, ...required, ...value.continueOnMissingEventIds])
  const replayEventIds = trace.events.filter((event) => replaySet.has(event.id)).map((event) => event.id)
  if (replayEventIds.length !== replaySet.size) throw new Error("annotation_replay_event_invalid")
  const selected = replayEventIds.map((id) => events.get(id))
  if (selected.some((event) => !event || event.id === "initial" || event.status !== "completed")) throw new Error("annotation_replay_event_invalid")
  const positions = replayEventIds.map((id) => trace.events.findIndex((event) => event.id === id))
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) throw new Error("annotation_replay_order_invalid")
  value.replayEventIds = replayEventIds
  if (new Set(value.continueOnMissingEventIds).size !== value.continueOnMissingEventIds.length) throw new Error("annotation_optional_event_invalid")
  for (const eventId of value.continueOnMissingEventIds) {
    const event = events.get(eventId), command = event?.command
    const targetAction = command && ["click", "hover", "press"].includes(command.type) && "target" in command && command.target
    if (!event || event.status !== "completed" || !targetAction || required.includes(eventId)) throw new Error("annotation_optional_event_invalid")
  }
  const bound = new Set<string>()
  for (const binding of value.inputBindings) {
    const event = events.get(binding.eventId), key = JSON.stringify([binding.eventId, binding.commandPath])
    if (!event || event.status !== "completed") throw new Error("annotation_event_missing")
    if (!binding.commandPath.length || binding.commandPath[0] === "type" || bound.has(key)) throw new Error("annotation_binding_invalid")
    bound.add(key)
    if (JSON.stringify(readPath(z.json().parse(event.command), binding.commandPath)) !== JSON.stringify(readPath(trace.input, binding.inputPath))) throw new Error("annotation_sample_binding_mismatch")
  }
  const inputScalarPaths = scalarPaths(trace.input)
  // WHY：同一 locator 中 name 已确定来自输入时，role 等同级样本也属于同一动态目标；宿主可由精确样本值补齐，避免模型漏列一个字段后重新访问页面。
  for (const event of selected as NonNullable<typeof selected[number]>[]) {
    const command = z.json().parse(event.command)
    const anchors = value.inputBindings.filter((binding) => binding.eventId === event.id)
    for (const path of scalarPaths(command)) {
      const key = JSON.stringify([event.id, path])
      if (!path.length || path[0] === "type" || bound.has(key)
        || !anchors.some((binding) => sameParent(binding.commandPath, path))) continue
      const sample = readPath(command, path)
      const matches = inputScalarPaths.filter((inputPath) => JSON.stringify(readPath(trace.input, inputPath)) === JSON.stringify(sample))
      if (matches.length !== 1) continue
      value.inputBindings.push({ eventId: event.id, commandPath: path, inputPath: matches[0]! })
      bound.add(key)
    }
  }
  for (const condition of value.completion) {
    const event = events.get(condition.eventId)
    if (!event || event.status !== "completed" || readPath(event.output, condition.resultPath) === null) throw new Error("annotation_completion_unobserved")
  }
  for (const region of value.repeatRegions) {
    const start = trace.events.findIndex((event) => event.id === region.startEventId), end = trace.events.findIndex((event) => event.id === region.endEventId)
    const collection = readPath(trace.input, region.collectionPath)
    if (start < 0 || end < start || !Array.isArray(collection) || !collection.length || collection.length > region.maxItems) throw new Error("annotation_repeat_invalid")
    const keys = collection.map((item) => readPath(item, region.stableKeyPath))
    if (keys.some((key) => !["string", "number", "boolean"].includes(typeof key)) || new Set(keys.map(String)).size !== keys.length) throw new Error("annotation_stable_key_invalid")
    for (const binding of region.itemBindings) {
      const index = trace.events.findIndex((event) => event.id === binding.eventId)
      if (index < start || index > end || JSON.stringify(readPath(z.json().parse(trace.events[index]!.command), binding.commandPath)) !== JSON.stringify(readPath(collection[0]!, binding.itemPath))) throw new Error("annotation_repeat_binding_invalid")
    }
  }
  for (const event of selected as NonNullable<typeof selected[number]>[]) {
    for (const path of scalarPaths(z.json().parse(event.command))) {
      const sample = readPath(z.json().parse(event.command), path)
      if (path[0] === "type" || typeof sample !== "string" || !sample.length) continue
      const matchingInputPaths = inputScalarPaths.filter((inputPath) => JSON.stringify(readPath(trace.input, inputPath)) === JSON.stringify(sample))
      const isInput = matchingInputPaths.length > 0
      const boundInput = value.inputBindings.some((binding) => binding.eventId === event.id && binding.commandPath.every((part, index) => path[index] === part))
      const boundItem = value.repeatRegions.some((region) => region.itemBindings.some((binding) => binding.eventId === event.id && binding.commandPath.every((part, index) => path[index] === part)))
      // WHY：固定控件与业务目标可能共享 button/link 等字符串；只要对应输入路径已绑定到真实业务命令，就不能把其余同值常量误改成动态值。
      const inputPathBound = value.inputBindings.some((binding) => matchingInputPaths.some((inputPath) => JSON.stringify(binding.inputPath) === JSON.stringify(inputPath)))
      if (isInput && !boundInput && !boundItem && !inputPathBound) throw new Error("annotation_dynamic_input_unbound")
    }
  }
  return value
}
function sameParent(left: (string | number)[], right: (string | number)[]) {
  if (left.length !== right.length || left.length < 2) return false
  return left.slice(0, -1).every((part, index) => part === right[index])
}
function scalarPaths(value: import("@browser-capture/contracts").JsonValue, path: (string | number)[] = []): (string | number)[][] {
  if (value === null || typeof value !== "object") return [path]
  return Object.entries(value).flatMap(([key, child]) => scalarPaths(child, [...path, Array.isArray(value) ? Number(key) : key]))
}
