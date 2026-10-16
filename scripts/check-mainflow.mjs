import { spawn } from "node:child_process"
import { readFile, access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyForkSource } from "../vendor/workflow-use/verify-source.mjs"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const checks = JSON.parse(await readFile(new URL("./mainflow-checks.json", import.meta.url), "utf8"))
const prefixes = { api: "apps/api/tests", runtime: "packages/runtime/tests", workbench: "apps/workbench/tests" }
const args = process.argv.slice(2), list = args.includes("--list")
const selected = args.filter(arg => arg !== "--list")
const groups = selected.length ? selected : Object.keys(checks)
if (groups.some(group => !Object.hasOwn(checks, group))) throw Error("Expected api, runtime, workbench or python")
const pythonPaths = ["apps/api/python", "apps/api/tests", "vendor/workflow-use/workflows", "vendor/workflow-use/workflows/tests"]

// WHY：固定主流程边界清单，避免临时挑选绿灯测试；不启动外站、真实账号或全库测试。
for (const group of groups) {
  const names = checks[group]
  const files = group === "python" ? names : names.map(name => `${prefixes[group]}/${name}.test.ts`)
  for (const file of files) {
    const candidates = group === "python" ? pythonPaths.map(base => path.join(root, base, `${file}.py`)) : [path.join(root, file)]
    if (!(await Promise.all(candidates.map(candidate => access(candidate).then(() => true, () => false)))).some(Boolean)) {
      throw Error(`mainflow_check_missing:${file}`)
    }
  }
  console.log(`${group}: ${names.length} files${list ? `\n${files.join("\n")}` : ""}`)
  if (list) continue
  if (group === "python") {
    await verifyForkSource(root)
    const python = path.join(root, "work/upstream-browser-hybrid/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
    await run(python, ["-m", "unittest", ...names], {
      PYTHONPATH: pythonPaths.map(base => path.join(root, base)).join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
    })
  } else {
    await run(process.execPath, ["--import", "tsx", "--test", ...files], group === "workbench"
      ? { TSX_TSCONFIG_PATH: path.join(root, "apps/workbench/tsconfig.json") } : {})
  }
}

function run(program, parameters, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, parameters, { cwd: root, stdio: "inherit", env: { ...process.env, ...environment } })
    child.once("error", reject)
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(Error(`mainflow_checks_failed:${code ?? signal}`)))
  })
}
