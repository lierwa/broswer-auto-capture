import { createHash } from "node:crypto"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { expectedByScenario } from "./src/fixture-oracles.js"
import { scenarioIdSchema, scenarioObservedFactsSchema } from "./src/scenario-contract.js"

const reports = new Map<string, unknown>()

export default defineConfig(() => ({
  plugins: [react(), oraclePlugin()],
  server: { host: "127.0.0.1", strictPort: true },
}))

function oraclePlugin(): Plugin {
  const token = process.env.BAT_FIXTURE_TOKEN
  if (!token || token.length < 24) throw new Error("fixture_oracle_token_missing")
  return { name: "bat-fixture-oracle", configureServer(server) {
    server.middlewares.use("/__bat_fixture/report", (request, response) => {
      if (request.method !== "POST") return respond(response, 405, { error: "method_not_allowed" })
      const url = new URL(request.url ?? "", "http://fixture.invalid")
      const runId = url.searchParams.get("runId") ?? ""
      readJson(request).then((raw) => {
        const report = scenarioObservedFactsSchema.parse(raw)
        if (report.runId !== runId) throw new Error("fixture_run_mismatch")
        reports.set(runId, report)
        respond(response, 204, null)
      }).catch(() => respond(response, 400, { error: "invalid_fixture_report" }))
    })
    server.middlewares.use("/__bat_fixture/oracle", (request, response) => {
      if (request.method !== "GET") return respond(response, 405, { error: "method_not_allowed" })
      if (request.headers.authorization !== `Bearer ${token}`) return respond(response, 403, { error: "oracle_forbidden" })
      const url = new URL(request.url ?? "", "http://fixture.invalid")
      const runId = url.searchParams.get("runId") ?? ""
      const scenarioId = scenarioIdSchema.parse(url.searchParams.get("scenarioId"))
      const report = reports.get(runId)
      if (!report) return respond(response, 404, { error: "fixture_report_missing" })
      const value = scenarioObservedFactsSchema.parse(report)
      if (value.scenarioId !== scenarioId) return respond(response, 409, { error: "fixture_scenario_mismatch" })
      respond(response, 200, { ...value, runId: undefined, ...expectedByScenario[scenarioId],
        reportDigest: createHash("sha256").update(JSON.stringify(value)).digest("hex") })
    })
  } }
}

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

function respond(response: { statusCode: number; setHeader(name: string, value: string): void; end(value?: string): void },
  status: number, value: unknown) {
  response.statusCode = status
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.end(value === null ? undefined : JSON.stringify(value))
}
