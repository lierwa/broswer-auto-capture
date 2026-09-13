import { z } from "zod"
import { keySchema, textSchema } from "./common.js"
import { jsonValueSchema } from "./value.js"

// WHY：分段路径支持任意任务键与数组索引，不执行表达式，也不允许原型链访问。
export const valuePathSchema = z.array(z.union([
  z.string().max(200).refine((value) => !["__proto__", "constructor", "prototype"].includes(value), "不允许原型路径"),
  z.number().int().nonnegative(),
])).max(40)
export const valueBindingSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("input"), path: valuePathSchema }).strict(),
  z.object({ source: z.literal("node"), nodeId: keySchema, path: valuePathSchema }).strict(),
  z.object({ source: z.literal("variable"), name: keySchema, path: valuePathSchema }).strict(),
  z.object({ source: z.literal("constant"), value: jsonValueSchema }).strict(),
])
export const valueWriteSchema = z.object({ variable: keySchema, path: valuePathSchema }).strict()
export const predicateSchema = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("exists"), value: valueBindingSchema }).strict(),
  z.object({ operator: z.literal("equals"), left: valueBindingSchema, right: valueBindingSchema }).strict(),
  z.object({ operator: z.literal("greater_than"), left: valueBindingSchema, right: valueBindingSchema }).strict(),
])
// fresh observation 是等待条件的被检对象；不伪造一个尚未完成节点的输出 binding。
export const observationConditionSchema = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("exists"), path: valuePathSchema }).strict(),
  z.object({ operator: z.literal("equals"), path: valuePathSchema, expected: valueBindingSchema }).strict(),
])
export const completionConditionSchema = z.object({
  id: keySchema, description: textSchema, predicate: predicateSchema,
}).strict()
export type ValueBinding = z.infer<typeof valueBindingSchema>
export type ValueWrite = z.infer<typeof valueWriteSchema>
export type Predicate = z.infer<typeof predicateSchema>
