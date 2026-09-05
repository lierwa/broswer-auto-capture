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
      const question = text.includes("先提问") ? { prompt: "希望覆盖多少条？", options: [{ label: "前 20 条", description: "先验证小范围", recommended: true }, { label: "前 100 条", description: "覆盖更多样本", recommended: false }] } : null
      yield { type: "turn_succeeded", threadId: "fixture", turnId: `fixture-${calls}`, audit: { invocationCount: 1, requestedModel: "fixture", requestedEffort: "fixture", reportedModel: "fixture", reportedEffort: "fixture" },
        outputText: JSON.stringify({ assistantText: "已整理本次需求范围。", question, draft: question ? null : { title: "F1 验收需求", markdown: "# 验收范围\n这是隔离模型替身产出的需求草稿。\n保留用户范围，后续调查真实来源。" } }),
      }
    },
  }
  return { client, dispose: () => client.close() }
} })
await application.app.listen({ host: "127.0.0.1", port: 4174 })
process.stdout.write("F1 UI fixture ready on 4174; no real model calls\n")
process.once("SIGINT", () => { void application.app.close() })
process.once("SIGTERM", () => { void application.app.close() })
