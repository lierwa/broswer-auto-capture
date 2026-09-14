// 显式真实 E1 入口，不属于 npm test；只接受自然语言目标、起始地址和业务输出合同。
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { taskDataContractSchema } from "@browser-capture/contracts"
import type { AIEvent } from "@browser-capture/contracts/ai"
import { createApplication } from "../src/app.js"
import type { PreexecutionArtifact } from "../src/task-chain/preexecution-trace.js"

const inputSchema = z.object({
  goal: z.string().trim().min(1).max(4000), startUrl: z.string().url(), outputContract: taskDataContractSchema,
  taskId: z.string().optional(), budget: z.object({ maxTransitions: z.number().int().positive(),
    maxBrowserCommands: z.number().int().positive(), maxActiveMs: z.number().int().min(1000),
    maxLlmCalls: z.number().int().positive(), maxInvocations: z.number().int().positive(), maxDepth: z.number().int().positive() }).strict().optional(),
}).strict()
// WHY：BrowserSession 的预算按底层 CLI 调用计数；一次 navigate/page 会展开为多次 tab/observe/read 调用。
// 真实单页验收需要给语义动作留出空间，同时仍由固定上限和活动时间硬终止失控探索。
const defaultBudget = { maxTransitions: 20, maxBrowserCommands: 100, maxActiveMs: 180_000,
  maxLlmCalls: 3, maxInvocations: 1, maxDepth: 2 }

if (!process.argv.includes("--real")) throw new Error("真实预执行需要显式 --real")
const inputPath = argument("--input")
if (!inputPath) throw new Error("真实预执行需要 --input=<json path>")
const root = fileURLToPath(new URL("../../../", import.meta.url))
const input = inputSchema.parse(JSON.parse(await readFile(path.resolve(inputPath), "utf8")))
const directory = path.resolve(process.env.BROWSER_CAPTURE_DATA_DIRECTORY ?? path.join(root, "data"))
const application = await createApplication({ root, directory })
const outputPath = path.resolve(argument("--out") ?? path.join(root, "work", "preexecution-poc", `e1-${Date.now()}.json`))
let artifact: PreexecutionArtifact | null = null
const aiEvents: Array<{ type: string; invocationId: string; sequence: number; extensionName?: string }> = []
let taskId = ""
try {
  taskId = selectTask(application, input.taskId)
  const requirementVersion = application.store.snapshot(taskId).confirmedVersion
  if (!requirementVersion) throw new Error("preexecution_confirmed_task_required")
  artifact = await application.taskChain.preexecuteBusinessOnly({ taskId, requirementVersion,
    goal: input.goal, startUrl: input.startUrl, outputContract: input.outputContract,
    budget: input.budget ?? defaultBudget, signal: new AbortController().signal,
    onArtifact: (value) => { artifact = value } }, (event) => aiEvents.push(eventSummary(event)))
} finally {
  await application.app.close()
  if (artifact) {
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, JSON.stringify({ taskId, artifact, aiEvents }, null, 2), "utf8")
  }
}
if (!artifact) throw new Error("preexecution_artifact_missing")
process.stdout.write(JSON.stringify({ taskId, runId: artifact.runId, browserRunId: artifact.browserRunId,
  status: artifact.status, finishAccepted: artifact.finishAccepted, output: artifact.output,
  outputDigest: artifact.outputDigest, modelRuns: artifact.modelRuns.length, browserEvents: artifact.browserEvents.length,
  outputWrites: artifact.outputWrites.length, feedback: artifact.feedback.length, closed: artifact.closed,
  artifactPath: outputPath }) + "\n")
if (artifact.status !== "completed" || !artifact.finishAccepted || !artifact.closed) process.exitCode = 1

function argument(name: string) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1)
}

function selectTask(application: Awaited<ReturnType<typeof createApplication>>, requested?: string) {
  if (requested) return requested
  const task = application.coordinator.list().find((candidate) => {
    const state = application.store.snapshot(candidate.id)
    return !candidate.archived && Boolean(state.confirmedVersion) && !state.active
      && !application.taskChain.isActive(candidate.id) && !application.browser.isActive(candidate.id)
  })
  if (!task) throw new Error("preexecution_confirmed_task_required")
  return task.id
}

function eventSummary(event: AIEvent) {
  return { type: event.type, invocationId: event.invocationId, sequence: event.sequence,
    ...(event.type === "extension" ? { extensionName: event.name } : {}) }
}
