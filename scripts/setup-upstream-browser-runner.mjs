import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const installRoot = path.resolve(process.env.BAT_UPSTREAM_INSTALL_DIR ?? path.join(projectRoot, "work", "upstream-browser-runner"))
const sourceRoot = path.join(installRoot, "source")
const workflowsRoot = path.join(sourceRoot, "workflows")
const python = path.join(workflowsRoot, ".venv", "bin", "python")
const ruff = path.join(workflowsRoot, ".venv", "bin", "ruff")
const manifestPath = path.join(installRoot, ".bat-upstream.json")
const upstream = {
  repository: "https://github.com/browser-use/workflow-use",
  commit: "5d2d19fe8835cc86f1bf3e04302a5000d590f249",
  workflowUseVersion: "0.2.11",
  browserUseVersion: "0.13.8",
  mcpVersion: "1.29.1",
}
const patches = [
  ["0001-escape-workflow-prompt-variable-placeholders.patch", "b41b21da09efbe13e1082f8a722f10446ccbe4d4575349e9e65b38e24178fd06"],
  ["0002-dispatch-page-extraction-steps.patch", "a196162065e6c80fca300bb1952caf3c44591f1c177151e41c3d77028158c585"],
]

await main()

async function main() {
  verifyTool("curl", ["--version"])
  verifyTool("tar", ["--version"])
  verifyTool("git", ["--version"])
  verifyTool("uv", ["--version"])
  if (existsSync(manifestPath)) {
    await verifyInstalled()
    console.log(`workflow-use runner ready: ${python}`)
    return
  }
  if (existsSync(installRoot)) throw new Error(`unmanaged_upstream_install:${installRoot}`)

  const parent = path.dirname(installRoot)
  const staging = path.join(parent, `.workflow-use-source-${process.pid}`)
  const archive = path.join(parent, `.workflow-use-${process.pid}.tar.gz`)
  let createdInstall = false
  await mkdir(parent, { recursive: true })
  try {
    await mkdir(staging)
    run("curl", ["-fsSL", `${upstream.repository}/archive/${upstream.commit}.tar.gz`, "-o", archive])
    run("tar", ["-xzf", archive, "-C", staging, "--strip-components=1"])
    await verifyPatchFiles()
    for (const [name] of patches) {
      const patch = path.join(projectRoot, "patches", "workflow-use", name)
      const isolatedGit = { GIT_CEILING_DIRECTORIES: parent }
      run("git", ["apply", "--check", patch], staging, isolatedGit)
      run("git", ["apply", patch], staging, isolatedGit)
    }
    assertPatchOutputs(staging)
    await mkdir(installRoot)
    createdInstall = true
    await rename(staging, sourceRoot)
    run("uv", ["sync", "--frozen", "--python", "3.12"], workflowsRoot)
    await runFocusedChecks()
    await writeFile(manifestPath, JSON.stringify({ ...upstream,
      patches: Object.fromEntries(patches), installedAt: new Date().toISOString() }, null, 2) + "\n")
    await verifyInstalled()
    console.log(`workflow-use runner ready: ${python}`)
  } catch (error) {
    if (createdInstall) await rm(installRoot, { recursive: true, force: true })
    throw error
  } finally {
    await rm(staging, { recursive: true, force: true })
    await rm(archive, { force: true })
  }
}

async function verifyInstalled() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  for (const [key, value] of Object.entries(upstream)) {
    if (manifest[key] !== value) throw new Error(`upstream_manifest_mismatch:${key}`)
  }
  await verifyPatchFiles()
  for (const [name, hash] of patches) {
    if (manifest.patches?.[name] !== hash) throw new Error(`upstream_manifest_patch_mismatch:${name}`)
    run("git", ["apply", "--reverse", "--check", path.join(projectRoot, "patches", "workflow-use", name)], sourceRoot,
      { GIT_CEILING_DIRECTORIES: path.dirname(sourceRoot) })
  }
  assertPatchOutputs(sourceRoot)
  if (!existsSync(python)) throw new Error("upstream_python_missing")
  const versions = JSON.parse(runCapture(python, ["-c",
    "import importlib.metadata as m,json,platform;print(json.dumps({'python':platform.python_version(),'workflow-use':m.version('workflow-use'),'browser-use':m.version('browser-use'),'mcp':m.version('mcp')}))"], workflowsRoot))
  if (!String(versions.python).startsWith("3.12.")) throw new Error("upstream_python_version_mismatch")
  if (versions["workflow-use"] !== upstream.workflowUseVersion
    || versions["browser-use"] !== upstream.browserUseVersion
    || versions.mcp !== upstream.mcpVersion) throw new Error(`upstream_dependency_version_mismatch:${JSON.stringify(versions)}`)
}

async function verifyPatchFiles() {
  for (const [name, expected] of patches) {
    const content = await readFile(path.join(projectRoot, "patches", "workflow-use", name))
    const actual = createHash("sha256").update(content).digest("hex")
    if (actual !== expected) throw new Error(`upstream_patch_hash_mismatch:${name}`)
  }
}

async function runFocusedChecks() {
  run(python, ["workflow_use/healing/tests/test_workflow_creation_prompt.py", "-v"], workflowsRoot)
  run(python, ["tests/test_semantic_executor_page_extraction.py", "-v"], workflowsRoot, {
      BROWSER_USE_CONFIG_DIR: path.join(installRoot, "test-browser-use-config"),
  })
  run(ruff, ["check", "workflow_use/healing/tests/test_workflow_creation_prompt.py",
    "workflow_use/workflow/semantic_executor.py", "tests/test_semantic_executor_page_extraction.py"], workflowsRoot)
}

function assertPatchOutputs(root) {
  const outputs = [
    "workflows/workflow_use/healing/tests/test_workflow_creation_prompt.py",
    "workflows/tests/test_semantic_executor_page_extraction.py",
  ]
  for (const output of outputs) if (!existsSync(path.join(root, output))) throw new Error(`upstream_patch_output_missing:${output}`)
}

function verifyTool(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" })
  if (result.status !== 0) throw new Error(`required_tool_missing:${command}`)
}

function run(command, args, cwd = projectRoot, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit" })
  if (result.status !== 0) throw new Error(`command_failed:${command}:${result.status ?? "signal"}`)
}

function runCapture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: process.env, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`command_failed:${command}:${result.stderr || result.status}`)
  return result.stdout.trim()
}
