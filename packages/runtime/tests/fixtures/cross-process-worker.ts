import { OrdinaryRunEngine } from "../../src/ordinary-run.js"

const [phase, sqlitePath, serializedRequest] = process.argv.slice(2)
if (!phase || !sqlitePath || !serializedRequest) throw new Error("缺少跨进程测试参数")
const request: unknown = JSON.parse(serializedRequest)
const engine = new OrdinaryRunEngine(sqlitePath, {
  adapter: { async execute(item, context) { return `${context.idempotencyKey}|${item.value}` } },
  async verifyResume() { return { ok: true, detail: "跨进程浏览器恢复 stub" } },
})

try {
  const result = phase === "start"
    ? await engine.start(request, { pauseAfterItems: 17 })
    : await engine.resume(request)
  process.stdout.write(`${JSON.stringify({
    status: result.audit.status,
    completed: result.audit.completedStableKeys.length,
    resumeVerified: result.audit.events.some((event) => event.type === "resume_verified"),
  })}\n`)
} finally {
  engine.close()
}
