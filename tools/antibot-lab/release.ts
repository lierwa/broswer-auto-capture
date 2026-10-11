import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, lstat, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { root, directory } from './locations.mjs'

const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const target = path.resolve(process.argv[2] ?? path.join(directory, 'releases'))
const shared = JSON.parse(await readFile(path.join(root, 'shared/request-budget.json'), 'utf8'))
if (shared.version !== '1.0.0' || shared.wheel !== 'bat_request_budget-1.0.0-py3-none-any.whl'
  || sha256(await readFile(path.join(root, 'shared', shared.wheel))) !== shared.wheelSha256) throw Error('release_shared_budget_changed')
await mkdir(target, { recursive: true })
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--ignore-scripts', '--json'],
  { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
if (result.status !== 0) throw Error(`release_pack_failed:${result.stderr}`)
const pack = z.array(z.object({ filename: z.string(), files: z.array(z.object({ path: z.string() })) })).length(1).parse(JSON.parse(result.stdout))[0]!
const forbidden = /(^|\/)(node_modules|\.local|work|local\.json|\.git|__pycache__|[^/]*\.pyc)(\/|$)/
const selected = [...new Set([...pack.files.map(file => file.path), 'package-lock.json', '.gitignore'])]
  .filter(file => !forbidden.test(file))
const files: Record<string, string> = {}
for (const file of selected) {
  if (path.isAbsolute(file) || file.includes('..') || /[\r\n]/.test(file)
    || (await lstat(path.join(root, file))).isSymbolicLink()) throw Error('release_file_boundary_invalid')
  files[file] = sha256(await readFile(path.join(root, file)))
}
// WHY：npm负责独立包文件选择；标准tar包含npm会省略的锁文件，禁止把运行数据装包。
const list = path.join(target, 'release-files.txt')
await writeFile(list, selected.join('\n') + '\n', { flag: 'wx' })
try {
  const archive = spawnSync('tar', ['-czf', path.join(target, pack.filename), '-C', root, '-T', list], { cwd: root, encoding: 'utf8' })
  if (archive.status !== 0) throw Error(`release_archive_failed:${archive.stderr}`)
} finally { await unlink(list) }
const receipt = { archive: pack.filename, sha256: sha256(await readFile(path.join(target, pack.filename))),
  files, sharedBudget: shared, runtimeDataIncluded: false, createdAt: new Date().toISOString() }
await writeFile(path.join(target, 'release.json'), JSON.stringify(receipt, null, 2) + '\n')
console.log(JSON.stringify({ archive: path.join(target, pack.filename), sha256: receipt.sha256, files: selected.length, sharedBudgetVersion: shared.version }))
