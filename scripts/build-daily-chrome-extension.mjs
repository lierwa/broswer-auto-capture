import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, cp, access, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = process.cwd()
assert.equal(path.dirname(path.dirname(fileURLToPath(import.meta.url))), root, 'run_from_actual_checkout_root')
const directory = path.join(root, 'work/daily-chrome-p0')
const candidate = path.join(directory, 'playwright')
const python = path.join(root, 'work/upstream-browser-hybrid/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
try { await access(path.join(candidate, 'SOURCE.json')) } catch (error) {
  if (error.code !== 'ENOENT') throw error
  run(python, ['scripts/research-daily-chrome-sources.py', '--candidate', 'playwright'], root)
}
const source = JSON.parse(await readFile(path.join(candidate, 'SOURCE.json'), 'utf8'))
const pin = JSON.parse(await readFile('vendor/daily-chrome-extension/UPSTREAM.json', 'utf8'))
assert.equal(pin.commit, '8b552173e8d767db29b8baef8f4a1f08cf7f26bf')
assert.equal(source.commit, pin.commit)
const original = JSON.parse((await verified('package.json')).toString())
const dependencies = Object.fromEntries(['vite', '@vitejs/plugin-react', 'vite-plugin-static-copy', 'react', 'react-dom']
  .map(name => [name, original.devDependencies[name]]))
const toolingPath = path.join(directory, 'package.json')
const toolManifest = { name: 'bat-daily-chrome-p0-build-tools', private: true, type: 'module', dependencies }
if (process.argv.includes('--prepare-tools')) {
  try { assert.deepEqual(JSON.parse(await readFile(toolingPath, 'utf8')), toolManifest) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await writeFile(toolingPath, JSON.stringify(toolManifest, null, 2) + '\n')
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund'], root, process.platform === 'win32')
}
assert.deepEqual(JSON.parse(await readFile(toolingPath, 'utf8')), toolManifest)
const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'))
const upstreamLock = JSON.parse((await verified('package-lock.json')).toString())
for (const [name, version] of Object.entries(dependencies)) {
  const key = `node_modules/${name}`
  assert.equal(lock.packages[key].version, version)
  assert.equal(lock.packages[key].integrity, upstreamLock.packages[key].integrity)
}
const stage = path.join(directory, 'managed-playwright/packages/extension')
await mkdir(stage, { recursive: true })
for (const relative of Object.keys(source.files)) {
  if (!relative.startsWith('packages/extension/')) continue
  const bytes = await verified(relative)
  const destination = path.join(stage, relative.slice('packages/extension/'.length))
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, bytes)
}
for (const [managed, original] of Object.entries(pin.files)) {
  if (!managed.startsWith('extension/')) continue
  assert.equal(createHash('sha256').update(await verified(original.source)).digest('hex'), original.sha256)
  await copyFile(path.join(root, 'vendor/daily-chrome-extension', managed), path.join(stage, managed.slice('extension/'.length)))
}
const tooling = createRequire(toolingPath)
const viteManifest = tooling.resolve('vite/package.json')
// WHY：固定上游原 Vite 配置/构建入口；不引入另一套扩展框架。
run(process.execPath, [path.join(path.dirname(viteManifest), tooling('vite/package.json').bin.vite), 'build', '--clearScreen=false'], stage)
const output = path.join(root, 'work/daily-chrome-extension/extension')
await rm(output, { recursive: true, force: true })
await cp(path.join(stage, 'dist'), output, { recursive: true })
await copyFile('vendor/daily-chrome-extension/LICENSE', path.join(output, 'LICENSE'))
await copyFile('vendor/daily-chrome-extension/UPSTREAM.json', path.join(output, 'UPSTREAM.json'))
await licenses(output)
console.log('B-A-T unpacked extension: work/daily-chrome-extension/extension')

async function verified(relative) {
  const bytes = await readFile(path.join(candidate, relative))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.files[relative], `fixed_source_mismatch:${relative}`)
  return bytes
}

async function licenses(output) {
  const directory = path.join(root, 'work/daily-chrome-p0/licenses')
  await mkdir(directory, { recursive: true })
  const archives = []
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const published = lock.packages[`node_modules/${name}`]
    const archive = path.join(directory, `${name}-${published.version}.tgz`)
    try { await access(archive) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      run(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['pack', `${name}@${published.version}`, '--ignore-scripts', '--silent', '--pack-destination', directory], root, process.platform === 'win32')
    }
    assert.equal('sha512-' + createHash('sha512').update(await readFile(archive)).digest('base64'), published.integrity)
    archives.push(archive)
  }
  // 只从经过 integrity 校验的发布归档提取 LICENSE，不读取 node_modules 源码。
  run(python, ['-c', `import sys,tarfile
from pathlib import Path
parts=[]
for archive in sys.argv[2:]:
    with tarfile.open(archive) as package:
        parts.append(Path(archive).name+'\\n'+package.extractfile('package/LICENSE').read().decode())
Path(sys.argv[1]).write_text('\\n\\n'.join(parts),encoding='utf-8')`, path.join(output, 'THIRD_PARTY_LICENSES.txt'), ...archives], root)
}

function run(program, args, cwd, shell = false) {
  const result = spawnSync(program, args, { cwd, shell, stdio: 'inherit' })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'daily_chrome_extension_build_failed')
}
