import type { FastifyInstance } from "fastify"
import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import { WebSocketServer } from "ws"
import { z } from "zod"
import type { DailyChromeExtension } from "./daily-extension.js"

const authentication = z.object({ event: z.literal("bat.authenticate"), payload: z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict() }).strict()

/** WHY：这是既有授权到原Playwright socket的薄入口；不解析/转换CDP，不拥有重连循环。 */
export async function mountDailyChromeBackground(app: FastifyInstance, extension: DailyChromeExtension) {
  const origin = `chrome-extension://${await extension.extensionIdentity()}`
  const server = new WebSocketServer({ noServer: true })
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url !== "/api/browser/daily-chrome/connection") return
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(request.headers.host ?? "") || request.headers.origin !== origin) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return
    }
    server.handleUpgrade(request, socket, head, client => {
      const timeout = setTimeout(() => client.close(1008, "authorization_required"), 5000)
      client.once("close", () => clearTimeout(timeout))
      client.on("error", () => {})
      client.once("message", (raw, binary) => {
        clearTimeout(timeout)
        let value: unknown
        try { if (!binary && raw.toString().length <= 1024) value = JSON.parse(raw.toString()) } catch {}
        const parsed = authentication.safeParse(value)
        if (!parsed?.success) { client.close(1008, "authorization_required"); return }
        void extension.attachBackground(client, parsed.data.payload.token).catch(error => {
          if (client.readyState === 1 && error instanceof Error && error.message === "daily_chrome_authorization_required")
            client.send(JSON.stringify({ event: "bat.authorization_required" }))
          client.close(1008, "connection_not_accepted")
        })
      })
    })
  }
  app.server.on("upgrade", upgrade)
  return async () => {
    app.server.off("upgrade", upgrade)
    for (const client of server.clients) client.close(1001, "Server stopped")
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
