import path from "node:path"
import { Readable } from "node:stream"
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify"
import fastifyStatic from "@fastify/static"
import { z } from "zod"
import { createAI, localStore, parseModelSelection, type AI } from "@agent-platform/ai-connect/server"
import { mountAI } from "@agent-platform/ai-connect/fastify"
import { interviewCommandSchema } from "@browser-capture/contracts/interview"
import { taskChainCommandSchema } from "@browser-capture/contracts"
import { taskCommandSchema, taskDeleteCommandSchema, taskIdSchema } from "@browser-capture/contracts/task"
import { ProductStore } from "./database/store.js"
import { importLegacy } from "./database/importLegacy.js"
import { InterviewCoordinator } from "./interview/coordinator.js"
import { loadInterviewSkill } from "./interview/protocol.js"
import { DomainError } from "./errors.js"
import { BrowserService } from "./browser/service.js"
import { BrowserError, bskExecutor, type CommandExecutor } from "@browser-capture/browser"
import { createAIModelProvider, requireAgentSessionSelection, type AIModelProvider } from "./ai/model.js"
import { TaskChainService } from "./task-chain/service.js"
import type { RuntimeCapabilityFactory } from "./task-chain/runtime-host.js"
import { OriginAccessGate } from "./browser/origin-access-gate.js"
import { BrowserProfileService } from "./browser/profile-service.js"
import { PythonUpstreamBrowserRuntime, type UpstreamBrowserRuntime } from "./upstream-browser/service.js"
import { TaskDeletionService } from "./task-deletion.js"

export const SHARED_AI_SUBJECT = "browser-capture-local-user"
export interface AppOptions { root: string; directory: string; ai?: AI; aiModel?: AIModelProvider;
  taskChainCapabilities?: RuntimeCapabilityFactory; browserExecutor?: CommandExecutor; serveUi?: boolean;
  originAccessGate?: OriginAccessGate; upstreamBrowserRuntime?: UpstreamBrowserRuntime;
  developmentIdentity?: { pid: number; root: string; stop?: () => void } }
