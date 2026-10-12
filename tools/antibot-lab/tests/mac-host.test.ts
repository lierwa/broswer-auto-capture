import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { posix as path } from 'node:path'
import { z } from 'zod'

// 保护真实宿主入口的归属和失败恢复分支；全部CLI/文件替身隔离，不代表Mac实机验收。
const source = await readFile(new URL('../mac-host.ts', import.meta.url), 'utf8')
const template = await readFile(new URL('../deployment/lima.yaml', import.meta.url))
const sha = (x: string | Uint8Array) => createHash('sha256').update(x).digest('hex')
const host = '/Users/test/Library/Application Support/BATShield', prefix = host + '/lima-2.2.1'
const executable = prefix + '/bin/limactl', ownerFile = host + '/lima-owner.json'
const instanceDirectory = '/Users/test/.lima/bat-shield', token = randomUUID()
const archive = host + '/lima-2.2.1-Darwin-arm64.tar.gz'
const archiveDigest = '9e9eacce88f37e185c346bad73aa6136f738d8cdf8c3bb23cd42b071824bc66e'
const identity = { configurationSha256: sha('instance-config'), device: 1, inode: 7, born: 100 }
const owner = { instance: 'bat-shield', executable, configurationSha256: sha(template), instanceDirectory, token, identity }
const normal = { name: 'bat-shield', dir: instanceDirectory, arch: 'aarch64', vmType: 'vz', status: 'Running',
  param: { internal_batShieldOwner: token } }
type Options = { setup?: boolean; entry?: object | null; owner?: object | null; inode?: number; config?: string;
  cache?: 'valid' | 'broken'; extracted?: boolean; hasServiceOwner?: boolean; active?: string; installFails?: boolean; stopFails?: boolean; homeMissing?: boolean }

