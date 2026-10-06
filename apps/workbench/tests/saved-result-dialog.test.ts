import assert from "node:assert/strict"
import test from "node:test"
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { ChainNode, TaskDataContract, TaskOutput } from "@browser-capture/contracts"
import { SavedResultBody, callOutputContracts } from "../src/SavedResultDialog.js"
import { PageContentValue } from "../src/PageContentValue.js"
import { pageContentSchema } from "@browser-capture/contracts"

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
  const dialog = SavedResultBody({ scope: "call", outputContract: contracts,
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

test("图文产物只显示转义原文与保存的图片，失配合同不冒充完整图文", () => {
  const content = { format: "bat-page-content/v1", url: "javascript:alert(1)",
    html: "<script>window.unsafe=true</script>", markdown: "<script>unsafe</script>", textPreview: "原始参数",
    images: [{ url: "https://example.com/image.png", mediaType: "image/png", encoding: "base64", body: "AA==" }],
    coverage: { scope: "selected_live_region", imageCount: 1, complete: true } }
  const markup = renderToStaticMarkup(createElement(PageContentValue, { value: JSON.stringify(content) }))
  assert.match(markup, /原始参数/)
  assert.match(markup, /data:image\/png;base64,AA==/)
  assert.match(markup, /下载完整图文/)
  assert.doesNotMatch(markup, /<script|href="javascript:/)
  content.coverage.imageCount = 2
  assert.equal(pageContentSchema.safeParse(content).success, false)
  const invalid = renderToStaticMarkup(createElement(PageContentValue, { value: JSON.stringify(content) }))
  assert.doesNotMatch(invalid, /saved-page-content|<img/)
  assert.equal(renderToStaticMarkup(createElement(PageContentValue, { value: "原普通字符串" })), "<p>原普通字符串</p>")
})

function findBody(node: ReactNode): ReactElement | undefined {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return undefined
  if (node.props.className === "saved-result-body") return node
  return Children.toArray(node.props.children).map(findBody).find(Boolean)
}
