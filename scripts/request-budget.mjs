import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sharedBudget } from '../tools/antibot-lab/shared-budget.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = path.join(root, 'packages/request-budget')
const shared = path.join(root, 'tools/antibot-lab/shared')
const files = ['pyproject.toml', 'src/bat_request_budget/__init__.py', 'src/bat_request_budget/quota.py']
const sha256 = value => createHash('sha256').update(value).digest('hex')
const normalized = value => value.toString().replaceAll('\r\n', '\n')

async function sourceReceipt() {
  const sourceFiles = {}
  for (const file of files) sourceFiles[file] = sha256(normalized(await readFile(path.join(source, file))))
  return { sourceFiles, sourceDigest: sha256(JSON.stringify(sourceFiles)) }
}

export async function verifyRequestBudget() {
  const receipt = await sharedBudget()
  const current = await sourceReceipt()
  if (receipt.version !== '1.0.0' || receipt.sourceDigest !== current.sourceDigest
    || JSON.stringify(receipt.sourceFiles) !== JSON.stringify(current.sourceFiles)
    || receipt.wheel !== 'bat_request_budget-1.0.0-py3-none-any.whl') throw Error('request_budget_source_changed')
  const wheel = path.join(shared, receipt.wheel)
  if (sha256(await readFile(wheel)) !== receipt.wheelSha256) throw Error('request_budget_artifact_changed')
  return { ...receipt, wheelPath: wheel }
}

export function verifyInstalledBudget(python, receipt) {
  const result = spawnSync(python, ['-I', '-c', `import bat_request_budget as b,importlib.metadata as m,hashlib,json,pathlib
p=pathlib.Path(b.__file__)
print(json.dumps(dict(version=m.version('bat-request-budget'),module=str(p),files={name:hashlib.sha256((p.parent/name).read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest() for name in ['__init__.py','quota.py']})))`],
  { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw Error('request_budget_installed_missing')
  const installed = JSON.parse(result.stdout)
  if (installed.version !== receipt.version || ['__init__.py', 'quota.py'].some(name =>
    installed.files[name] !== receipt.sourceFiles[`src/bat_request_budget/${name}`])) throw Error('request_budget_installed_changed')
  return { ...installed, sourceDigest: receipt.sourceDigest, wheelSha256: receipt.wheelSha256 }
}

export async function buildRequestBudget(freeze = false) {
  const expected = freeze ? null : JSON.parse(await readFile(path.join(shared, 'request-budget.json'), 'utf8'))
  if (expected && expected.sourceDigest !== (await sourceReceipt()).sourceDigest) throw Error('request_budget_source_changed')
  const python = path.join(root, 'work/upstream-browser-hybrid/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const frontend = spawnSync(python, ['-c', "import importlib.metadata as m;print(m.version('build'))"], { cwd: root, encoding: 'utf8' })
  if (frontend.status !== 0 || frontend.stdout.trim() !== '1.2.2.post1') throw Error('request_budget_build_frontend_changed')
  await mkdir(shared, { recursive: true })
  // WHY：标准build/Hatchling负责wheel格式；只冻结既有适配源码与分发摘要，不改vendor锁。
  const result = spawnSync(python, ['-m', 'build', '--wheel', '--outdir', shared, source],
    { cwd: root, encoding: 'utf8', env: { ...process.env, SOURCE_DATE_EPOCH: '315532800' } })
  if (result.status !== 0) throw Error(`request_budget_build_failed:${result.stderr}`)
  const receipt = { version: '1.0.0', ...(await sourceReceipt()), wheel: 'bat_request_budget-1.0.0-py3-none-any.whl',
    buildFrontend: 'build==1.2.2.post1', buildBackend: 'hatchling==1.27.0',
    dependencies: { 'pyrate-limiter': '4.5.0', filelock: '3.19.1' } }
  receipt.wheelSha256 = sha256(await readFile(path.join(shared, receipt.wheel)))
  if (expected && expected.wheelSha256 !== receipt.wheelSha256) throw Error('request_budget_rebuild_changed')
  if (freeze) await writeFile(path.join(shared, 'request-budget.json'), JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify(receipt))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'build') await buildRequestBudget(true)
  else if (process.argv[2] === 'rebuild') await buildRequestBudget()
  else if (process.argv[2] === 'check') console.log(JSON.stringify(await verifyRequestBudget()))
  else throw Error('usage: request-budget.mjs build|check')
}
