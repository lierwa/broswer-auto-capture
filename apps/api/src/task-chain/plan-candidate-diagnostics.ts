import { z } from "zod"
import { valueSchemaSchema, type JsonValue, type ValueSchema } from "@browser-capture/contracts"

type CandidateIssue = { path: Array<string | number>; code: string; message: string }
const fieldSchema = z.object({ path: z.array(z.union([z.string(), z.number()])), producerRef: z.string() }).passthrough()
const specSchema = z.object({ fields: z.array(fieldSchema), schema: valueSchemaSchema }).passthrough()
const candidateSchema = z.object({ steps: z.array(z.object({ resultSpec: z.unknown() }).passthrough()) }).passthrough()

function startsWith(left: (string | number)[], right: (string | number)[]) {
  return left.length <= right.length && left.every((part, index) => part === right[index])
}

function pathText(path: (string | number)[]) {
  return path.map((part) => typeof part === "number" ? `[${part}]` : `.${part}`).join("").replace(/^\./, "")
}

function requiredGaps(schema: ValueSchema, paths: Array<Array<string | number>>,
  path: Array<string | number> = []): Array<Array<string | number>> {
  if (paths.some((owner) => startsWith(owner, path))) return []
  // WHY：数组第 0 项的值不能证明整个集合有来源；必填数组必须在集合路径拥有结果归属。
  if (schema.type !== "object") return [path]
  return schema.required.flatMap((name) => {
    const child = schema.properties[name]
    return child ? requiredGaps(child, paths, [...path, name]) : [[...path, name]]
  })
}

/** Add precise overlap and coverage facts to a persisted candidate's existing strict contract errors. */
export function explainPlanCandidateIssues(raw: JsonValue, issues: CandidateIssue[]): CandidateIssue[] {
  const candidate = candidateSchema.safeParse(raw)
  if (!candidate.success) return issues
  return issues.map((issue) => {
    const stepIndex = issue.path[0] === "steps" && typeof issue.path[1] === "number" ? issue.path[1] : -1
    const spec = specSchema.safeParse(candidate.data.steps[stepIndex]?.resultSpec)
    if (!spec.success) return issue
    const fields = spec.data.fields
    if (issue.code === "result_spec_path_conflict") {
      const fieldIndex = issue.path[2] === "resultSpec" && issue.path[3] === "fields"
        && typeof issue.path[4] === "number" ? issue.path[4] : -1
      const owner = fields[fieldIndex]
      if (!owner) return issue
      const overlaps = fields.filter((field, index) => index !== fieldIndex
        && (startsWith(field.path, owner.path) || startsWith(owner.path, field.path))).slice(0, 8)
      if (!overlaps.length) return issue
      return { ...issue, message: `结果归属冲突：${pathText(owner.path)} (${owner.producerRef}) 与 ${overlaps
        .map((field) => `${pathText(field.path)} (${field.producerRef})`).join("、")} 路径重叠；同一路径树只能有一个归属，输出 schema 字段仍须保留。` }
    }
    if (issue.code === "result_spec_required_path_missing") {
      const gaps = requiredGaps(spec.data.schema, fields.map((field) => field.path)).slice(0, 8)
      if (!gaps.length) return issue
      return { ...issue, message: `必填结果缺少完整归属：${gaps.map(pathText).join("、")}；数组元素的子路径不能代表整个集合。` }
    }
    return issue
  })
}
