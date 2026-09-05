import { randomUUID } from "node:crypto"
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { InterviewService } from "./interviewService.js"
import { currentDraft, type InterviewRequest } from "../src/interviewContract.js"
import { taskIdSchema, taskMetaSchema, type TaskAction, type TaskMeta, type TaskSummary } from "../src/taskContract.js"

export class TaskService {
  private tasks: TaskMeta[] = []
  private services = new Map<string, InterviewService>()
  private writing: Promise<unknown> = Promise.resolve()
  private activeId: string | null = null
  constructor(private root: string, private storage: string, private factory = (directory: string) => new InterviewService(root, { storageDirectory: directory })) {}

  async restore() {
    try { this.tasks = z.array(taskMetaSchema).parse(JSON.parse(await readFile(path.join(this.storage, "tasks.json"), "utf8"))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      await this.migrateLegacy()
    }
    for (const task of this.tasks) {
      const service = this.factory(path.join(this.storage, "tasks", task.id))
      await service.restore()
      this.services.set(task.id, service)
    }
  }

  private async migrateLegacy() {
    const legacy = path.join(this.storage, "interview.json")
    try { await readFile(legacy, "utf8") }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error }
    const target = path.join(this.storage, "tasks", "legacy")
    await mkdir(target, { recursive: true })
    // WHY：旧单会话只复制，不删除或覆写原记录；迁移完成以 tasks.json 为标记。
    await copyFile(legacy, path.join(target, "interview.json"))
    this.tasks = [{ id: "legacy", title: "之前的需求", renamed: false, archived: false, updatedAt: new Date().toISOString() }]
    await this.persist()
  }

  get(id: string) {
    taskIdSchema.parse(id)
    const service = this.services.get(id)
    if (!service) throw new Error("任务不存在。")
    return service
  }

  list(): TaskSummary[] {
    return this.tasks.map((task) => {
      const state = this.get(task.id).state
      const status: TaskSummary["status"] = state.active ? "running" : state.confirmedVersion ? "confirmed"
        : ["failed", "cancelled"].includes(state.messages.at(-1)?.status ?? "") ? "failed"
        : currentDraft(state) ? "draft" : state.messages.length ? "answer" : "new"
      const suggested = state.drafts.at(-1)?.title ?? state.messages.find((message) => message.role === "user")?.text
      return { ...task, title: task.renamed ? task.title : (suggested?.slice(0, 80) || task.title), status, revision: state.revision }
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async action(action: TaskAction): Promise<string> {
    // WHY：列表元数据写入串行，防止快速新建/重命名互相覆盖同一原子文件。
    const operation = this.writing.then(() => this.apply(action))
    this.writing = operation.catch(() => {})
    return operation
  }

  private async apply(action: TaskAction) {
    if (action.type === "create") {
      const id = randomUUID()
      this.services.set(id, this.factory(path.join(this.storage, "tasks", id)))
      this.tasks.push({ id, title: "新需求", renamed: false, archived: false, updatedAt: new Date().toISOString() })
      await this.persist()
      return id
    }
    const task = this.tasks.find((item) => item.id === action.id)
    if (!task) throw new Error("任务不存在。")
    if (action.type === "archive" && this.get(task.id).state.active) throw new Error("请先停止或等待本轮完成，再归档任务。")
    if (action.type === "rename") { task.title = action.title; task.renamed = true }
    else task.archived = action.archived
    task.updatedAt = new Date().toISOString()
    await this.persist()
    return task.id
  }

  async *handle(id: string, request: InterviewRequest) {
    const service = this.get(id)
    if (this.tasks.find((task) => task.id === id)?.archived) throw new Error("请先恢复这个归档任务。")
    const invokesModel = request.type === "message" || request.type === "retry"
    if (invokesModel && this.activeId) throw new Error("另一轮需求正在处理，请等待完成；仍可切换任务查看与编辑。")
    if (invokesModel) this.activeId = id
    try { yield* service.handle(request) }
    finally {
      if (invokesModel) this.activeId = null
      if (request.type !== "cancel") {
        const task = this.tasks.find((item) => item.id === id)!
        task.updatedAt = new Date().toISOString()
        const operation = this.writing.then(() => this.persist())
        this.writing = operation.catch(() => {})
        await operation
      }
    }
  }

  private async persist() {
    await mkdir(this.storage, { recursive: true })
    const file = path.join(this.storage, "tasks.json")
    await writeFile(`${file}.tmp`, JSON.stringify(this.tasks), "utf8")
    await rename(`${file}.tmp`, file)
  }
  async close() { await Promise.all([...this.services.values()].map((service) => service.close())) }
}
