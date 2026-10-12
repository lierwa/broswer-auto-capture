import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root, directory, linuxArchitecture } from './paths.ts'
import { artifacts } from './artifacts.ts'
import { requireProbes } from './creep.ts'
import { geoSourceStatus } from './geo-source.ts'
import { sourceStatus } from './source-data.ts'
import { requireNativeExecutable } from './runtime-artifacts.ts'

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const target = path.resolve(process.argv[2] ?? path.join(directory, 'releases'))
await mkdir(target, { recursive: true })
// WHY：归档只有公开制品和明确列出的数据源；绝不打包活动 DB、密钥、日志或整个 runtime 目录。
const stage = await mkdtemp(path.join(target, 'linux-package-'))
await writeFile(path.join(stage, 'owner.json'), JSON.stringify({ purpose: 'shield-runtime-release', stage }))
await requireProbes(directory)
const geography = await geoSourceStatus(directory), network = await sourceStatus(directory)
if (geography.status !== 'available' || network.status !== 'available'
  || !('files' in geography) || !('listDigest' in network)) throw Error('release_public_data_not_fresh')
execFileSync(process.execPath, [path.join(root, 'release.ts'), path.join(stage, 'source')], { cwd: root, stdio: 'pipe' })
const source = JSON.parse(await readFile(path.join(stage, 'source/release.json'), 'utf8'))
await cp(path.join(stage, 'source', source.archive), path.join(stage, 'shield-source.tgz'), { errorOnExist: true, force: false })
const files: Record<string, string> = { 'shield-source.tgz': source.sha256 }
async function copy(file: string) {
  const from = path.join(directory, file), to = path.join(stage, 'assets', file)
  if ((await lstat(from)).isSymbolicLink() || path.relative(directory, from).startsWith('..')) throw Error('release_asset_boundary_invalid')
  await mkdir(path.dirname(to), { recursive: true })
  await cp(from, to, { errorOnExist: true, force: false })
  files['assets/' + file] = sha(await readFile(to))
}
const arch = linuxArchitecture()
const materials = await artifacts(arch)
for (const item of materials) {
  if (sha(await readFile(path.join(directory, 'upstream', item.name))) !== item.sha256) throw Error('release_material_changed:' + item.name)
  await copy('upstream/' + item.name)
}
const binaries = [
  'runtime/crowdsec-persistent/crowdsec', 'runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli',
  'runtime/traefik/traefik', `runtime/node/node-v24.9.0-linux-${arch}/bin/node`,
  'runtime/haproxy-h2/haproxy', 'runtime/h2-hints/h2-hints',
  'runtime/geoip-validator/geoip-validator',
]
for (const file of binaries) {
  requireNativeExecutable(await readFile(path.join(directory, file)), arch)
  await copy(file)
}
for (const [file, executable, key] of [['persistent-engine.json', binaries[0], 'binarySha256'],
  ['edge-h2.json', binaries[4], 'binarySha256'], ['h2-online.json', binaries[5], 'classifierSha256'],
  ['geoip-validator.json', binaries[6], 'binarySha256']]) {
  const receipt = JSON.parse(await readFile(path.join(directory, file!), 'utf8'))
  if (receipt[key!] !== sha(await readFile(path.join(directory, executable!)))) throw Error('release_build_receipt_changed:' + file)
}
const validator = JSON.parse(await readFile(path.join(directory, 'geoip-validator.json'), 'utf8'))
if (validator.architecture !== arch || validator.sourceSha256 !== sha(await readFile(path.join(root, 'tests/geoip-calibration.go'))))
  throw Error('release_geo_validator_source_changed')
for (const file of ['persistent-engine.json', 'edge-h2.json', 'h2-online.json', 'geoip-validator.json']) await copy(file)
for (const name of ['creep-probe', 'creep-worker-client', 'creep-worker-source', 'creep-device-client']) {
  await copy(`runtime/${name}.js`); await copy(`runtime/${name}.json`)
}
await copy('runtime/input-fixture.js')
for (const row of geography.files) await copy('data/' + row.file)
// Only schema-projected public metadata; historical candidate/backup paths are not distributed.
for (const [file, value] of [['geo-source.json', geography], ['data/tor-source.json', network]] as const) {
  const dest = path.join(stage, 'assets', file)
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, JSON.stringify(value, null, 2) + '\n')
  files['assets/' + file] = sha(await readFile(dest))
}
await copy(`data/tor-${network.listDigest}.txt`)
for (const file of ['install-linux.py', 'shield.sh']) {
  await cp(path.join(root, 'deployment', file), path.join(stage, file))
  files[file] = sha(await readFile(path.join(stage, file)))
}
const receipt = { schemaVersion: 1, platform: 'linux', architecture: arch, distribution: 'ubuntu-26.04',
  sourceSha256: source.sha256, files, materials, executables: binaries, runtimeDataIncluded: false, hostCaIncluded: false,
  python: 'Ubuntu 26.04 python3 runtime; pure Python wheels included', createdAt: new Date().toISOString() }
await writeFile(path.join(stage, 'runtime-release.json'), JSON.stringify(receipt, null, 2) + '\n')
const archive = path.join(target, `bat-shield-linux-${arch}.tgz`)
execFileSync('tar', ['-czf', archive, '-C', stage, 'shield-source.tgz', 'runtime-release.json', 'install-linux.py', 'shield.sh', 'assets'], { cwd: root })
await writeFile(archive + '.sha256', sha(await readFile(archive)) + '  ' + path.basename(archive) + '\n')
console.log(JSON.stringify({ archive, sha256: sha(await readFile(archive)), stage, files: Object.keys(files).length,
  stagingCleanupRequired: true, architecture: arch }))
