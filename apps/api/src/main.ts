import path from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { createApplication } from "./app.js"
import { DomainError } from "./errors.js"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const config = z.object({ port: z.coerce.number().int().min(1).max(65535), directory: z.string().min(1), serveUi: z.boolean() }).parse({
  port: process.env.BROWSER_CAPTURE_API_PORT ?? 4175,
  directory: process.env.BROWSER_CAPTURE_DATA_DIRECTORY ?? process.env.BROWSER_CAPTURE_INTERVIEW_DATA_DIRECTORY ?? path.join(root, "data"),
  serveUi: process.env.BROWSER_CAPTURE_SERVE_UI !== "false",
})
try {
  const application = await createApplication({ root, directory: path.resolve(config.directory), serveUi: config.serveUi })
  try {
    await application.app.listen({ host: "127.0.0.1", port: config.port })
    process.stdout.write(`浏览器工作台 API：http://127.0.0.1:${config.port}/\n`)
  } catch (error) { await application.app.close(); throw error }
  let closing = false
  const close = () => { if (closing) return; closing = true; void application.app.close().catch(() => { process.exitCode = 1 }) }
  process.once("SIGINT", close); process.once("SIGTERM", close)
} catch (error) {
  process.stderr.write(`${error instanceof DomainError ? error.message : (error as NodeJS.ErrnoException).code === "EADDRINUSE" ? "服务端口已被占用，请先关闭原服务或指定其他端口。" : "本地服务启动失败，旧记录未删除；请检查数据格式、依赖及配置。"}\n`)
  process.exitCode = 1
}
