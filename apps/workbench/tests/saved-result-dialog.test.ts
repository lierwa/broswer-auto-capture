import assert from "node:assert/strict"
import test from "node:test"
import { Children, isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { ChainNode, TaskDataContract, TaskOutput } from "@browser-capture/contracts"
import { SavedResultDialog, callOutputContracts } from "../src/SavedResultDialog.js"

const contract = (id: string, field: string): TaskDataContract => ({ id, version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: { [field]: { type: "string" } }, required: [field], additionalProperties: false } })
const intermediate = contract("intermediate", "note"), final = contract("final", "title")
const output = (schema: TaskDataContract, value: Record<string, string>): TaskOutput => ({
  kind: "value", contract: { id: schema.id, version: schema.version }, value,
})

test("同次调用的不同emit合同各自展示，未匹配历史合同仍折叠", () => {
  const contracts = callOutputContracts({ outputContract: final, nodes: [
    { id: "emit", kind: "emit", contract: intermediate },
    { id: "emit-final", kind: "emit", contract: final },
    { id: "end", kind: "terminal", result: { contract: final } },
  ] as ChainNode[] })
  const dialog = SavedResultDialog({ scope: "call", outputContract: contracts,
    result: { note: output(intermediate, { note: "中间已保存成果" }), final: output(final, { title: "最终已保存成果" }),
      unknown: output(contract("unavailable", "secretShape"), { secretShape: "不按未知合同解读" }) } })
  const body = findBody(dialog)
  assert.ok(body)
  const html = renderToStaticMarkup(body)
  assert.match(html, /<dt>note<\/dt><dd><span>中间已保存成果<\/span>/)
  assert.match(html, /<dt>title<\/dt><dd><span>最终已保存成果<\/span>/)
  assert.match(html, /本次历史运行未能精确绑定输出合同/)
  assert.doesNotMatch(html, /<dt>secretShape<\/dt>/)
})

function findBody(node: ReactNode): ReactElement | undefined {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return undefined
  if (node.props.className === "saved-result-body") return node
  return Children.toArray(node.props.children).map(findBody).find(Boolean)
}
