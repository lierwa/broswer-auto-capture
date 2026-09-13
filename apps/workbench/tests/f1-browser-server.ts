// 隔离 UI 验收专用替身；生产入口没有该模型开关。
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { createApplication } from "../../api/src/app.js"
import { testAIModel } from "../../api/tests/fixtures/ai-model.js"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const directory = process.env.BROWSER_CAPTURE_TEST_DIRECTORY
if (!directory || !path.resolve(directory).startsWith(path.join(root, "work") + path.sep)) throw new Error("必须使用 work 下隔离测试目录")
let calls = 0
const failures = new Set<string>()
let currentUserText = ""
const application = await createApplication({ root, directory, serveUi: true, aiModel: testAIModel(async function* (prompt, _schema, signal) {
  calls += 1
  const text = currentUserText
  yield { type: "commentary_delta", delta: "正在整理这次验收需求。" }
  await delay(text.includes("慢轮次") ? 20_000 : 700, undefined, { signal })
  if (text.includes("失败轮次") && !failures.has(text)) { failures.add(text); throw new Error("注入失败") }
  const question = text.includes("开放问题")
    ? { prompt: "希望怎样确定品牌或品类范围？", options: [
      { label: "直接补充具体范围", description: "按你随后提供的名称形成明确范围。", recommended: true },
      { label: "先做有限调查", description: "先核验候选范围，再回访确认。", recommended: false },
    ] }
    : text.includes("先提问") ? { prompt: "希望覆盖多少条？", options: [{ label: "前 20 条", description: "先验证小范围", recommended: true }, { label: "前 100 条", description: "覆盖更多样本", recommended: false }] } : null
  const outputText = question ? `请确认最影响结果的范围。\n\n${panel(question.prompt, question.options)}`
    : `已整理本次需求范围。\n\n<authoring><interview-markdown title="F1 验收需求"># 任务目标\n\n形成可核验的浏览器任务结果。\n\n# 已知上下文与运行输入\n\n${xml(text)}\n\n# 范围与约束\n\n只处理用户确认的公开范围，不绕过登录、验证码或访问限制。\n\n# 期望结果与步骤依赖\n\n先调查入口与页面能力，再生成和验证可复用链路。\n\n# 可观察完成标准\n\n结果、来源关联和未完成缺口均已保存。\n\n# 现场调查\n\n后续任务计划核验入口、页面结构与访问条件。\n\n# 执行权限与确认点\n\n草稿确认不授权浏览器运行，正式执行需独立授权。</interview-markdown></authoring>`
  yield { type: "turn_succeeded", outputText }
}, undefined, undefined, undefined, (input) => {
  currentUserText = input.messages.filter((message) => message.role === "user").at(-1)?.content[0]?.text ?? ""
}) })
await application.app.listen({ host: "127.0.0.1", port: 4174 })
process.stdout.write("F1 UI fixture ready on 4174; no real model calls\n")
process.once("SIGINT", () => { void application.app.close() })
process.once("SIGTERM", () => { void application.app.close() })

function panel(prompt: string, options: Array<{ label: string; description: string; recommended: boolean }>) {
  return `<authoring><question-panel mode="choice" prompt="${attribute(prompt)}">${options.map((option, index) =>
    `<question-option slot="${index + 1}" label="${attribute(option.label)}"${option.recommended ? ' recommended="true"' : ""}>${xml(option.description)}</question-option>`).join("")}</question-panel></authoring>`
}
function attribute(value: string) { return xml(value).replaceAll('"', "&quot;") }
function xml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") }
