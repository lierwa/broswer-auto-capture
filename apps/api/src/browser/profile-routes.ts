import type { FastifyInstance } from "fastify"
import { browserProfileCommandSchema } from "@browser-capture/contracts/browser-profile"
import type { BrowserProfileService } from "./profile-service.js"
import type { BrowserEnvironmentService } from "./environment-service.js"

/** WHY：沿用账号窗口合同；打开前释放空闲连接，关闭/核验不被该窗口自身的 busy 阻断。 */
export function mountBrowserProfile(app: FastifyInstance, service: BrowserProfileService,
  environment: BrowserEnvironmentService, assertWritable: () => void, assertAvailable: () => void) {
  app.get("/api/browser-profile", () => service.snapshot())
  app.post("/api/browser-profile", async request => {
    assertWritable(); environment.assertStable()
    const command = browserProfileCommandSchema.parse(request.body)
    const control = () => service.control(command, assertAvailable)
    if (command.type !== "open") return control()
    return environment.exclusive(async () => { await environment.disconnectIdle(); return control() })
  })
}
