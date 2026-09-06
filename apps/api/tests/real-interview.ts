// 显式真实模型验收入口，不属于 npm test。只创建 work 下隔离任务，不执行浏览器抓取。
import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createApplication } from "../src/app.js"

if (!process.argv.includes("--real")) throw new Error("真实模型验收需要显式 --real")
const root = fileURLToPath(new URL("../../../", import.meta.url))
const directory = path.join(root, "work", `interview-quality-${Date.now()}`)
await mkdir(directory, { recursive: true })
const service = await createApplication({ root, directory })
const headers = { host: "127.0.0.1:4175" }
const cases = [
  { name: "brand", inputs: ["收集京东上海尔品牌官方旗舰店的全部冰箱商品，系统自己查找店铺和商品入口。需要商品名称、型号、价格、完整参数配置、商品链接，每个商品页面默认排序的前20条评论；不足20条保留实际数量并说明。只保存公开文本，不下载图片。",
    "纠正一下，品牌改成美的，评论改成每商品前30条，其他保持。请直接更新草稿。"] },
  { name: "open", inputs: ["收集某个旗舰店的冰箱商品和评价，保留商品链接。", "京东海尔官方旗舰店的全部冰箱。商品要名称、型号、价格、参数配置和链接；评价先每商品前20条，页面默认排序，不足就注明。店铺和商品入口你自己找。"] },
  { name: "category", inputs: ["我要收集冰箱门类的数据：京东上知名品牌官方旗舰店的全部冰箱，商品名称、型号、参数配置、价格、商品链接和每商品前20条评论。品牌有哪些、店铺和分类入口你自己去发现；‘知名’怎么筛选你提出可核验的合理口径，供我审阅。不要为了省事缩减成几个商品样本。"] },
  { name: "library", inputs: ["收集中国大陆各省会城市和直辖市的市级公共图书馆信息：名称、地址、开放时间、官网链接，分馆也包括。来源你自己找，优先政府和图书馆官网。全部城市都覆盖，找不到的明确记录缺口，暂时只要公开文字。"] },
]
const selected = process.argv.find((argument) => argument.startsWith("--case="))?.slice(7)
if (selected && !cases.some((scenario) => scenario.name === selected)) throw new Error("未知验收场景")
try {
  for (const scenario of cases.filter((scenario) => !selected || scenario.name === selected)) {
    const created = await service.app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "create", requestId: randomUUID() } })
    const id = created.json<{ id: string }>().id
    for (const input of scenario.inputs) {
      const revision = service.store.snapshot(id).revision
      const sent = await service.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers,
        payload: { type: "message", requestId: randomUUID(), expectedRevision: revision, text: input } })
      if (sent.statusCode !== 202) throw new Error(`API command failed: ${sent.statusCode}`)
      await service.coordinator.waitForIdle()
      const state = service.store.snapshot(id)
      await writeFile(path.join(directory, `${scenario.name}-${state.revision}.json`), JSON.stringify({ taskId: id, state }, null, 2))
      process.stdout.write(JSON.stringify({ case: scenario.name, taskId: id, revision: state.revision, status: state.turns.at(-1)?.status,
        question: state.messages.at(-1)?.question, brief: state.drafts.at(-1)?.brief, audits: state.audits }) + "\n")
      if (state.turns.at(-1)?.status !== "succeeded") throw new Error("真实轮次未成功；隔离记录已保留")
    }
  }
} finally { await service.app.close(); process.stdout.write(`EVIDENCE ${directory}\n`) }