async function scenario(command: string, options: Options = {}) {
  const calls: string[][] = [], files = new Map<string, string | Uint8Array>([
    ['/release.tgz', 'fixture'], ['/repo/deployment/lima.yaml', template], [instanceDirectory + '/lima.yaml', options.config ?? 'instance-config'],
  ])
  if (options.owner !== null) files.set(ownerFile, JSON.stringify(options.owner ?? owner))
  if (options.extracted !== false) { files.set(executable, 'cli'); files.set(prefix + '/.archive-sha256', archiveDigest) }
  if (options.cache) files.set(archive, options.cache === 'valid' ? 'verified-archive' : 'broken')
  let entry = options.entry === undefined ? normal : options.entry, downloads = 0
  let limaHomeExists = !options.homeMissing
  const error = (code: string) => Object.assign(Error(code), { code })
  const fs = {
    access: async (p: string) => { if (!files.has(p)) throw error('ENOENT') },
    mkdir: async (p: string) => { if (p === '/Users/test/.lima') limaHomeExists = true },
    realpath: async (p: string) => { if (p === '/Users/test/.lima' && !limaHomeExists) throw error('ENOENT'); return p },
    lstat: async () => ({ dev: 1, ino: options.inode ?? 7, birthtimeMs: 100 }),
    readFile: async (p: string, encoding?: string) => {
      if (!files.has(p)) throw error('ENOENT')
      return encoding ? Buffer.from(files.get(p)!).toString() : Buffer.from(files.get(p)!)
    },
    writeFile: async (p: string, v: string, o?: { flag?: string }) => {
      if (o?.flag === 'wx' && files.has(p)) throw error('EEXIST')
      files.set(p, v)
    },
    rename: async (a: string, b: string) => { files.set(b, files.get(a)!); files.delete(a) },
    unlink: async (p: string) => { if (!files.delete(p)) throw error('ENOENT') },
  }
  const execFileSync = (c: string, a: string[]) => {
    calls.push([c, ...a])
    if (c === 'tar') { files.set(executable, 'cli'); return '' }
    if (c === 'sw_vers') return '26.0'
    if (c !== executable) throw Error('unexpected-command:' + c)
    if (a[0] === '--version') return 'limactl version 2.2.1'
    if (a[0] === 'validate' || a[0] === 'start' || a[0] === 'stop' || a[0] === 'copy') return ''
    if (a[0] === 'info') return JSON.stringify({ limaHome: '/Users/test/.lima' })
    if (a[0] === 'list') return entry ? JSON.stringify(entry) : ''
    if (a[0] === 'create') {
      const pending = JSON.parse(String(files.get(ownerFile)))
      entry = { ...normal, param: { internal_batShieldOwner: pending.token } }; return ''
    }
    const args = a.slice(3)
    if (a[0] !== 'shell') throw Error('unexpected-lima:' + a)
    if (args[0] === 'printenv') return '/home/test'
    if (args[0] === 'uname') return 'Linux aarch64'
    if (args[0] === 'systemctl') return options.active ?? 'inactive\ninactive'
    if (args[0]?.endsWith('/shield.sh')) { if (options.stopFails) throw Error('lab_owner_changed'); return '' }
    if (args[0] === 'python3') {
      if (args[2]?.includes('service-owner.json')) return options.hasServiceOwner ? 'yes' : 'no'
      if (args[1]?.endsWith('/install-linux.py') && options.installFails) throw Error('first_install_failure')
      return ''
    }
    throw Error('unexpected-guest:' + args)
  }
  // Only the fixture archive maps to the pinned hash, so retry tests exercise control flow without network or a real archive.
  const hash = (algorithm: string) => { let input: Uint8Array; return {
    update(v: Uint8Array) { input = v; return this },
    digest(format: 'hex') { return Buffer.from(input).toString() === 'verified-archive' ? archiveDigest : createHash(algorithm).update(input).digest(format) },
  } }
  const context = vm.createContext({ process: { platform: 'darwin', arch: 'arm64', argv: ['node', 'mac-host.ts', command, '/release.tgz', sha('fixture')] },
    console: { log() {}, error() {} }, Uint8Array, AbortSignal,
    fetch: async () => { downloads++; return { ok: true, arrayBuffer: async () => Buffer.from('verified-archive') } } })
  const modules: Record<string, object> = {
    'node:child_process': { execFileSync }, 'node:crypto': { createHash: hash, randomUUID }, 'node:fs/promises': fs,
    'node:os': { homedir: () => '/Users/test' }, 'node:path': { default: path }, zod: { z },
    './locations.mjs': { root: '/repo', directory: '/source-data' }, './paths.ts': { units: ['bat-antibot-engine', 'bat-antibot-origin'] },
    './trusted-tls.ts': { trustLocalhost: () => { throw Error('trust_not_expected') } },
  }
  const module = new vm.SourceTextModule(stripTypeScriptTypes(source), { context })
  await module.link(async name => {
    const values = modules[name]; if (!values) throw Error(name)
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  let failure = ''
  try { await module.evaluate() } catch (e) { failure = (e as Error).message }
  return { calls, files, downloads, failure }
}

test('first setup binds the actual Lima instance before starting it', async () => {
  const r = await scenario('setup', { entry: null, owner: null, homeMissing: true })
  assert.equal(r.failure, '')
  const value = JSON.parse(String(r.files.get(ownerFile)))
  assert.deepEqual(value.identity, identity)
  assert.ok(r.calls.findIndex(c => c[1] === 'create') < r.calls.findIndex(c => c[1] === 'start'))
})

test('same-name replacement, changed LIMA_HOME, architecture, config and inode are rejected', async () => {
  for (const options of [{ entry: { ...normal, dir: '/elsewhere/bat-shield' } },
    { entry: { ...normal, arch: 'x86_64', vmType: 'qemu' } }, { entry: { ...normal, param: {} } },
    { config: 'changed' }, { inode: 9 }]) {
    const r = await scenario('setup', options)
    assert.match(r.failure, /lima_instance_(owner|identity)_changed/)
    assert.ok(!r.calls.some(c => ['start', 'stop', 'shell'].includes(c[1]!)))
  }
})

test('interrupted Lima extraction reuses verified cache; corrupt cache is replaced atomically', async () => {
  for (const cache of ['valid', 'broken'] as const) {
    const r = await scenario('setup', { cache, extracted: false })
    assert.equal(r.failure, '')
    assert.equal(r.downloads, cache === 'valid' ? 0 : 1)
    assert.ok(r.calls.some(c => c[0] === 'tar'))
    assert.ok(![...r.files.keys()].some(p => p.endsWith('.pending')))
  }
})

test('fresh guest creates missing parents; failed install retains first error and cleans stage', async () => {
  const r = await scenario('install', { installFails: true })
  assert.equal(r.failure, 'first_install_failure')
  assert.ok(r.calls.some(c => c.some(a => a.includes('p.parent.mkdir(parents=True'))))
  assert.ok(r.calls.some(c => c.some(a => a.includes('shutil.rmtree(p)'))))
  const receipt = [...r.files].find(([p]) => p.includes('/install-bat-shield-'))!
  assert.equal(JSON.parse(String(receipt[1])).cleanup, 'permanently_deleted')
})

test('owned VM can stop before installation or service start, and repeated stop is harmless', async () => {
  for (const options of [{}, { hasServiceOwner: false }, { entry: { ...normal, status: 'Stopped' } }]) {
    const r = await scenario('stop-vm', options)
    assert.equal(r.failure, '')
    assert.equal(r.calls.some(c => c[1] === 'stop'), !options.entry)
  }
})

test('stop-vm preserves active unowned services and real service cleanup errors', async () => {
  for (const options of [{ active: 'active' }, { hasServiceOwner: true, stopFails: true }]) {
    const r = await scenario('stop-vm', options)
    assert.match(r.failure, /lima_services_without_owner|lab_owner_changed/)
    assert.ok(!r.calls.some(c => c[1] === 'stop'))
  }
})
