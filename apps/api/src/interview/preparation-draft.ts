import { resultSpecSchema, valueSchemaSchema, type ResultSpec, type ValueSchema } from "@browser-capture/contracts"
import { contentDelivery, executionIntent } from "./content-delivery.js"
import { businessResultSource, parseBusinessSteps, validateTaskStepInputs } from "./business-steps.js"
import { DraftValidationError, draftError, markerError, deliveryLines, resultShapeLines, browserDeliveryLines } from "./draft-validation.js"

type DraftField = { name: string; description: string; schema: ValueSchema; optional: boolean }

function section(markdown: string, heading: string) {
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gmu)]
    .filter((match) => match[1] === heading)
  if (matches.length !== 1) throw draftError(`preparation_draft_section_required:${heading}`, heading, "章节",
    `匹配到 ${matches.length} 个章节`, `有且只有一个独立二级标题：## ${heading}`)
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

function fields(lines: string[], heading: string): DraftField[] {
  const values = lines.map((line) => {
    const match = /^-\s+(.+?)（(文本|整数|数字|是或否|文本列表)(，可缺失)?）：(.+)$/u.exec(line)
    if (!match) throw draftError("preparation_draft_field_invalid", heading, "字段声明", line,
      "每个字段独立一行：- 字段名（文本|整数|数字|是或否|文本列表）：说明；结果字段以“- 字段：”开头。")
    const name = match[1]!.trim(), description = match[4]!.trim()
    if (!name || name.length > 200 || !description || description.length > 10_000
      || ["__proto__", "prototype", "constructor"].includes(name)) {
      throw draftError("preparation_draft_field_invalid", heading, "字段名称与说明", line,
        "名称1–200字、说明1–10000字；名称不得为__proto__、prototype或constructor。")
    }
    // WHY：兼容既有成稿的明确缺失后缀；这是字段声明的语法，不能按业务名猜可选性。
    const optional = !!match[3] || /[；;](?:缺失时|无法确认时)标记缺失[。.]*$/u.test(description)
    return { name, description, schema: schemaFor(match[2]!), optional }
  })
  if (new Set(values.map((field) => field.name)).size !== values.length || values.length > 100) {
    throw draftError("preparation_draft_field_duplicate_or_excessive", heading, "字段集合",
      `共 ${values.length} 个字段，去重后 ${new Set(values.map(field => field.name)).size} 个`, "字段名称唯一且不超过100个。")
  }
  return values
}

function objectSchema(values: DraftField[]): ValueSchema {
  return valueSchemaSchema.parse({ type: "object", properties: Object.fromEntries(values.map((field) =>
    [field.name, field.schema])), required: values.filter((field) => !field.optional).map((field) => field.name), additionalProperties: false })
}

/** WHY：类型标记和字段均为同一可审阅 Markdown 草案的文字；宿主只做语法投影，不猜业务含义。 */
export function parsePreparationDraft(markdown: string) {
  try { return parseDraft(markdown) }
  catch (error) { throw error instanceof DraftValidationError ? error.locate(markdown) : error }
}

