import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { homedir } from 'node:os'
import path from 'node:path'
import { root, directory } from './locations.mjs'
import { units } from './paths.ts'
import { trustLocalhost } from './trusted-tls.ts'

// WHY：仅转交官方 Lima CLI；VM、SSH、端口及重启仍由 Lima 管，服务仍由现有 systemd 管。
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('mac_host_requires_apple_silicon')
const version = '2.2.1', instance = 'bat-shield'
const host = path.join(homedir(), 'Library/Application Support/BATShield')
const prefix = path.join(host, 'lima-' + version), executable = path.join(prefix, 'bin/limactl')
const ownerFile = path.join(host, 'lima-owner.json')
const config = path.join(root, 'deployment/lima.yaml')
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const run = (command: string, args: string[], quiet = false) => execFileSync(command, args,
  { cwd: root, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' })
const lima = (args: string[], quiet = false) => run(executable, args, quiet)
const guest = (args: string[], quiet = false) => lima(['shell', instance, '--', ...args], quiet)
const exists = (file: string) => access(file).then(() => true, () => false)
const archiveSha256 = '9e9eacce88f37e185c346bad73aa6136f738d8cdf8c3bb23cd42b071824bc66e'
const instanceSchema = z.object({ name: z.string(), dir: z.string(), arch: z.string(), vmType: z.string(),
  status: z.string(), param: z.record(z.string(), z.string()).optional() })
const ownerSchema = z.object({ instance: z.literal(instance), executable: z.literal(executable),
  configurationSha256: z.string(), instanceDirectory: z.string(), token: z.uuid(),
  identity: z.object({ configurationSha256: z.string(), device: z.number(), inode: z.number(), born: z.number() }).optional() })
function currentInstance() {
  return lima(['list', '--json'], true).trim().split('\n').filter(Boolean)
    .map(row => instanceSchema.parse(JSON.parse(row))).find(row => row.name === instance)
}

async function installLima() {
  const marker = path.join(prefix, '.archive-sha256')
  if (await exists(executable) && await readFile(marker, 'utf8').catch(() => '') === archiveSha256) return
  const archive = path.join(host, `lima-${version}-Darwin-arm64.tar.gz`)
  const cached = await readFile(archive).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
  if (!cached || sha(cached) !== archiveSha256) {
    const response = await fetch(`https://github.com/lima-vm/lima/releases/download/v${version}/lima-${version}-Darwin-arm64.tar.gz`,
      { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw Error('lima_download_failed:' + response.status)
    const data = new Uint8Array(await response.arrayBuffer())
    if (sha(data) !== archiveSha256) throw Error('lima_archive_changed')
    const pending = archive + '.' + randomUUID() + '.pending'
    await writeFile(pending, data, { flag: 'wx', mode: 0o600 })
    try { await rename(pending, archive) }
    finally { await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
  await mkdir(prefix, { recursive: true })
  run('tar', ['-xzf', archive, '-C', prefix])
  await writeFile(marker, archiveSha256)
}

async function setup() {
  await mkdir(host, { recursive: true })
  await installLima()
  if (!lima(['--version'], true).includes(version)) throw Error('lima_version_changed')
  lima(['validate', config])
  if (!currentInstance()) {
    const info = z.object({ limaHome: z.string() }).parse(JSON.parse(lima(['info'], true)))
    if (!path.isAbsolute(info.limaHome)) throw Error('lima_home_must_be_absolute')
    await mkdir(info.limaHome, { recursive: true })
    const expected = path.join(await realpath(info.limaHome), instance)
    if (!await exists(ownerFile)) await writeFile(ownerFile, JSON.stringify({ instance, executable,
      configurationSha256: sha(await readFile(config)), instanceDirectory: expected, token: randomUUID() }), { flag: 'wx' })
    const owner = ownerSchema.parse(JSON.parse(await readFile(ownerFile, 'utf8')))
    if (owner.identity || owner.instanceDirectory !== expected || owner.configurationSha256 !== sha(await readFile(config)))
      throw Error('lima_instance_owner_changed')
    // WHY：先由官方CLI创建，再绑定实际配置；创建中断可凭写入Lima配置的唯一标记恢复，不能认领同名VM。
    lima(['create', '--tty=false', '--name=' + instance, '--set', `.param.internal_batShieldOwner = "${owner.token}"`, config])
  }
  await requireOwner(true)
  lima(['start', '--tty=false', instance])
  console.log(JSON.stringify({ instance, limaVersion: version, macOS: run('sw_vers', ['-productVersion'], true).trim(),
    linux: guest(['uname', '-ms'], true).trim(), servicesStarted: false }))
}

async function requireOwner(bindCreated = false) {
  const value = ownerSchema.parse(JSON.parse(await readFile(ownerFile, 'utf8'))), current = currentInstance()
  if (value.configurationSha256 !== sha(await readFile(config)) || !current || current.arch !== 'aarch64'
    || current.vmType !== 'vz' || current.dir !== value.instanceDirectory
    || await realpath(current.dir) !== value.instanceDirectory || current.param?.internal_batShieldOwner !== value.token)
    throw Error('lima_instance_owner_changed')
  const stat = await lstat(current.dir)
  const identity = { configurationSha256: sha(await readFile(path.join(current.dir, 'lima.yaml'))),
    device: stat.dev, inode: stat.ino, born: stat.birthtimeMs }
  if (value.identity && JSON.stringify(value.identity) !== JSON.stringify(identity)) throw Error('lima_instance_identity_changed')
  if (!value.identity) {
    if (!bindCreated) throw Error('lima_instance_binding_incomplete_run_setup')
    await writeFile(ownerFile, JSON.stringify({ ...value, identity }, null, 2))
  }
  return current
}

function guestDirectory() {
  const home = guest(['printenv', 'HOME'], true).trim()
  if (!/^\/home\/[^/\r\n]+$/.test(home)) throw Error('lima_guest_home_invalid')
  return home + '/.local/share/bat-shield'
}

async function install() {
  const archive = path.resolve(process.argv[3] ?? ''), expected = process.argv[4]
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || sha(await readFile(archive)) !== expected)
    throw Error('usage: mac-host.ts install <linux-arm64.tgz> <sha256>')
  const destination = guestDirectory(), stage = destination + '-install-' + randomUUID()
  // Persist exact owned path before copying, so interruption cannot hide temporary VM files.
  const receipt = path.join(host, 'install-' + path.basename(stage) + '.json')
  await writeFile(receipt, JSON.stringify({ instance, stage, destination, archiveSha256: expected, cleanup: 'pending' }))
  guest(['python3', '-c', 'import pathlib,sys;p=pathlib.Path(sys.argv[1]);assert all(not x.is_symlink() for x in [p,*p.parents]);p.parent.mkdir(parents=True,exist_ok=True);p.mkdir(mode=0o700)', stage])
  try {
    lima(['copy', archive, `${instance}:${stage}/release.tgz`])
    guest(['python3', '-c', 'import tarfile,sys;tarfile.open(sys.argv[1]).extractall(sys.argv[2],filter="data")', stage + '/release.tgz', stage])
    guest(['python3', stage + '/install-linux.py', destination])
  } finally {
    // WHY：安装失败也结算本次唯一 staging；保留安装目录和原始失败，不删除其它 VM 数据。
    try {
      guest(['python3', '-c', 'import pathlib,shutil,sys,uuid;p=pathlib.Path(sys.argv[1]);owner=pathlib.Path(sys.argv[2]);assert p.parent.resolve()==owner.parent.resolve() and p.name==owner.name+"-install-"+str(uuid.UUID(p.name[-36:])) and not p.is_symlink();shutil.rmtree(p)', stage, destination])
      await writeFile(receipt, JSON.stringify({ instance, stage, destination, archiveSha256: expected, cleanup: 'permanently_deleted' }))
    } catch (error) {
      console.error('owned_install_stage_cleanup_pending', receipt, String(error))
    }
  }
}

async function stopVm(status: string) {
  if (status === 'Stopped') return
  const destination = guestDirectory()
  const hasOwner = guest(['python3', '-c', 'import pathlib,sys;p=pathlib.Path(sys.argv[1])/"data/service-owner.json";print("yes" if p.exists() or p.is_symlink() else "no")', destination], true).trim()
  if (hasOwner === 'yes') guest([destination + '/shield.sh', 'stop'])
  else {
    // WHY：未装/从未启动无服务owner是正常状态；任何活动服务仍阻止停VM，不能吞掉归属异常。
    const states = guest(['systemctl', '--user', 'show', ...units.map(unit => unit + '.service'),
      '--property=ActiveState', '--value'], true).trim().split(/\s+/)
    if (states.some(state => !['', 'inactive', 'failed'].includes(state))) throw Error('lima_services_without_owner')
  }
  lima(['stop', instance])
}

async function trust() {
  const owner = JSON.parse(guest(['cat', guestDirectory() + '/install-owner.json'], true))
  if (owner.destination !== guestDirectory()) throw Error('install_owner_changed')
  const active = guest(['systemctl', '--user', 'show', ...units.map(unit => unit + '.service'), '--property=ActiveState', '--value'], true)
  if (active.trim().split(/\s+/).includes('active')) throw Error('stop_lab_before_trusting_localhost')
  const addresses = JSON.parse(guest(['ip', '-4', '-j', 'addr', 'show', 'dev', 'shieldvz'], true))
  const ip = addresses.flatMap((row: { addr_info: Array<{ local: string }> }) => row.addr_info.map(item => item.local))[0]
  const receipt = await trustLocalhost('', ip)
  const tls = guestDirectory() + '/data/tls'
  guest(['mkdir', '-p', tls])
  for (const file of ['cert.pem', 'key.pem', 'rootCA.pem', 'trusted.json']) lima(['copy', path.join(directory, 'tls', file), `${instance}:${tls}/${file}`])
  guest(['chmod', '600', tls + '/key.pem'])
  console.log(JSON.stringify(receipt))
}

const command = process.argv[2] ?? 'status'
if (command === 'setup') await setup()
else {
  const current = await requireOwner()
  if (command === 'install') await install()
  else if (command === 'trust-localhost') await trust()
  else if (command === 'start') {
    lima(['start', '--tty=false', instance])
    guest([guestDirectory() + '/shield.sh', 'start'])
  } else if (['status', 'stop', 'metrics', 'alerts', 'refresh-source-data', 'refresh-geodata'].includes(command)) guest([guestDirectory() + '/shield.sh', command])
  else if (command === 'stop-vm') await stopVm(current.status)
  else if (command === 'logs') guest(['journalctl', '--user', ...units.flatMap(unit => ['-u', unit]), '-n', '100', '--no-pager'])
  else throw Error('usage: mac-host.ts setup|install|trust-localhost|start|status|stop|stop-vm|logs|metrics|alerts|refresh-source-data|refresh-geodata')
}
