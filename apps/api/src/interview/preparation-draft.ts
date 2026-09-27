import { resultSpecSchema, valueSchemaSchema, type ResultSpec, type ValueSchema } from "@browser-capture/contracts"

type DraftField = { name: string; description: string; schema: ValueSchema }

function section(markdown: string, heading: string) {
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gmu)]
    .filter((match) => match[1] === heading)
  if (matches.length !== 1) throw new Error(`preparation_draft_section_required:${heading}`)
  const start = matches[0]!.index! + matches[0]![0].length
  return markdown.slice(start).split(/^#{1,6}\s+/mu, 1)[0]!.trim()
}

function schemaFor(kind: string): ValueSchema {
  if (kind === "文本") return { type: "string" }
  if (kind === "整数") return { type: "integer" }
  if (kind === "数字") return { type: "number" }
  if (kind === "是或否") return { type: "boolean" }
  if (kind === "文本列表") return { type: "array", items: { type: "string" } }
  throw new Error("preparation_draft_field_type_invalid")
}

function fields(lines: string[]): DraftField[] {
  const values = lines.map((line) => {
    const match = /^-\s+(.+?)（(文本|整数|数字|是或否|文本列表)）：(.+)$/u.exec(line)
    if (!match) throw new Error("preparation_draft_field_invalid")
    const name = match[1]!.trim(), description = match[3]!.trim()
    if (!name || name.length > 200 || !description || description.length > 10_000
      || ["__proto__", "prototype", "constructor"].includes(name)) {
      throw new Error("preparation_draft_field_invalid")
    }
    return { name, description, schema: schemaFor(match[2]!) }
  })
  if (new Set(values.map((field) => field.name)).size !== values.length || values.length > 100) {
    throw new Error("preparation_draft_field_duplicate_or_excessive")
  }
  return values
}

function objectSchema(values: DraftField[]): ValueSchema {
  return valueSchemaSchema.parse({ type: "object", properties: Object.fromEntries(values.map((field) =>
    [field.name, field.schema])), required: values.map((field) => field.name), additionalProperties: false })
}

/** WHY：类型标记和字段均为同一可审阅 Markdown 草案的文字；宿主只做语法投影，不猜业务含义。 */
export function parsePreparationDraft(markdown: string) {
  const inputLines = section(markdown, "运行输入").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  if (!inputLines.length) throw new Error("preparation_draft_input_required")
  const inputFields = inputLines.length === 1 && inputLines[0] === "- 无" ? [] : fields(inputLines)
  const inputSchema: ValueSchema = inputFields.length ? objectSchema(inputFields) : { type: "null" }
  const representativeGoal = section(markdown, "代表试做")
  if (!representativeGoal || representativeGoal.length > 10_000) throw new Error("preparation_draft_trial_required")

  const resultBody = section(markdown, "结果与完成")
  const lines = resultBody.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  const delivery = lines.filter((line) => line.startsWith("- 交付："))
  if (delivery.length !== 1 || !["- 交付：完成状态", "- 交付：数据结果"].includes(delivery[0]!)) {
    throw new Error("preparation_draft_delivery_required")
  }
  const outputLines = lines.filter((line) => line.startsWith("- 字段："))
  if (delivery[0] === "- 交付：完成状态" && outputLines.length) {
    throw new Error("preparation_draft_delivery_field_mismatch")
  }
  if (delivery[0] === "- 交付：数据结果" && !outputLines.length) {
    throw new Error("preparation_draft_output_fields_required")
  }
  const shapeLines = lines.filter((line) => line.startsWith("- 结果形状："))
  // WHY：结果形状由用户确认的同版草案给出；缺项不能被 false 分支猜成单条记录。
  if (delivery[0] === "- 交付：数据结果" && !shapeLines.length) {
    throw new Error("preparation_draft_result_shape_required")
  }
  if (shapeLines.length > 1 || shapeLines.some((line) => !["- 结果形状：单条记录", "- 结果形状：记录列表"].includes(line))
    || delivery[0] === "- 交付：完成状态" && shapeLines.length) {
    throw new Error("preparation_draft_result_shape_invalid")
  }
  const browserDelivery = lines.filter((line) => line.startsWith("- 页面交付："))
  if (browserDelivery.length !== 1 || !["- 页面交付：保留现场", "- 页面交付：无需保留"].includes(browserDelivery[0]!)) {
    throw new Error("preparation_draft_browser_delivery_required")
  }
  // WHY：数据形状与交付活页面可以同时成立；这条同版标记仅表达用户确认的交付意图。
  const browserHandoff = browserDelivery[0] === "- 页面交付：保留现场" ? "keep_open" as const : "close" as const
  const outputFields = fields(outputLines.map((line) => line.replace("- 字段：", "- ")))
  // WHY：重复的成组记录必须共享同一个数组元素合同；平行字段数组会丢失同一项的字段关联。
  const recordList = shapeLines[0] === "- 结果形状：记录列表"
  const outputSchema: ValueSchema = outputFields.length
    ? recordList ? valueSchemaSchema.parse({ type: "array", items: objectSchema(outputFields) })
      : objectSchema(outputFields)
    : { type: "null" }
  const resultFields = recordList
    ? [{ path: [] as Array<string | number>, description: "逐项包含已声明字段的记录列表", producerRef: "records" }]
    : outputFields.map((field, index) => ({ path: [field.name], description: field.description,
      producerRef: `field${index + 1}` }))
  const resultSpec: ResultSpec = outputFields.length
    ? resultSpecSchema.parse({ contractVersion: "bat-result-spec/v1", mode: "data", schema: outputSchema,
      fields: resultFields, derivations: [], edgeCases: [] })
    : { contractVersion: "bat-result-spec/v1", mode: "execution" }
  const completion = lines.filter((line) => line !== delivery[0] && line !== browserDelivery[0]
    && !outputLines.includes(line) && !shapeLines.includes(line)).join("\n")
  if (!completion || completion.length > 10_000) throw new Error("preparation_draft_completion_required")
  return { inputSchema, outputSchema, resultSpec, representativeGoal, completion, browserHandoff }
}