export async function createApplication(options: AppOptions) {
  const store = await ProductStore.open(options.directory)
  try { await importLegacy(store, options.directory); store.recoverInterrupted() }
  catch (error) { await store.close(); throw error }
  let ai: AI
  try { ai = options.ai ?? await createAI({ storage: localStore({ directory: path.join(options.directory, "ai-connect") }),
    onAccountRemoved: (subjectId, connectionId) => store.clearSharedModelSelection(subjectId, connectionId),
  }) }
  catch (error) { await store.close(); throw error }
  const aiModel = options.aiModel ?? createAIModelProvider(ai, store, SHARED_AI_SUBJECT, {
    cwd: options.root,
    stateDir: path.join(options.directory, "pi-agent-session"),
  })
  const coordinator = new InterviewCoordinator(store, aiModel, loadInterviewSkill(options.root))
  let browser: BrowserService
  try { browser = new BrowserService(store, options.directory, options.browserExecutor ?? bskExecutor(options.root),
    options.originAccessGate ?? (options.browserExecutor ? undefined : new OriginAccessGate(store))) }
  catch (error) { ai.close(); await store.close(); throw error }
  let taskChain: TaskChainService
  try {
    const upstream = options.upstreamBrowserRuntime ?? new PythonUpstreamBrowserRuntime({ root: options.root,
      directory: options.directory, subject: ai.forSubject(SHARED_AI_SUBJECT) })
    taskChain = new TaskChainService(store, browser, aiModel, upstream, options.taskChainCapabilities)
  }
  catch (error) { await browser.close(); await coordinator.close(); ai.close(); await store.close(); throw error }
  const browserProfile = new BrowserProfileService(options.root, options.directory)
  const deletion = new TaskDeletionService(store, coordinator, browser, browserProfile, taskChain, options.directory)
  const app = Fastify({ logger: false, bodyLimit: 100_000, requestTimeout: 15_000 })
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host ?? ""
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || (request.headers.origin && request.headers.origin !== `http://${host}`)) {
      return reply.code(403).send({ error: "仅允许本机同源访问。", code: "forbidden_origin" })
    }
    // WHY：账号与模型调用会使用本机凭据；浏览器必须提供同源 Fetch Metadata，不能沿用允许无 Origin 的 CLI 读取边界。
    if (sensitiveAIPath(request.method, request.url) && request.headers["sec-fetch-site"] !== "same-origin") {
      return reply.code(403).send({ error: "模型账号仅允许由当前工作台访问。", code: "forbidden_ai_origin" })
    }
    reply.header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
  })
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) return reply.code(error.status).send({ error: error.message, code: error.code })
    if (error instanceof BrowserError) return reply.code(409).send({ error: "浏览器操作未完成，请读取当前状态。", code: error.code })
    const status = publicStatus(error)
    return reply.code(status).send({ error: status < 500 ? "请求无效，请读取最新状态后重试。" : "本地服务未完成操作，请检查服务后恢复。", code: status < 500 ? "invalid_request" : "internal_error" })
  })
  routes(app, coordinator, browser, browserProfile, taskChain, deletion, store, ai, options.developmentIdentity)
  await mountAI(app, { ai, resolveSubject: () => SHARED_AI_SUBJECT })
  app.addHook("preClose", async () => { await browserProfile.shutdown(); await taskChain.close(); await browser.close(); await coordinator.close() })
  app.addHook("onClose", async () => { ai.close(); await store.close() })
  try {
    if (options.serveUi) {
      await app.register(fastifyStatic, { root: path.join(options.root, "apps", "workbench", "dist") })
      app.setNotFoundHandler((request, reply) => request.method === "GET" && !request.url.startsWith("/api/")
        ? reply.sendFile("index.html") : reply.code(404).send({ error: "页面或接口不存在。", code: "not_found" }))
    }
    await app.ready()
    return { app, coordinator, store, browser, browserProfile, taskChain }
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
const executionEventsQuery = taskQuery.extend({ executionId: z.uuid(),
  after: z.coerce.number().int().nonnegative().default(0) })
const taskHistoryQuery = taskQuery.extend({ kind: z.enum(["releases", "executions"]),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20) })
function routes(app: FastifyInstance, coordinator: InterviewCoordinator, browser: BrowserService,
  browserProfile: BrowserProfileService, taskChain: TaskChainService, deletion: TaskDeletionService,
  store: ProductStore, ai: AI,
  developmentIdentity?: { pid: number; root: string; stop?: () => void }) {
  app.get("/api/health", () => ({ service: "browser-capture-api", version: 1,
    ...(developmentIdentity ? { development: { pid: developmentIdentity.pid, root: developmentIdentity.root } } : {}) }))
  if (developmentIdentity) app.post("/api/dev/shutdown", (request) => {
    const command = developmentShutdownSchema.parse(request.body)
    if (command.pid !== developmentIdentity.pid || !samePath(command.root, developmentIdentity.root)) {
      throw new DomainError("development_instance_changed", "开发服务身份已变化，拒绝停止。", 409)
    }
    const timer = setTimeout(() => developmentIdentity.stop?.(), 25)
    timer.unref()
    return { stopping: true }
  })
  app.get("/api/model-settings", () => ({ selection: store.sharedModelSelection(SHARED_AI_SUBJECT) ?? null }))
  app.put("/api/model-settings", async (request) => {
    const body = modelSettingsBody.parse(request.body)
    try {
      const selection = parseModelSelection(body.selection)
      await requireAgentSessionSelection(ai, SHARED_AI_SUBJECT, selection)
      return { selection: store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection) }
    } catch (error) {
      if (error instanceof Error && error.message === "model_account_execution_surface_unsupported") {
        throw new DomainError("model_account_execution_surface_unsupported", "这个账号连接不能用于 Agent 会话，请重新连接账号。", 409)
      }
      throw new DomainError("invalid_model_selection", "模型选择无效，请重新选择账号和模型。", 400)
    }
  })
  app.get("/api/browser-profile", () => browserProfile.snapshot())
  app.post("/api/browser-profile", async (request) => {
    deletion.assertWritable()
    return browserProfile.control(request.body, () => {
      if (browser.owner() || taskChain.isAnyActive()) {
        throw new DomainError("browser_busy", "当前任务正在使用浏览器，请完成或停止后再管理账号。", 409)
      }
    })
  })
  app.get("/api/tasks", () => taskChain.projectTasks(coordinator.list()))
  app.post("/api/tasks", (request) => {
    const command = taskCommandSchema.parse(request.body)
    if (command.type !== "create") deletion.assertWritable()
    if (command.type === "archive" && command.archived && (browser.isActive(command.id) || taskChain.isActive(command.id))) throw new DomainError("browser_busy", "请先停止计划或授权运行，再归档任务。", 409)
    const id = coordinator.taskAction(command)
    return { id, tasks: taskChain.projectTasks(coordinator.list()) }
  })
  app.delete("/api/tasks", async (request) => {
    const command = taskDeleteCommandSchema.parse(request.body)
    const id = await deletion.delete(command)
    return { id, tasks: taskChain.projectTasks(coordinator.list()) }
  })
  app.get("/api/interview", (request) => coordinator.snapshot(taskQuery.parse(request.query).taskId))
  app.get("/api/browser", (request) => browser.snapshot(taskQuery.parse(request.query).taskId))
  app.post("/api/browser", (request) => {
    deletion.assertWritable()
    return browser.control(taskQuery.parse(request.query).taskId, request.body)
  })
  app.get("/api/task-chain", (request) => taskChain.snapshot(taskQuery.parse(request.query).taskId))
  app.post("/api/task-chain", async (request, reply) => {
    deletion.assertWritable()
    const command = taskChainCommandSchema.parse(request.body)
    if (browserProfile.isBusy() && !["cancel_authoring", "cancel_execution"].includes(command.type)) {
      throw new DomainError("browser_profile_busy", "请先在浏览器账号设置中完成操作并关闭专用浏览器。", 409)
    }
    return reply.code(202).send(await taskChain.dispatchAsync(taskQuery.parse(request.query).taskId, command))
  })
  app.post("/api/task-chain/handoff", async (request) => {
    deletion.assertWritable()
    return taskChain.controlBrowserHandoff(taskQuery.parse(request.query).taskId, request.body)
  })
  app.get("/api/task-chain/events", (request) => {
    const query = executionEventsQuery.parse(request.query)
    return taskChain.executionEvents(query.taskId, query.executionId, query.after)
  })
  app.get("/api/task-chain/history", (request) => {
    const query = taskHistoryQuery.parse(request.query)
    return taskChain.history(query.taskId, query.kind, query.offset, query.limit)
  })
  app.get("/api/task-chain/diagnostics", (request) => {
    return taskChain.diagnostics(taskQuery.parse(request.query).taskId)
  })
  app.get("/api/task-chain/artifact", (request) => {
    const query = artifactQuery.parse(request.query); return taskChain.repository.artifact(query.taskId, query.artifactId)
  })
  app.post("/api/interview", (request, reply) => {
    deletion.assertWritable()
    const id = taskQuery.parse(request.query).taskId, command = interviewCommandSchema.parse(request.body)
    const state = coordinator.dispatch(id, command)
    if (command.type === "confirm") taskChain.snapshot(id)
    return reply.code(command.type === "message" || command.type === "retry" ? 202 : 200).send({ taskId: id, state })
  })
  app.get("/api/interview/events", (request, reply) => {
    const { taskId, after } = eventsQuery.parse(request.query)
    coordinator.snapshot(taskId)
    return stream(reply, coordinator, taskId, after)
  })
}
const modelSettingsBody = z.object({ selection: z.unknown() }).strict()
const developmentShutdownSchema = z.object({ pid: z.number().int().positive(), root: z.string().min(1) }).strict()
const artifactQuery = taskQuery.extend({ artifactId: z.string().uuid() })
function sensitiveAIPath(method: string, url: string) {
  const pathName = url.split("?", 1)[0]
  return pathName === "/api/model-settings" || pathName === "/api/browser-profile"
    || pathName?.startsWith("/api/browser-profile/")
    || pathName === "/api/ai" || pathName?.startsWith("/api/ai/")
    || method === "POST" && (pathName === "/api/task-chain" || pathName === "/api/task-chain/handoff")
    || method === "DELETE" && pathName === "/api/tasks"
}
function samePath(left: string, right: string) {
  const normalize = (value: string) => path.resolve(value).replaceAll("\\", "/").toLowerCase()
  return normalize(left) === normalize(right)
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
