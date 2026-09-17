import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pinnedCommit, verifyForkSource } from "../vendor/workflow-use/verify-source.mjs"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = path.join(root, "vendor", "workflow-use", "workflows")
const environment = path.join(root, "work", "upstream-browser-hybrid", ".venv")
const python = path.join(environment, process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
const sourceDigest = await verifyForkSource(root)
// WHY: 环境直接消费受管 fork 与原始 frozen lock，来源由 vendor 清单校验。
await mkdir(path.dirname(environment), { recursive: true })
if (!process.argv.includes("--check")) {
  run("uv", ["sync", "--frozen", "--python", "3.12", "--project", source], { UV_PROJECT_ENVIRONMENT: environment })
}
if (!existsSync(python)) throw new Error("hybrid_python_missing:run_upstream_setup")
const versions = JSON.parse(run(python, ["-c", `import importlib.metadata as m,json,sys,workflow_use
print(json.dumps({'python':sys.version_info[:2],'browserUse':m.version('browser-use'),'cdpUse':m.version('cdp-use'),'workflowUse':m.version('workflow-use'),'mcp':m.version('mcp'),'tenacity':m.version('tenacity'),'source':workflow_use.__file__}))`],
  { PYTHONPATH: source, PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false", BROWSER_USE_SETUP_LOGGING: "false" }))
if (JSON.stringify(versions.python) !== "[3,12]" || versions.browserUse !== "0.13.8" || versions.cdpUse !== "1.4.5"
  || versions.workflowUse !== "0.2.11"
  || versions.mcp !== "1.29.1" || versions.tenacity !== "9.1.2"
  || path.resolve(versions.source) !== path.join(source, "workflow_use", "__init__.py")) {
  throw new Error("hybrid_runtime_version_or_source_mismatch")
}
const manifest = { mode: "workflow-use-hybrid/v2", commit: pinnedCommit, sourceDigest, versions }
const manifestPath = path.join(path.dirname(environment), "source.json")
if (!process.argv.includes("--check")) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
else {
  const recorded = JSON.parse(await readFile(manifestPath, "utf8"))
  if (recorded.sourceDigest !== sourceDigest || recorded.commit !== pinnedCommit) throw new Error("hybrid_installed_source_changed")
}
console.log(`workflow-use hybrid v2 ready; source ${sourceDigest}`)

function run(program, args, extra = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", env: { ...process.env, ...extra } })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`hybrid_setup_failed:${program}:${result.status}`)
  return result.stdout.trim()
}
