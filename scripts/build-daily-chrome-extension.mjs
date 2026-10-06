import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, cp, access } from 'node:fs/promises'
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
for (const managed of pin.adapterFiles ?? []) {
  const destination = path.join(stage, managed.slice('extension/'.length))
  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(path.join(root, 'vendor/daily-chrome-extension', managed), destination)
}
const tooling = createRequire(toolingPath)
const rootRequire = createRequire(path.join(root, 'package.json'))
const colors = rootRequire('@radix-ui/colors')
const palette = (theme) => ['sand', 'amber', 'green', 'red'].flatMap(name =>
  Object.entries(colors[theme === 'dark' ? `${name}Dark` : name]).map(([key, value]) =>
    `--${key.replace(/(\d+)/, '-$1')}:${value};`)).join('')
await copyFile(path.join(root, 'apps/workbench/src/theme-tokens.css'), path.join(stage, 'src/ui/theme-tokens.css'))
await writeFile(path.join(stage, 'src/ui/popup-palette.css'),
  `:root{${palette('light')}}\n@media (prefers-color-scheme: dark){:root{${palette('dark')}}}\n`)
const viteManifest = tooling.resolve('vite/package.json')
// WHY：复用原上游配置，公共控件只用同一 React 实例，避免工作台依赖带入第二份 hooks runtime。
await writeFile(path.join(stage, 'vite.bat.config.mjs'),
  `import { mergeConfig } from 'vite';\nimport upstream from './vite.config.mts';\nexport default mergeConfig(upstream, { resolve: { dedupe: ['react', 'react-dom'] } });\n`)
run(process.execPath, [path.join(path.dirname(viteManifest), tooling('vite/package.json').bin.vite),
  'build', '--config', 'vite.bat.config.mjs', '--clearScreen=false'], stage)
const output = path.join(root, 'work/daily-chrome-extension/extension')
assert.equal(path.resolve(output), path.resolve(root, 'work/daily-chrome-extension/extension'))
assert.ok(!path.relative(root, output).startsWith('..'), 'extension_output_outside_checkout')
// WHY：用户可能已加载此目录；原文件名固定，覆盖产物时保留目录，避免临时消失影响扩展重载。
await mkdir(output, { recursive: true })
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
  const rootLock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
  const packages = new Map(['react', 'react-dom', 'scheduler'].map(name => [name, lock.packages[`node_modules/${name}`]]))
  const queue = ['zod', '@radix-ui/colors', '@radix-ui/themes', 'lucide-react']
  while (queue.length) {
    const name = queue.shift()
    if (packages.has(name)) continue
    const published = rootLock.packages[`node_modules/${name}`]
    assert.ok(published, `missing_locked_ui_dependency:${name}`)
    packages.set(name, published)
    queue.push(...Object.keys(published.dependencies ?? {}))
  }
  for (const [name, published] of packages) {
    const archive = path.join(directory, `${name.replace('@', '').replace('/', '-')}-${published.version}.tgz`)
    try { await access(archive) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      run(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['pack', `${name}@${published.version}`, '--ignore-scripts', '--silent', '--pack-destination', directory], root, process.platform === 'win32')
    }
    assert.equal('sha512-' + createHash('sha512').update(await readFile(archive)).digest('base64'), published.integrity)
    archives.push(archive)
  }
  // WHY：部分公开包未附 LICENSE，使用仓库内注明来源的上游全文；不读取 node_modules。
  run(python, ['-c', `import sys,tarfile,json
from pathlib import Path
parts=[]
for archive in sys.argv[3:]:
    with tarfile.open(archive) as package:
        license=next((entry for entry in package.getnames() if entry.lower() in ['package/license','package/license.md','package/license.txt']),None)
        if license is not None: content=package.extractfile(license).read().decode()
        else:
            metadata=json.load(package.extractfile('package/package.json'))
            name=metadata['name']
            fallback='RadixPrimitives.LICENSE' if name.startswith('@radix-ui/') else 'ReactRemoveScrollBar.LICENSE' if name=='react-remove-scroll-bar' else None
            if fallback is None or metadata.get('license')!='MIT': raise ValueError('license_missing:'+name)
            content=(Path(sys.argv[2])/fallback).read_text(encoding='utf-8')
        parts.append(Path(archive).name+'\\n'+content)
Path(sys.argv[1]).write_text('\\n\\n'.join(parts),encoding='utf-8')`, path.join(output, 'THIRD_PARTY_LICENSES.txt'),
    path.join(root, 'vendor/daily-chrome-extension/licenses'), ...archives], root)
}

function run(program, args, cwd, shell = false) {
  const result = spawnSync(program, args, { cwd, shell, stdio: 'inherit' })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'daily_chrome_extension_build_failed')
}
