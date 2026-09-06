// 隔离 UI 验收专用替身；生产入口没有该模型开关。
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { createApplication } from "../../api/src/app.js"
import type { CodexAppServerClient } from "@browser-capture/model-runtime"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const directory = process.env.BROWSER_CAPTURE_TEST_DIRECTORY
if (!directory || !path.resolve(directory).startsWith(path.join(root, "work") + path.sep)) throw new Error("必须使用 work 下隔离测试目录")
let calls = 0
const failures = new Set<string>()
const brief = {
  goal: "形成可核验的公开商品资料",
  scope: "用户说明范围内的在售商品与评价",
  sourceStrategy: { mode: "discover" as const, scope: "由系统发现并核验适合的公开来源入口", providedUrls: [] },
  deliverables: [{ entity: "商品与评价", fields: ["品牌", "型号", "价格", "评价内容"], coverage: "用户确认范围内可核验的数据", limit: "以用户指定数量和来源实际边界为准" }],
  discoveryTasks: [{ objective: "发现并核验来源", expectedOutput: "候选入口、字段证据与覆盖缺口", acceptance: "来源可访问且能支撑所需字段" }],
  completionCriteria: ["数据可追溯到公开来源", "覆盖与缺口均有明确说明"],
  constraints: ["不绕过登录、验证码或访问限制"],
  proposedDefaults: ["优先核验官方或旗舰店入口"],
}
const application = await createApplication({ root, directory, serveUi: true, modelFactory: async () => {
  const client: CodexAppServerClient = {
    readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => {},
    async *runTurn(prompt, _schema, signal) {
      calls += 1
      const conversation = JSON.parse(prompt.split("\n\n").at(-1)!).conversation as Array<{ role: string; text: string }>
      const text = conversation.findLast((message) => message.role === "user")!.text
      yield { type: "commentary_delta", delta: "正在整理这次验收需求。", threadId: "fixture", turnId: `fixture-${calls}` }
      await delay(text.includes("慢轮次") ? 20_000 : 700, undefined, { signal })
      if (text.includes("失败轮次") && !failures.has(text)) { failures.add(text); throw new Error("注入失败") }
      const question = text.includes("开放问题")
        ? { prompt: "希望优先覆盖哪些品牌或品类范围？", options: [] }
        : text.includes("先提问") ? { prompt: "希望覆盖多少条？", options: [{ label: "前 20 条", description: "先验证小范围", recommended: true }, { label: "前 100 条", description: "覆盖更多样本", recommended: false }] } : null
      yield { type: "turn_succeeded", threadId: "fixture", turnId: `fixture-${calls}`, audit: { invocationCount: 1, requestedModel: "gpt-5.6-terra", requestedEffort: "medium", reportedModel: "gpt-5.6-terra", reportedEffort: "medium" },
        outputText: JSON.stringify({ assistantText: "已整理本次需求范围。", question, draft: question ? null : { title: "F1 验收需求", brief } }),
      }
    },
  }
  return { client, dispose: () => client.close() }
} })
await application.app.listen({ host: "127.0.0.1", port: 4174 })
process.stdout.write("F1 UI fixture ready on 4174; no real model calls\n")
process.once("SIGINT", () => { void application.app.close() })
process.once("SIGTERM", () => { void application.app.close() })
