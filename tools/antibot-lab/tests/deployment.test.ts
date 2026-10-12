import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { artifacts } from '../artifacts.ts'
import { verifyPrebuilt } from '../prebuilt.ts'
import { mkcertArtifact } from '../trusted-tls.ts'
import { requireNativeExecutable } from '../runtime-artifacts.ts'

// 保护发行协议：arm64 不得静默混用 amd64 可执行制品，共用探针源码必须保持同一来源。
test('native architecture manifests preserve shared sources and select actual arm64 binaries', async () => {
  const x64 = await artifacts('x64'), arm64 = await artifacts('arm64')
  assert.deepEqual(arm64.map(row => row.name), x64.map(row => row.name))
  for (const file of ['node.tar.xz', 'traefik.tar.gz', 'haproxy-3.2.9-ubuntu.deb']) {
    assert.match(arm64.find(row => row.name === file)!.url, /arm64/)
    assert.notEqual(arm64.find(row => row.name === file)!.sha256, x64.find(row => row.name === file)!.sha256)
  }
  for (const row of x64.filter(row => !/amd64|linux-x64/.test(row.url)))
    assert.deepEqual(arm64.find(item => item.name === row.name), row)
  assert.match(mkcertArtifact('darwin', 'arm64').url, /darwin-arm64$/)
  assert.throws(() => mkcertArtifact('darwin', 'x64'), /unsupported_trust_host/)
  const header = Buffer.alloc(64); header.set([127, 69, 76, 70, 2, 1]); header.writeUInt16LE(62, 18)
  requireNativeExecutable(header, 'x64')
  assert.throws(() => requireNativeExecutable(header, 'arm64'), /runtime_native_executable_mismatch/)
  assert.throws(() => requireNativeExecutable(Buffer.from('not ELF'), 'x64'), /runtime_native_executable_mismatch/)
})

// 保护安装边界：拒绝错架构、摘要改变和目录逃逸；不能拿配置就绪冒充正确制品。
test('prebuilt admission rejects wrong architecture, corruption and escaping artifact names', async t => {
  const base = await mkdtemp(path.join(tmpdir(), 'shield-release-boundary-'))
  t.after(() => rm(base, { recursive: true }))
  await mkdir(path.join(base, 'runtime'))
  const bytes = Buffer.from('owned artifact'), digest = createHash('sha256').update(bytes).digest('hex')
  await writeFile(path.join(base, 'runtime/sample'), bytes)
  const receipt = { schemaVersion: 1, platform: 'linux', architecture: 'arm64', distribution: 'ubuntu-26.04',
    files: { 'assets/runtime/sample': digest }, hostCaIncluded: false }
  const save = (value: object) => writeFile(path.join(base, 'runtime-release.json'), JSON.stringify(value))
  await save(receipt)
  await verifyPrebuilt(base, 'arm64')
  await assert.rejects(() => verifyPrebuilt(base, 'x64'), /runtime_architecture_mismatch/)
  await writeFile(path.join(base, 'runtime/sample'), 'changed')
  await assert.rejects(() => verifyPrebuilt(base, 'arm64'), /runtime_artifact_changed/)
  await save({ ...receipt, files: { 'assets/../outside': digest } })
  await assert.rejects(() => verifyPrebuilt(base, 'arm64'), /runtime_file_boundary_invalid/)
})
