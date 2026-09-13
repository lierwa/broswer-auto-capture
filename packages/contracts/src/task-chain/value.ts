import { z } from "zod"
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

function stringValidator(schema: Extract<ValueSchema, { type: "string" }>) {
  let validator = z.string()
  if (schema.minLength !== undefined) validator = validator.min(schema.minLength)
  if (schema.maxLength !== undefined) validator = validator.max(schema.maxLength)
  return schema.enum ? validator.refine((value) => schema.enum!.includes(value), "不在允许值中") : validator
}

function valueValidator(schema: ValueSchema): z.ZodType {
  if (schema.type === "null") return z.null()
  if (schema.type === "boolean") return z.boolean()
  if (schema.type === "string") return stringValidator(schema)
  if (schema.type === "number" || schema.type === "integer") {
    let validator = schema.type === "integer" ? z.number().int() : z.number()
    if (schema.minimum !== undefined) validator = validator.min(schema.minimum)
    if (schema.maximum !== undefined) validator = validator.max(schema.maximum)
    return validator
  }
  if (schema.type === "array") {
    let validator = z.array(valueValidator(schema.items))
    if (schema.minItems !== undefined) validator = validator.min(schema.minItems)
    if (schema.maxItems !== undefined) validator = validator.max(schema.maxItems)
    return validator
  }
  if (schema.type !== "object") throw new Error("unsupported_value_schema")
  const properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) =>
    [key, schema.required.includes(key) ? valueValidator(value) : valueValidator(value).optional()]))
  return schema.additionalProperties ? z.object(properties).catchall(jsonValueSchema) : z.strictObject(properties)
}

/** 动态值也先验证 schema 版本；不能用类型断言跳过跨包校验。 */
export function parseTaskValue(rawContract: unknown, rawValue: unknown): JsonValue {
  const contract = taskDataContractSchema.parse(rawContract)
  return jsonValueSchema.parse(valueValidator(contract.schema).parse(jsonValueSchema.parse(rawValue)))
}

export function parseTaskOutput(rawContract: unknown, rawOutput: unknown): TaskOutput {
  const contract = taskDataContractSchema.parse(rawContract), output = taskOutputSchema.parse(rawOutput)
  if (output.contract.id !== contract.id || output.contract.version !== contract.version) throw new Error("output_contract_mismatch")
  // 产物内容在读取 artifact 时校验；此边界仅校验引用，不能冒充已经读取内容。
  return output.kind === "artifact" ? output : { ...output, value: parseTaskValue(contract, output.value) }
}
