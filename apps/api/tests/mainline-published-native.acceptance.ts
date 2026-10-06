// 复用真实生成的持久化草稿：重启应用后发布，再通过 run_task 运行；不生成或注入链路。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createAI, localStore } from "@agent-platform/ai-connect/server"
import { createApplication } from "../src/app.js"
import { releaseReference } from "../src/task-chain/workspace-projection.js"

if (process.env.BAT_RUN_MAINLINE_NATIVE !== "1") throw Error("explicit_native_acceptance_required")
const root = process.cwd(), directory = path.resolve(process.argv[2]!)
const saved = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8")) as { taskId: string }
const frozen = JSON.parse(await readFile(path.join(directory, "draft.json"), "utf8"))
const port = Number(new URL(frozen.content.plan.entryUrls[0]).port)
let redirects = 0
const server = createServer((req, res) => {
  const url = new URL(req.url!, `http://127.0.0.1:${port}`)
  if (process.env.BAT_REDIRECT_NATIVE === "1" && url.pathname.startsWith("/detail/") && !url.searchParams.has("view")) {
    redirects++; res.writeHead(302, { location: `${url.pathname}?view=summary` }); res.end(); return
  }
  res.setHeader("content-type", "text/html; charset=utf-8")
  const index = Number(url.pathname.split("/").at(-1))
  res.end(req.url?.startsWith("/detail/")
    ? `<title>详情 ${index}</title><h1>记录 ${index}</h1><p class="size">规格 ${index}</p>${index === 2 ? "" : `<p class="price">${index * 10}</p>`}`
    : `<title>已按序排列的记录目录</title><h1>记录目录</h1><p>以下记录已经按名次排序。</p>${[1, 2].map(i => `<article class="row"><a class="name" href="/detail/${i}">记录 ${i}</a></article>`).join("")}`)
})
await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const api = await createApplication({ root, directory, ai })
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
try {
  const draft = api.taskChain.repository.draft(saved.taskId)!
  api.taskChain.dispatch(saved.taskId, { type: "publish_task_draft", requestId: randomUUID(), draftId: draft.id,
    expectedRevision: draft.revision, expectedChecksum: draft.checksum })
  const release = api.taskChain.repository.currentRelease(saved.taskId)!
  const receipt = api.taskChain.dispatch(saved.taskId, { type: "run_task", requestId: randomUUID(),
    release: releaseReference(release), input: null }, true)
  await save("published-receipt.json", receipt)
  const deadline = Date.now() + 180_000
  while (api.taskChain.isAnyActive()) {
    if (Date.now() > deadline) throw Error("published_replay_timeout")
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const execution = api.taskChain.repository.executions(saved.taskId).at(-1)!
  const runs = api.taskChain.repository.runs(saved.taskId).filter(run => execution.steps.some(step => step.runIds.includes(run.binding.runId)))
  await save("published-replay.json", { release, execution, runs })
  assert.equal(execution.status, "completed", execution.reason ?? "published_replay_failed")
  const value = execution.output?.kind === "value" ? execution.output.value : null
  assert.ok(Array.isArray(value) && value.length === 2)
  assert.deepEqual(value.map(item => (item as Record<string, unknown>).规格), ["规格 1", "规格 2"])
  assert.ok(!Object.hasOwn(value[1] as object, "价格"))
  assert.ok(runs.length === 3 && runs.every(run => run.status === "completed" && run.modelCalls.length === 0))
  if (process.env.BAT_REDIRECT_NATIVE === "1") assert.equal(redirects, 2)
  console.log(JSON.stringify({ stage: "published-passed", executionId: execution.id, releaseId: release.id, ordinaryRuns: runs.length, modelCalls: 0 }))
} catch (error) {
  await save("published-failure.json", { error: error instanceof Error ? error.message : "unknown",
    executions: api.taskChain.repository.executions(saved.taskId) })
  throw error
} finally {
  await api.app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
}
