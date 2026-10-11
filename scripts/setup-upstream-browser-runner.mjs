import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pinnedCommit, verifyForkSource } from "../vendor/workflow-use/verify-source.mjs"
import { verifyRequestBudget, verifyInstalledBudget, buildRequestBudget } from './request-budget.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = path.join(root, "vendor", "workflow-use", "workflows")
const environment = path.join(root, "work", "upstream-browser-hybrid", ".venv")
const python = path.join(environment, process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
const managedUv = path.join(root, "work", "tools", "uv", process.platform === "win32" ? "uv.exe" : "uv")
const uv = existsSync(managedUv) ? managedUv : "uv"
const uvEnvironment = {
  UV_PROJECT_ENVIRONMENT: environment,
  UV_CACHE_DIR: path.join(root, "work", "cache", "uv"),
  UV_PYTHON_INSTALL_DIR: path.join(root, "work", "tools", "uv-python"),
  UV_MANAGED_PYTHON: "1",
}
const sourceDigest = await verifyForkSource(root)
// WHY: 环境直接消费受管 fork 与原始 frozen lock，来源由 vendor 清单校验。
await mkdir(path.dirname(environment), { recursive: true })
if (!process.argv.includes("--check") && !process.argv.includes("--record-verified-source") && !process.argv.includes('--install-request-budget')) {
  run(uv, ["python", "install", "3.12"], uvEnvironment)
  const managedPython = run(uv, ["python", "find", "--managed-python", "3.12"], uvEnvironment)
  if (existsSync(environment) && !(await usesManagedPython(managedPython))) {
    await rm(environment, { recursive: true, force: true })
  }
  run(uv, ["sync", "--managed-python", "--frozen", "--python", "3.12", "--project", source], uvEnvironment)
  // WHY：账号适配依赖独立固定；不改上游frozen lock，sync之后安装防止被移除。
  run(python, ["-m", "ensurepip", "--upgrade"])
  run(python, ["-m", "pip", "install", "--no-cache-dir", "-r", path.join(root, "apps/api/python/account-requirements.txt")])
  run(python, ["-m", "pip", "install", "--no-deps", "--require-hashes", "-r", path.join(root, "apps/api/python/runtime-requirements.txt")])
}
if (!existsSync(python)) throw new Error("hybrid_python_missing:run_upstream_setup")
if (!process.argv.includes('--check') && !process.argv.includes('--record-verified-source')
  && !existsSync(path.join(root, 'tools/antibot-lab/shared/bat_request_budget-1.0.0-py3-none-any.whl'))) {
  // WHY：干净checkout不提交生成wheel；只按已冻结源码/制品摘要重建，check绝不登记绕过。
  await buildRequestBudget()
}
const sharedBudget = await verifyRequestBudget()
if (!process.argv.includes('--check') && !process.argv.includes('--record-verified-source')) {
  run(python, ['-m', 'pip', 'install', '--no-deps', '--no-index', sharedBudget.wheelPath])
}
const requestBudget = verifyInstalledBudget(python, sharedBudget)
if (run(python, ['-c', "import importlib.metadata as m;print(m.version('diskcache'))"]) !== '5.6.3') throw Error('access_state_dependency_mismatch')
if (run(python, ['-c', "import importlib.metadata as m;print(m.version('pyrate-limiter'))"]) !== '4.5.0') throw Error('access_quota_dependency_mismatch')
if (run(python, ['-c', "import importlib.metadata as m;print(m.version('filelock'))"]) !== '3.19.1') throw Error('access_quota_lock_dependency_mismatch')
if (run(python, ['-c', "import importlib.metadata as m;print(m.version('urllib3'))"]) !== '2.7.0') throw Error('retry_after_parser_dependency_mismatch')
await prepareAccountDriver()
if (!(await usesManagedPython())) throw new Error("hybrid_python_not_managed:run_upstream_setup")
const versions = JSON.parse(run(python, ["-c", `import importlib.metadata as m,json,sys,workflow_use
print(json.dumps({'python':sys.version_info[:2],'browserUse':m.version('browser-use'),'cdpUse':m.version('cdp-use'),'workflowUse':m.version('workflow-use'),'mcp':m.version('mcp'),'tenacity':m.version('tenacity'),'source':workflow_use.__file__}))`],
  { PYTHONPATH: source, PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false", BROWSER_USE_SETUP_LOGGING: "false" }))
if (JSON.stringify(versions.python) !== "[3,12]" || versions.browserUse !== "0.13.8" || versions.cdpUse !== "1.4.5"
  || versions.workflowUse !== "0.2.11"
  || versions.mcp !== "1.29.1" || versions.tenacity !== "9.1.2"
  || path.resolve(versions.source) !== path.join(source, "workflow_use", "__init__.py")) {
  throw new Error("hybrid_runtime_version_or_source_mismatch")
}
const manifest = { mode: "workflow-use-hybrid/v2", commit: pinnedCommit, sourceDigest, versions, requestBudget }
const accountVersions = JSON.parse(run(python, ["-c", "import importlib.metadata as m,json;print(json.dumps({k:m.version(k) for k in ['playwright','pyee','greenlet','xhshow','pycryptodome','tinycss2','webencodings']}))"]))
for (const [name, version] of Object.entries({ playwright: "1.61.0", pyee: "13.0.1", greenlet: "3.5.6", xhshow: "0.2.0", pycryptodome: "3.23.0", tinycss2: "1.4.0", webencodings: "0.5.1" })) {
  if (accountVersions[name] !== version) throw new Error(`account_runtime_version_mismatch:${name}`)
}
const manifestPath = path.join(path.dirname(environment), "source.json")
if (!process.argv.includes("--check")) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
else {
  const recorded = JSON.parse(await readFile(manifestPath, "utf8"))
  if (recorded.sourceDigest !== sourceDigest || recorded.commit !== pinnedCommit) throw new Error("hybrid_installed_source_changed")
  if (JSON.stringify(recorded.requestBudget) !== JSON.stringify(requestBudget)) throw Error('hybrid_shared_dependency_changed')
}
console.log(`workflow-use hybrid v2 ready; source ${sourceDigest}`)

async function prepareAccountDriver() {
  if (run(python, ['-c', "import importlib.metadata as m;print(m.version('patchright'))"]) !== '1.63.0') throw Error('account_driver_version_mismatch')
  const directory = run(python, ['-c', "import pathlib,patchright;print(pathlib.Path(patchright.__file__).parent)"])
  const file = path.join(directory, 'driver/package/lib/coreBundle.js')
  const source = await readFile(file), digest = value => createHash('sha256').update(value).digest('hex')
  const patchedSha = '38f9f625508e917ddac324d2a78a82c7c6f5aaff92b41ccb6aaa719dce07f886'
  if (digest(source) === patchedSha) return
  if (process.argv.includes('--check')) throw Error('account_driver_focus_patch_missing')
  if (digest(source) !== '34898aeefffcbe4f5b3c02d24cc510362fe401055ee26d40a95db91af5152c8d') throw Error('account_driver_source_changed')
  // WHY：固定Patchright f34b861的焦点补丁漏掉原Playwright no_defaults；只恢复原默认上下文保护。
  const before = 'if (this._isMainFrame() && !this._crPage._browserContext._options.focusControl)'
  if (source.toString().split(before).length !== 2) throw Error('account_driver_patch_ambiguous')
  const next = source.toString().replace(before, 'if (this._isMainFrame() && !skipDefaultOverrides && !this._crPage._browserContext._options.focusControl)')
  if (digest(next) !== patchedSha) throw Error('account_driver_patch_mismatch')
  await writeFile(file, next)
}

async function usesManagedPython(expectedPython) {
  try {
    const configuration = await readFile(path.join(environment, "pyvenv.cfg"), "utf8")
    const home = configuration.match(/^home\s*=\s*(.+)$/m)?.[1]?.trim()
    if (!home) return false
    const expectedHome = expectedPython ? path.dirname(expectedPython) : uvEnvironment.UV_PYTHON_INSTALL_DIR
    return isWithin(path.resolve(home), path.resolve(expectedHome)) && canRun(python)
  } catch {
    return false
  }
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function canRun(program) {
  if (!existsSync(program)) return false
  const result = spawnSync(program, ["--version"], { cwd: root, encoding: "utf8" })
  return !result.error && result.status === 0
}

function run(program, args, extra = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", env: { ...process.env, ...extra } })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`hybrid_setup_failed:${program}:${result.status}:${result.stderr.trim() || result.stdout.trim()}`)
  }
  return result.stdout.trim()
}
