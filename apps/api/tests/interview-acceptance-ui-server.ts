import path from "node:path"
import { fileURLToPath } from "node:url"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const directory = path.resolve(required("BROWSER_CAPTURE_TEST_DIRECTORY"))
const port = Number(required("BROWSER_CAPTURE_API_PORT"))
if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error(`UI acceptance requires Node 24, got ${process.versions.node}`)
if (!directory.startsWith(path.join(root, "work") + path.sep)) throw new Error("UI acceptance store must be under work")
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("UI acceptance API port is invalid")

const expected = parseModelSelection({
  connectionId: required("BROWSER_CAPTURE_EXPECTED_CONNECTION"),
  modelId: required("BROWSER_CAPTURE_EXPECTED_MODEL"),
  reasoningEffort: required("BROWSER_CAPTURE_EXPECTED_EFFORT"),
})
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const service = await createApplication({
  root,
  directory,
  ai,
  browserExecutor: async () => { throw new Error("interview_acceptance_browser_forbidden") },
  serveUi: false,
})
if (JSON.stringify(service.store.sharedModelSelection(SHARED_AI_SUBJECT)) !== JSON.stringify(expected)) {
  await service.app.close()
  throw new Error("isolated UI store model selection differs from the frozen selection")
}
await service.app.listen({ host: "127.0.0.1", port })
process.stdout.write(`${JSON.stringify({ ready: true, port, directory, node: process.versions.node })}\n`)

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, async () => {
  await service.app.close().catch(() => {})
  process.exit(0)
})

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
