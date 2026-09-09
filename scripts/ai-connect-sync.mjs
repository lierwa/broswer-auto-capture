import { createHash } from "node:crypto"
import { access, copyFile, readFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const consumerRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const localConfigName = ".ai-connect.local.json"
const producerSyncPath = join("packages", "ai-connect", "scripts", "sync-local.mjs")
const releasePath = join("packages", "ai-connect", "artifacts", "release.json")
const packageNames = {
  core: "@agent-platform/ai-connect",
  react: "@agent-platform/ai-connect-react",
}
const requiredReactExports = [".", "./chat", "./styles.css"]

async function main() {
  const allowed = new Set(["--allow-dirty-declared-files"])
  const unknown = process.argv.slice(2).filter((argument) => !allowed.has(argument))
  if (unknown.length) throw new Error(`unknown AI Connect sync option: ${unknown.join(", ")}`)
  const allowDirtyDeclaredFiles = process.argv.includes("--allow-dirty-declared-files")
  const producerRoot = await resolveProducerRoot({ consumerRoot })
  const syncScript = join(producerRoot, producerSyncPath)
  const { syncLocalAIConnect } = await import(pathToFileURL(syncScript).href)
  if (typeof syncLocalAIConnect !== "function") throw new Error(`${syncScript} must export syncLocalAIConnect`)
  await syncLocalAIConnect({ consumerRoot, producerRoot, allowDirtyDeclaredFiles })
  const release = await verifyConsumerRelease({ consumerRoot, producerRoot })
  const vendor = await consumerVendorDirectory(consumerRoot)
  await copyFile(join(producerRoot, releasePath), join(vendor, "release.json"))
  console.log(`AI Connect ${release.packages.core.version} synchronized from ${producerRoot}`)
  console.log(`producer ${release.producer.head}${release.producer.dirty ? " (dirty source snapshot)" : ""}`)
  console.log(`core ${release.packages.core.sha256}`)
  console.log(`react ${release.packages.react.sha256}`)
}

export async function resolveProducerRoot({ consumerRoot, env = process.env }) {
  const environment = env.AI_CONNECT_PRODUCER_ROOT
  if (environment !== undefined) return validateProducerRoot(environment, "AI_CONNECT_PRODUCER_ROOT")
  const configPath = resolve(consumerRoot, localConfigName)
  const config = await readOptionalConfig(configPath)
  if (config !== null) {
    if (typeof config.opencodeRoot !== "string") {
      throw new Error(`${localConfigName} must contain an absolute opencodeRoot path`)
    }
    return validateProducerRoot(config.opencodeRoot, localConfigName)
  }
  return validateProducerRoot(resolve(consumerRoot, "..", "opencode"), "sibling opencode checkout")
}

async function validateProducerRoot(value, source) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error(`${source} must be an absolute path`)
  const root = resolve(value)
  try {
    await access(join(root, producerSyncPath))
  } catch {
    throw new Error(`${source} does not contain an AI Connect producer checkout: ${root}`)
  }
  return root
}

async function readOptionalConfig(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null
    if (error instanceof SyntaxError) throw new Error(`${localConfigName} is not valid JSON`)
    throw error
  }
}

export async function verifyConsumerRelease({ consumerRoot, producerRoot }) {
  const release = JSON.parse(await readFile(join(producerRoot, releasePath), "utf8"))
  validateReleaseManifest(release)
  const vendor = await consumerVendorDirectory(consumerRoot)
  for (const kind of Object.keys(packageNames)) {
    const metadata = release.packages[kind]
    const actual = await sha256(join(vendor, metadata.file))
    if (actual !== metadata.sha256) throw new Error(`ai_connect_sync_hash_mismatch:${kind}`)
  }
  await verifyConsumerManifests(consumerRoot, release)
  return release
}

export function validateReleaseManifest(release) {
  if (release?.schemaVersion !== 1 || typeof release.producer?.head !== "string"
    || !/^[0-9a-f]{40}$/u.test(release.producer.head) || typeof release.producer.dirty !== "boolean") {
    throw new Error("ai_connect_sync_release_invalid:producer")
  }
  if (!Array.isArray(release.build) || !release.build.every((item) => typeof item?.name === "string"
    && /^[0-9a-f]{64}$/u.test(item.sourceHash))
    || !Object.values(packageNames).every((name) => release.build.some((item) => item.name === name))) {
    throw new Error("ai_connect_sync_release_invalid:build")
  }
  for (const [kind, name] of Object.entries(packageNames)) {
    const metadata = release.packages?.[kind]
    if (!metadata || metadata.name !== name || typeof metadata.version !== "string" || !metadata.version
      || typeof metadata.file !== "string" || metadata.file !== release[kind]
      || metadata.file.includes("/") || metadata.file.includes("\\")
      || !/^[0-9a-f]{64}$/u.test(metadata.sha256)
      || !Array.isArray(metadata.exports) || !Array.isArray(metadata.styles)) {
      throw new Error(`ai_connect_sync_release_invalid:${kind}`)
    }
  }
  if (!requiredReactExports.every((entry) => release.packages.react.exports.includes(entry))
    || !release.packages.react.styles.includes("./styles.css")) {
    throw new Error("ai_connect_sync_release_invalid:react_surface")
  }
}

async function consumerVendorDirectory(root) {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  if (typeof manifest.aiConnect?.vendorDirectory !== "string") throw new Error("ai_connect_sync_config_invalid")
  return resolve(root, manifest.aiConnect.vendorDirectory)
}

async function verifyConsumerManifests(root, release) {
  const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  const vendor = resolve(root, rootManifest.aiConnect.vendorDirectory)
  for (const [kind, name] of Object.entries(packageNames)) {
    const files = rootManifest.aiConnect.manifests?.[name]
    if (!Array.isArray(files) || files.length === 0) throw new Error(`ai_connect_sync_config_invalid:${kind}`)
    for (const file of files) {
      const path = join(root, file)
      const manifest = JSON.parse(await readFile(path, "utf8"))
      const expected = `file:${relative(dirname(path), join(vendor, release.packages[kind].file)).split(sep).join("/")}`
      if (manifest.dependencies?.[name] !== expected) throw new Error(`ai_connect_sync_dependency_mismatch:${file}`)
    }
  }
  const lockText = await readFile(join(root, "package-lock.json"), "utf8")
  for (const kind of Object.keys(packageNames)) {
    if (!lockText.includes(release.packages[kind].file)) throw new Error(`ai_connect_sync_lock_mismatch:${kind}`)
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
