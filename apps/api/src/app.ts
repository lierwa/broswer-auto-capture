import path from "node:path"
import { Readable } from "node:stream"
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify"
import fastifyStatic from "@fastify/static"
import { z } from "zod"
import { interviewCommandSchema } from "@browser-capture/contracts/interview"
import { taskCommandSchema, taskIdSchema } from "@browser-capture/contracts/task"
import { ProductStore } from "./database/store.js"
import { importLegacy } from "./database/importLegacy.js"
import { InterviewCoordinator } from "./interview/coordinator.js"
import { modelSessionFactory, type ModelSessionFactory } from "./interview/modelSession.js"
import { DomainError } from "./errors.js"
import { BrowserService } from "./browser/service.js"
import { BrowserError, bskExecutor, type CommandExecutor } from "@browser-capture/browser"
import { ResearchService } from "./research/service.js"
import { researchModelFactory } from "./research/model.js"
import { PlanService } from "./plan/service.js"
import type { PlanExecutor } from "./plan/queue.js"
import { ChainService } from "./chain/service.js"

export interface AppOptions { root: string; directory: string; modelFactory?: ModelSessionFactory; researchFactory?: ModelSessionFactory; planFactory?: ModelSessionFactory; explorationFactory?: ModelSessionFactory; llmFactory?: ModelSessionFactory; planExecutor?: PlanExecutor | null; browserExecutor?: CommandExecutor; serveUi?: boolean }
export async function createApplication(options: AppOptions) {
  const store = await ProductStore.open(options.directory)
  try { await importLegacy(store, options.directory); store.recoverInterrupted() }
  catch (error) { await store.close(); throw error }
  const coordinator = new InterviewCoordinator(store, options.modelFactory ?? modelSessionFactory(options.root))
  let browser: BrowserService
  try { browser = new BrowserService(store, options.directory, options.browserExecutor ?? bskExecutor(options.root)) }
  catch (error) { await store.close(); throw error }
  let research: ResearchService
  try { research = new ResearchService(store, browser, coordinator, options.researchFactory ?? researchModelFactory(options.root)) }
  catch (error) { await browser.close(); await coordinator.close(); await store.close(); throw error }
  let plan: PlanService
  let chain: ChainService
  try {
    chain = new ChainService(store, options.root, options.explorationFactory, options.llmFactory)
    plan = new PlanService(store, research, browser, options.planFactory ?? researchModelFactory(options.root), options.planExecutor === null ? undefined : options.planExecutor ?? chain.executeBatch)
  }
  catch (error) { await research.close(); await browser.close(); await coordinator.close(); await store.close(); throw error }
  const app = Fastify({ logger: false, bodyLimit: 100_000, requestTimeout: 15_000 })
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host ?? ""
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || (request.headers.origin && request.headers.origin !== `http://${host}`)) {
      return reply.code(403).send({ error: "仅允许本机同源访问。", code: "forbidden_origin" })
    }
    reply.header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
  })
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) return reply.code(error.status).send({ error: error.message, code: error.code })
    if (error instanceof BrowserError) return reply.code(409).send({ error: "浏览器操作未完成，请读取当前状态。", code: error.code })
    const status = publicStatus(error)
    return reply.code(status).send({ error: status < 500 ? "请求无效，请读取最新状态后重试。" : "本地服务未完成操作，请检查服务后恢复。", code: status < 500 ? "invalid_request" : "internal_error" })
  })
  routes(app, coordinator, browser, research, plan)
  app.get("/api/chains", (request) => { const { taskId } = taskQuery.parse(request.query); return chain.snapshot(taskId, plan.snapshot(taskId)) })
  app.addHook("preClose", async () => { await plan.close(); await research.close(); await browser.close(); await coordinator.close() })
  app.addHook("onClose", async () => { await store.close() })
  try {
    if (options.serveUi) {
      await app.register(fastifyStatic, { root: path.join(options.root, "apps", "workbench", "dist") })
      app.setNotFoundHandler((request, reply) => request.method === "GET" && !request.url.startsWith("/api/")
        ? reply.sendFile("index.html") : reply.code(404).send({ error: "页面或接口不存在。", code: "not_found" }))
    }
    await app.ready()
    return { app, coordinator, store, browser, research, plan, chain }
  } catch (error) { await app.close(); throw error }
}
function publicStatus(error: unknown) {
  if (error instanceof z.ZodError) return 400
  if (!error || typeof error !== "object" || !("statusCode" in error)) return 500
  const status = error.statusCode
  return typeof status === "number" && status >= 400 && status < 500 ? status : 500
}
const taskQuery = z.object({ taskId: taskIdSchema })
const eventsQuery = taskQuery.extend({ after: z.coerce.number().int().min(-1).default(-1) })
function routes(app: FastifyInstance, coordinator: InterviewCoordinator, browser: BrowserService, research: ResearchService, plan: PlanService) {
  app.get("/api/health", () => ({ service: "browser-capture-api", version: 1 }))
  app.get("/api/tasks", () => plan.projectTasks(coordinator.list()))
  app.post("/api/tasks", (request) => {
    const command = taskCommandSchema.parse(request.body)
    if (command.type === "archive" && command.archived && (browser.isActive(command.id) || research.isActive(command.id) || plan.isActive(command.id))) throw new DomainError("browser_busy", "请先停止计划或授权运行，再归档任务。", 409)
    const id = coordinator.taskAction(command)
    return { id, tasks: plan.projectTasks(coordinator.list()) }
  })
  app.get("/api/interview", (request) => coordinator.snapshot(taskQuery.parse(request.query).taskId))
  app.get("/api/browser", (request) => browser.snapshot(taskQuery.parse(request.query).taskId))
  app.post("/api/browser", (request) => browser.control(taskQuery.parse(request.query).taskId, request.body))
  app.get("/api/research", (request) => research.snapshot(taskQuery.parse(request.query).taskId))
  app.get("/api/plan", (request) => plan.snapshot(taskQuery.parse(request.query).taskId))
  app.post("/api/plan", (request, reply) => reply.code(202).send(plan.dispatch(taskQuery.parse(request.query).taskId, request.body)))
  app.post("/api/research", async (request, reply) => reply.code(202).send(await research.dispatch(taskQuery.parse(request.query).taskId, request.body)))
  app.post("/api/interview", (request, reply) => {
    const id = taskQuery.parse(request.query).taskId, command = interviewCommandSchema.parse(request.body)
    const state = coordinator.dispatch(id, command)
    return reply.code(command.type === "message" || command.type === "retry" ? 202 : 200).send({ taskId: id, state })
  })
  app.get("/api/interview/events", (request, reply) => {
    const { taskId, after } = eventsQuery.parse(request.query)
    coordinator.snapshot(taskId)
    return stream(reply, coordinator, taskId, after)
  })
}
function stream(reply: FastifyReply, coordinator: InterviewCoordinator, id: string, after: number) {
  const controller = new AbortController()
  reply.raw.once("close", () => controller.abort())
  async function* lines() {
    try { for await (const item of coordinator.observe(id, after, controller.signal)) yield `${JSON.stringify(item)}\n` }
    catch { yield `${JSON.stringify({ error: "状态连接中断，请重新连接恢复。", code: "stream_interrupted" })}\n` }
    finally { controller.abort() }
  }
  return reply.header("Content-Type", "application/x-ndjson; charset=utf-8").send(Readable.from(lines(), { objectMode: false }))
}
