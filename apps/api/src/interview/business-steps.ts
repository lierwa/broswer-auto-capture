import { z } from "zod"

const stepSchema = z.object({
  title: z.string().trim().min(1).max(200), goal: z.string().trim().min(1).max(10_000),
  input: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("task"), path: z.array(z.string().min(1)) }),
    z.object({ kind: z.literal("step"), step: z.number().int().positive() }),
  ]),
  execution: z.enum(["一次执行", "逐项执行"]),
  output: z.enum(["完成状态", "入口集合", "页面内容", "最终结果"]),
})
export type DraftBusinessStep = z.infer<typeof stepSchema>

/** WHY：只解析同版草案明确声明的步骤，不按网站、关键词或结果数组替模型拆任务。 */
export function parseBusinessSteps(markdown: string): DraftBusinessStep[] | undefined {
  const headings = [...markdown.matchAll(/^##\s+任务步骤\s*$/gmu)]
  if (!headings.length) return undefined // 仅供已确认历史草案读取。
  if (headings.length !== 1) throw Error("preparation_steps_section_duplicate")
  const body = markdown.slice(headings[0]!.index! + headings[0]![0].length).split(/^##\s+/mu, 1)[0]!.trim()
  const titles = [...body.matchAll(/^([1-9][0-9]*)\.\s+(.+)$/gmu)]
  if (!titles.length || titles.length > 100) throw Error("preparation_steps_required")
  return titles.map((title, index) => {
    if (Number(title[1]) !== index + 1) throw Error("preparation_steps_order_invalid")
    const block = body.slice(title.index! + title[0].length, titles[index + 1]?.index).trim()
    const markers = [...block.matchAll(/^- (输入|执行|产出|目标)：(.*)$/gmu)]
    const fields = new Map(markers.map(marker => [marker[1]!, marker[2]!.trim()]))
    if (markers.length !== 4 || fields.size !== 4 || markers.at(-1)?.[1] !== "目标") {
      throw Error("preparation_step_fields_invalid")
    }
    const target = markers.at(-1)!
    const goal = block.slice(target.index! + "- 目标：".length).trim()
    const input = parseInput(fields.get("输入")!, index)
    return stepSchema.parse({ title: title[2], goal, input, execution: fields.get("执行"), output: fields.get("产出") })
  })
}

function parseInput(value: string, position: number): DraftBusinessStep["input"] {
  if (value === "任务输入") return { kind: "task", path: [] }
  if (value.startsWith("任务输入.")) {
    const path = value.slice(5).split(".")
    if (path.some(key => !key || ["__proto__", "prototype", "constructor"].includes(key))) {
      throw Error("preparation_step_input_invalid")
    }
    return { kind: "task", path }
  }
  const reference = /^步骤 ([1-9][0-9]*) 的结果$/u.exec(value)
  if (!reference || Number(reference[1]) > position) throw Error("preparation_step_input_reference_invalid")
  return { kind: "step", step: Number(reference[1]) }
}

export function businessResultSource(lines: string[], steps: DraftBusinessStep[]) {
  const markers = lines.filter(line => line.startsWith("- 结果来源："))
  if (!markers.length) return steps.length - 1
  const match = /^- 结果来源：步骤 ([1-9][0-9]*)$/u.exec(markers[0]!)
  if (markers.length !== 1 || !match || Number(match[1]) > steps.length) {
    throw Error("preparation_result_source_invalid")
  }
  return Number(match[1]) - 1
}
