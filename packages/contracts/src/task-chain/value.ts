import { z } from "zod"
import { Ajv2020 } from "ajv/dist/2020.js"
import { artifactReferenceSchema, textSchema } from "./common.js"

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export const jsonValueSchema: z.ZodType<JsonValue> = z.json()

// WHY：保存可移植的有限 schema 方言，禁止远程引用或任意代码；不把任务的键变成平台枚举。
export type ValueSchema =
  | { type: "null" | "boolean" }
  | { type: "string"; minLength?: number | undefined; maxLength?: number | undefined; enum?: string[] | undefined }
  | { type: "number" | "integer"; minimum?: number | undefined; maximum?: number | undefined }
  | { type: "array"; items: ValueSchema; minItems?: number | undefined; maxItems?: number | undefined }
  | { type: "object"; properties: Record<string, ValueSchema>; required: string[]; additionalProperties: boolean }

const size = z.number().int().nonnegative()
const propertyName = z.string().min(1).max(200)
  .refine((value) => !["__proto__", "constructor", "prototype"].includes(value), "不允许原型键")
export const valueSchemaSchema: z.ZodType<ValueSchema> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("null") }).strict(),
  z.object({ type: z.literal("boolean") }).strict(),
  z.object({ type: z.literal("string"), minLength: size.optional(), maxLength: size.optional(),
    enum: z.array(z.string()).min(1).optional() }).strict(),
  z.object({ type: z.literal("number"), minimum: z.number().optional(), maximum: z.number().optional() }).strict(),
  z.object({ type: z.literal("integer"), minimum: z.number().optional(), maximum: z.number().optional() }).strict(),
  z.object({ type: z.literal("array"), items: valueSchemaSchema, minItems: size.optional(), maxItems: size.optional() }).strict(),
  z.object({ type: z.literal("object"), properties: z.record(propertyName, valueSchemaSchema),
    required: z.array(propertyName), additionalProperties: z.boolean() }).strict(),
]).superRefine((schema, ctx) => {
  const pair = schema.type === "string" ? [schema.minLength, schema.maxLength]
    : schema.type === "array" ? [schema.minItems, schema.maxItems]
      : schema.type === "number" || schema.type === "integer" ? [schema.minimum, schema.maximum] : []
  if (pair[0] !== undefined && pair[1] !== undefined && pair[0] > pair[1]) {
    ctx.addIssue({ code: "custom", message: "schema 下界不能大于上界" })
  }
  if (schema.type !== "object") return
  if (new Set(schema.required).size !== schema.required.length || schema.required.some((key) => !Object.hasOwn(schema.properties, key))) {
    ctx.addIssue({ code: "custom", message: "required 必须唯一且引用已声明属性" })
  }
}))

export const taskDataContractSchema = z.object({
  id: textSchema, version: z.number().int().positive(), dialect: z.literal("bat-value-schema/v1"), schema: valueSchemaSchema,
}).strict()
export const taskDataReferenceSchema = taskDataContractSchema.pick({ id: true, version: true })
export const taskOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("value"), contract: taskDataReferenceSchema, value: jsonValueSchema }).strict(),
  z.object({ kind: z.literal("artifact"), contract: taskDataReferenceSchema, artifact: artifactReferenceSchema }).strict(),
])
export type TaskDataContract = z.infer<typeof taskDataContractSchema>
export type TaskOutput = z.infer<typeof taskOutputSchema>

// WHY：动态schema在Python也由JSON Schema校验器消费；逐类型翻译为Zod会改变Unicode等值语义。
const taskValueValidator = new Ajv2020({ strict: true, ownProperties: true,
  coerceTypes: false, useDefaults: false, removeAdditional: false })

/** 动态值也先验证 schema 版本；不能用类型断言跳过跨包校验。 */
export function parseTaskValue(rawContract: unknown, rawValue: unknown): JsonValue {
  const contract = taskDataContractSchema.parse(rawContract)
  const value = jsonValueSchema.parse(rawValue)
  try {
    const validate = taskValueValidator.compile<JsonValue>(contract.schema)
    return z.custom<JsonValue>((candidate) => validate(candidate), "数据不符合任务合同").parse(value)
  } finally {
    // WHY：Zod规范化产生新schema对象；使用Ajv公开释放接口，避免长期进程累积临时编译缓存。
    taskValueValidator.removeSchema(contract.schema)
  }
}

export function parseTaskOutput(rawContract: unknown, rawOutput: unknown): TaskOutput {
  const contract = taskDataContractSchema.parse(rawContract), output = taskOutputSchema.parse(rawOutput)
  if (output.contract.id !== contract.id || output.contract.version !== contract.version) throw new Error("output_contract_mismatch")
  // 产物内容在读取 artifact 时校验；此边界仅校验引用，不能冒充已经读取内容。
  return output.kind === "artifact" ? output : { ...output, value: parseTaskValue(contract, output.value) }
}

/** WHY：无参数合同仍需两次独立验证，但不存在可伪造的“另一组输入”；只有值域确实大于一时才要求换值。 */
export function taskInputRequiresVariation(rawContract: unknown) {
  return valueSchemaHasAlternatives(taskDataContractSchema.parse(rawContract).schema)
}

function valueSchemaHasAlternatives(schema: ValueSchema): boolean {
  if (schema.type === "null") return false
  if (schema.type === "boolean") return true
  if (schema.type === "string") {
    if (schema.enum) return new Set(schema.enum).size > 1
    return schema.maxLength !== 0
  }
  if (schema.type === "number" || schema.type === "integer") {
    return schema.minimum === undefined || schema.maximum === undefined || schema.minimum !== schema.maximum
  }
  if (schema.type === "array") {
    if (schema.maxItems === 0) return false
    if (schema.minItems === undefined || schema.maxItems === undefined || schema.minItems !== schema.maxItems) return true
    return schema.minItems > 0 && valueSchemaHasAlternatives(schema.items)
  }
  if (schema.type !== "object") return false
  if (schema.additionalProperties || schema.required.length !== Object.keys(schema.properties).length) return true
  return Object.values(schema.properties).some(valueSchemaHasAlternatives)
}
