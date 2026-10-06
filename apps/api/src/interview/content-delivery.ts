import type { ResultSpec, ValueSchema } from "@browser-capture/contracts"
import { contentValueSchema, CONTENT_SOURCE } from "../upstream-browser/page-content-contract.js"

export function contentDelivery(repeated: boolean, maximum?: number) {
  const outputSchema: ValueSchema = repeated
    ? { type: "array", items: contentValueSchema, ...(maximum === undefined ? {} : { maxItems: maximum }) }
    : contentValueSchema
  const resultSpec: ResultSpec = { contractVersion: "bat-result-spec/v1", mode: "data", schema: outputSchema,
    fields: [{ path: [], description: "任务相关页面/区域的原始图文产物", producerRef: CONTENT_SOURCE }],
    derivations: [], edgeCases: [] }
  return { outputSchema, resultSpec }
}

export function executionIntent(lines: string[]) {
  const modes = lines.filter(line => line.startsWith("- 执行方式："))
  const selections = lines.filter(line => line.startsWith("- 来源选择："))
  if (modes.length > 1 || modes.some(line => !["- 执行方式：一次执行", "- 执行方式：逐项执行"].includes(line))) {
    throw new Error("preparation_execution_mode_invalid")
  }
  const repeated = modes[0] === "- 执行方式：逐项执行"
  if (selections.length > 1 || repeated && (selections.length !== 1 || !selections[0]!.slice(7).trim())
    || !repeated && selections.length) throw new Error("preparation_source_selection_required")
  return { repeated, selectionGoal: repeated ? selections[0]!.slice(7).trim() : null,
    markers: [...modes, ...selections] }
}
