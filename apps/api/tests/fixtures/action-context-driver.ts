import assert from "node:assert/strict"
import type { ActionContextSite } from "./action-context-site.js"

export type ActionContextAcceptanceInput = ReturnType<typeof acceptanceInput>

type AgentRequest = {
  schema: { jsonSchema: { properties: Record<string, unknown> } }
  messages: unknown[]
  onEvent(event: unknown): void
}

type Step = Readonly<{
  id: string
  action(text: string): Record<string, unknown>
}>

export function acceptanceInput(site: ActionContextSite) {
  const value = "typed?value=1#kept"
  return {
    startUrl: site.startUrl,
    alternateHitUrl: site.url("/cases/hit?shape=b#alternate-fragment"),
    shadowUrl: site.url("/cases/shadow?state=open-closed#shadow-fragment"),
    framesUrl: site.url("/cases/frames?state=initial#frames-fragment"),
    secondaryUrl: site.secondaryOrigin + "/frames/cross?document=a#cross-a",
    navigationUrl: site.url("/cases/navigation?state=remove#navigation-fragment"),
    scrollUrl: site.url("/cases/scroll?state=top#scroll-fragment"),
    selectUrl: site.url("/cases/select?state=ground#select-fragment"),
    dialogUrl: site.url("/cases/dialog?state=closed#dialog-fragment"),
    popupUrl: site.url("/cases/popup?state=opener#popup-fragment"),
    popupChildUrl: site.url("/cases/popup-child?from=opener#child"),
    finalUrl: site.url("/cases/final?state=repeat#final-fragment"),
    value,
    duplicateValue: value,
  }
}

export function inputSchema() {
  const keys = ["startUrl", "alternateHitUrl", "shadowUrl", "framesUrl", "secondaryUrl",
    "navigationUrl", "scrollUrl", "selectUrl", "dialogUrl", "popupUrl", "popupChildUrl",
    "finalUrl", "value", "duplicateValue"]
  const properties = Object.fromEntries(keys.map((key) => [key, { type: "string" as const }]))
  return { type: "object" as const, properties, required: keys, additionalProperties: false }
}

export function requirement(input: ActionContextAcceptanceInput) {
  return `# Action-context conformance

Use the controls on ${input.startUrl}, ${input.alternateHitUrl}, ${input.shadowUrl}, and ${input.framesUrl}.
Use Navigate Now on ${input.navigationUrl}, then enter the exact input and press Enter. On ${input.scrollUrl},
scroll both the page and the named container. Read and choose Air Express on ${input.selectUrl}. On
${input.dialogUrl}, exercise confirm, prompt, and the HTML modal. On ${input.popupUrl}, open the child tab,
switch between opener and child, use the child action, and close only the child. Finally use ${input.finalUrl}
twice and retain the failed third attempt as a separate action. Return status complete.`
}

export const formalSemantics = {
  requirementTitle: "验证浏览器原生动作族、上下文与业务副作用的通用关联",
  planSummary: "在 DOM、滚动、下拉、dialog、标签页和文档边界中保存可复核的动作参数、结果与上下文",
  stepTitle: "执行动作上下文能力矩阵",
  stepGoal: "用真实动作覆盖事件型、滚动型、选择型、弹窗型、标签页型和文档切换型边界",
  authorizationScope: "仅访问本次输入中的本地验收页面，并执行需求列出的可恢复交互",
} as const

export function scriptedSubject(input: ActionContextAcceptanceInput) {
  const steps = acceptanceSteps(input)
  let cursor = 0
  const failures: string[] = [], calls: unknown[] = []
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false }
  const subject = {
    async verifyCapabilities() {},
    async generate() { throw new Error("fixture_text_call_unexpected") },
    async generateObject(request: AgentRequest) {
      request.onEvent({ type: "generation.started" })
      const properties = request.schema.jsonSchema.properties
      let object: unknown
      if ("verdict" in properties) object = { verdict: true, reasoning: "External oracle owns acceptance" }
      else if ("status" in properties && !("action" in properties)) object = { status: "complete" }
      else if ("action" in properties) {
        const text = lastBrowserStateText(request.messages)
        const step = steps[cursor]
        if (!step) throw new Error("fixture_agent_did_not_finish")
        const action = step.action(text)
        calls.push({ stepId: step.id, action, observed: text.split("\n").filter((line) => /\[\d+\]/.test(line)),
          tabs: availableTabs(text), promptTail: text.slice(-4000) })
        if (containsUndefined(action)) {
          failures.push(`missing_runtime_identity:${step.id}`)
          throw new Error(`fixture_runtime_identity_missing:${step.id}`)
        }
        cursor += 1
        object = { evaluation_previous_goal: "Controlled", memory: step.id,
          next_goal: step.id, action: [action] }
      } else throw new Error(`fixture_unknown_schema:${Object.keys(properties).join(",")}`)
      request.onEvent({ type: "generation.completed" })
      return { object, usage }
    },
  }
  return { subject, failures, calls, stepIds: steps.map((step) => step.id) }
}

