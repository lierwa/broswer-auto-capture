import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const consumerRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const localConfigPath = resolve(consumerRoot, ".ai-connect.local.json")

async function main() {
  const config = JSON.parse(await readFile(localConfigPath, "utf8"))
  if (typeof config?.opencodeRoot !== "string" || !isAbsolute(config.opencodeRoot)) {
    throw new Error(`${localConfigPath} must contain an absolute opencodeRoot path`)
  }

  const producerRoot = config.opencodeRoot
  const syncScript = join(producerRoot, "packages", "ai-connect", "scripts", "sync-local.mjs")
  const { syncLocalAIConnect } = await import(pathToFileURL(syncScript).href)
  if (typeof syncLocalAIConnect !== "function") {
    throw new Error(`${syncScript} must export syncLocalAIConnect`)
  }
  await syncLocalAIConnect({ consumerRoot, producerRoot })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