function parseDraft(markdown: string) {
  const inputBody = section(markdown, "运行输入").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  // WHY：与结果章节相同，只投影明确的字段列表；说明保留在原草稿，不按语义猜成字段或丢弃业务约束。
  const declarations = inputBody.filter(line => line.startsWith("-"))
  const inputLines = declarations.length ? declarations : inputBody
  if (!inputLines.length) throw draftError("preparation_draft_input_required", "运行输入", "输入声明", "章节为空",
    "没有运行输入时独立写“- 无”；有输入时逐行声明已确定的字段。")
  const inputFields = inputLines.length === 1 && inputLines[0] === "- 无" ? [] : fields(inputLines, "运行输入")
  const inputSchema: ValueSchema = inputFields.length ? objectSchema(inputFields) : { type: "null" }
  const representativeGoal = section(markdown, "代表试做")
  if (!representativeGoal || representativeGoal.length > 10_000) throw draftError("preparation_draft_trial_required",
    "代表试做", "试做目标", `长度 ${representativeGoal.length}`, "1–10000字，说明已确认任务的代表试做目标。")

  const resultBody = section(markdown, "结果与完成")
  const lines = resultBody.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  const steps = parseBusinessSteps(markdown)
  validateTaskStepInputs(steps, inputSchema)
  const resultSource = steps ? businessResultSource(lines, steps) : undefined
  const delivery = lines.filter((line) => line.startsWith("- 交付："))
  if (delivery.length !== 1 || !deliveryLines.includes(delivery[0]!)) {
    throw markerError("preparation_draft_delivery_required", "交付", lines, deliveryLines)
  }
  const outputLines = lines.filter((line) => line.startsWith("- 字段："))
  const rawContent = delivery[0] === "- 交付：页面内容"
  const historicalIntent = executionIntent(lines)
  const intent = steps ? { ...historicalIntent, repeated: steps[resultSource!]!.execution === "逐项执行" } : historicalIntent
  if (delivery[0] !== "- 交付：数据结果" && outputLines.length) {
    throw draftError("preparation_draft_delivery_field_mismatch", "结果与完成", "交付与字段",
      `${delivery[0]}，另有 ${outputLines.length} 条字段`, "只有数据结果声明字段；完成状态和页面内容不得声明字段。")
  }
  if (delivery[0] === "- 交付：数据结果" && !outputLines.length) {
    throw draftError("preparation_draft_output_fields_required", "结果与完成", "结果字段", "数据结果没有字段声明",
      "逐行列出已确认字段：- 字段：字段名（文本|整数|数字|是或否|文本列表）：说明。不得编造字段。")
  }
  const shapeLines = lines.filter((line) => line.startsWith("- 结果形状："))
  // WHY：结果形状由用户确认的同版草案给出；缺项不能被 false 分支猜成单条记录。
  if (delivery[0] === "- 交付：数据结果" && !shapeLines.length) {
    throw markerError("preparation_draft_result_shape_required", "结果形状", lines, resultShapeLines)
  }
  if (shapeLines.length > 1 || shapeLines.some((line) => !resultShapeLines.includes(line))
    || delivery[0] !== "- 交付：数据结果" && shapeLines.length) {
    throw draftError("preparation_draft_result_shape_invalid", "结果与完成", "结果形状", shapeLines.join(" | "),
      `数据结果必须独立且仅一行：${resultShapeLines.join(" 或 ")}；其它交付方式不声明结果形状。`)
  }
  const browserDelivery = lines.filter((line) => line.startsWith("- 页面交付："))
  if (browserDelivery.length !== 1 || !browserDeliveryLines.includes(browserDelivery[0]!)) {
    throw markerError("preparation_draft_browser_delivery_required", "页面交付", lines, browserDeliveryLines)
  }
  // WHY：数据形状与交付活页面可以同时成立；这条同版标记仅表达用户确认的交付意图。
  const browserHandoff = browserDelivery[0] === "- 页面交付：保留现场" ? "keep_open" as const : "close" as const
  const outputFields = fields(outputLines.map((line) => line.replace("- 字段：", "- ")), "结果与完成")
  // WHY：重复的成组记录必须共享同一个数组元素合同；平行字段数组会丢失同一项的字段关联。
  const recordList = shapeLines[0] === "- 结果形状：记录列表"
  const quantityLines = lines.filter(line => line.startsWith("- 结果数量："))
  const quantity = quantityLines[0] && /^- 结果数量：最多 ([1-9][0-9]*) 条$/u.exec(quantityLines[0])
  const maximum = quantity ? Number(quantity[1]) : undefined
  if (quantityLines.length > 1 || quantityLines.length && (!(recordList || intent.repeated) || !quantity || !Number.isSafeInteger(maximum))) {
    throw draftError("preparation_draft_quantity_invalid", "结果与完成", "结果数量", quantityLines.join(" | "),
      "只在记录列表或逐项执行且已有确认数量时，独立且仅一行声明“- 结果数量：最多 N 条”；N为正的安全整数。")
  }
  const outputSchema: ValueSchema = rawContent ? contentDelivery(intent.repeated, maximum).outputSchema : outputFields.length
    ? recordList ? valueSchemaSchema.parse({ type: "array", items: objectSchema(outputFields),
      ...(maximum === undefined ? {} : { maxItems: maximum }) })
      : objectSchema(outputFields)
    : { type: "null" }
  const resultFields = recordList
    ? [{ path: [] as Array<string | number>, description: "逐项包含已声明字段的记录列表", producerRef: "records" }]
    : outputFields.map((field, index) => ({ path: [field.name], description: field.description,
      producerRef: `field${index + 1}` }))
  const resultSpec: ResultSpec = rawContent ? contentDelivery(intent.repeated, maximum).resultSpec : outputFields.length
    ? resultSpecSchema.parse({ contractVersion: "bat-result-spec/v1", mode: "data", schema: outputSchema,
      fields: resultFields, derivations: [], edgeCases: outputFields.some((field) => field.optional)
        ? [{ description: "已明确允许缺失的字段缺省；不得以零或伪造文本填充。", controlRef: "missing-fields" }] : [] })
    : { contractVersion: "bat-result-spec/v1", mode: "execution" }
  const completion = lines.filter((line) => line !== delivery[0] && line !== browserDelivery[0]
    && !outputLines.includes(line) && !shapeLines.includes(line) && !quantityLines.includes(line)
    && !intent.markers.includes(line) && !line.startsWith("- 结果来源：")).join("\n")
  if (!completion || completion.length > 10_000) throw draftError("preparation_draft_completion_required", "结果与完成",
    "完成标准", `去除字段标记后长度 ${completion.length}`, "保留1–10000字的可观察完成标准与不足处理说明。")
  return { inputSchema, outputSchema, resultSpec, representativeGoal, completion, browserHandoff,
    repeated: intent.repeated, selectionGoal: intent.selectionGoal, maximum, steps, resultSource }
}