function acceptanceSteps(input: ActionContextAcceptanceInput): Step[] {
  const target = (label: string) => (text: string) => indexedLine(text, label)
  const navigate = (id: string, url: string): Step => ({ id, action: () => ({ navigate: { url, new_tab: false } }) })
  const click = (id: string, label: string): Step => ({ id, action: (text) => ({ click: { index: target(label)(text) } }) })
  let repeatedIndex: number | undefined
  return [
    navigate("navigate-hit-a", input.startUrl), click("click-hit-a", "Variable Hit"),
    navigate("navigate-hit-b", input.alternateHitUrl), click("click-hit-b", "Variable Hit"),
    navigate("navigate-shadow", input.shadowUrl), click("click-shadow-open", "Open Shadow Action"),
    click("click-shadow-closed", "Closed Shadow Action"), navigate("navigate-frames", input.framesUrl),
    click("click-frame-a", "Same Frame Action"), click("click-frame-b", "Rebuilt Frame Action"),
    click("click-frame-cross", "Cross Frame Action"), navigate("navigate-removal", input.navigationUrl),
    click("click-navigate-now", "Navigate Now"),
    { id: "input-exact", action: (text) => ({ input: { index: target("Next Input")(text), text: input.value, clear: true } }) },
    { id: "send-enter", action: () => ({ send_keys: { keys: "Enter" } }) },
    navigate("navigate-scroll", input.scrollUrl),
    { id: "scroll-page", action: () => ({ scroll: { down: true, pages: 1 } }) },
    { id: "scroll-container", action: (text) => ({ scroll: {
      index: target("Scrollable Region")(text), down: true, pages: 1 } }) },
    navigate("navigate-select", input.selectUrl),
    { id: "read-dropdown-options", action: (text) => ({ dropdown_options: {
      index: target("Shipping Method")(text) } }) },
    { id: "select-air-express", action: (text) => ({ select_dropdown: {
      index: target("Shipping Method")(text), text: "Air Express" } }) },
    navigate("navigate-dialog", input.dialogUrl), click("confirm-dialog", "Open Confirm"),
    click("prompt-dialog", "Open Prompt"), click("open-html-modal", "Open Modal"),
    click("close-html-modal", "Close Modal"), navigate("navigate-popup", input.popupUrl),
    click("open-child-tab", "Open Child Tab"),
    { id: "switch-to-opener", action: (text) => ({ switch: { tab_id: tabIdForUrl(text, input.popupUrl) } }) },
    { id: "switch-to-child", action: (text) => ({ switch: { tab_id: tabIdForUrl(text, input.popupChildUrl) } }) },
    click("click-child-tab", "Child Tab Action"),
    { id: "close-child-tab", action: (text) => ({ close: { tab_id: currentTabId(text) } }) },
    navigate("navigate-final", input.finalUrl),
    { id: "repeat-final-1", action: (text) => ({ click: { index: repeatedIndex = target("Repeat Final")(text) } }) },
    { id: "repeat-final-2", action: () => ({ click: { index: repeatedIndex } }) },
    { id: "repeat-final-missing", action: () => ({ click: { index: repeatedIndex } }) },
    { id: "finish", action: () => ({ done: { success: true, data: { status: "complete" } } }) },
  ]
}

function indexedLine(text: string, label: string) {
  const line = text.split("\n").find((value) => /\[\d+\]/.test(value) && value.includes(label))
  return line ? Number(line.match(/\[(\d+)\]/)![1]) : undefined
}

function currentTabId(text: string) { return text.match(/Current tab:\s*([A-Za-z0-9]{4})/)?.[1] }

function tabIdForUrl(text: string, expectedUrl: string) {
  return availableTabs(text).find((tab) => tab.url === expectedUrl)?.id
}

function availableTabs(text: string) {
  return text.split("\n").flatMap((line) => {
    const match = line.match(/^Tab ([A-Za-z0-9]{4}):\s+(\S+)/)
    return match ? [{ id: match[1]!, url: match[2]! }] : []
  })
}

function lastBrowserStateText(messages: unknown[]) {
  const values = (messages as Array<{ role?: string; content?: unknown }>).filter((item) => item.role === "user")
    .map((message) => typeof message.content === "string" ? message.content
      : Array.isArray(message.content) ? message.content.flatMap((part) => part && typeof part === "object"
        && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string"
        ? [part.text] : []).join("\n") : "")
  return values.findLast((value) => value.includes("<browser_state>")) ?? values.at(-1) ?? ""
}

function containsUndefined(value: unknown): boolean {
  if (value === undefined) return true
  if (Array.isArray(value)) return value.some(containsUndefined)
  return Boolean(value && typeof value === "object" && Object.values(value).some(containsUndefined))
}

export function assertDecisionContextContract() {
  const browserState = `<browser_state>\nCurrent tab: a111\nAvailable tabs:\nTab a111: http://fixture.test/opener\nTab b222: http://fixture.test/child\nInteractive elements:\n[42]<button aria-label=Target Action />\n</browser_state>`
  const selected = lastBrowserStateText([{ role: "user", content: browserState },
    { role: "user", content: "PLANNING NUDGE: create a plan or finish." }])
  assert.equal(indexedLine(selected, "Target Action"), 42)
  assert.equal(currentTabId(selected), "a111")
  assert.equal(tabIdForUrl(selected, "http://fixture.test/child"), "b222")
}
