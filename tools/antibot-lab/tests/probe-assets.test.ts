import { directory as labData } from '../locations.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { probeStatus, readProbe, requireProbes } from '../creep.ts'

// 保护实际加载边界：首页就绪不能掩盖缺失、损坏或错版探针；不修改常驻服务的真实制品。
test('probe readiness requires every pinned, intact bundle and retains invalid assets as unavailable', async () => {
  const parent = await realpath(path.join(labData, 'reports'))
  const base = await mkdtemp(path.join(parent, 'probe-assets-'))
  const names = ['creep-probe', 'creep-worker-client', 'creep-worker-source', 'creep-device-client'] as const
  const bytes = Buffer.from('export const fixture = true;')
  const manifest = { source: '10aa6724cd33a1015db1574211890518cd04f0cc',
    sha256: createHash('sha256').update(bytes).digest('hex'), upstreamExceptionProbePreserved: true }
  try {
    assert.equal((await probeStatus(base)).status, 'unavailable')
    await assert.rejects(requireProbes(base), /probe_assets_unavailable:creep-probe/)
    await mkdir(path.join(base, 'runtime'))
    for (const name of names) {
      await writeFile(path.join(base, `runtime/${name}.js`), bytes)
      await writeFile(path.join(base, `runtime/${name}.json`), JSON.stringify(manifest))
    }
    assert.equal((await requireProbes(base)).status, 'available')
    assert.deepEqual(await readProbe(base, 'creep-probe'), bytes)
    const receipt = path.join(base, 'runtime/creep-worker-client.json')
    for (const corrupt of [ { ...manifest, source: 'wrong-version' }, { ...manifest, sha256: '0'.repeat(64) },
      { ...manifest, upstreamExceptionProbePreserved: false }, {} ]) {
      await writeFile(receipt, JSON.stringify(corrupt))
      await assert.rejects(requireProbes(base), /^Error: probe_assets_unavailable:creep-worker-client$/)
      assert.equal((await probeStatus(base)).probes.filter(p => p.status === 'available').length, 3)
    }
    await writeFile(receipt, JSON.stringify(manifest))
    await writeFile(path.join(base, 'runtime/creep-worker-client.js'), 'changed')
    await assert.rejects(readProbe(base, 'creep-worker-client'), /probe_bundle_changed/)
    await assert.rejects(requireProbes(base), /probe_assets_unavailable:creep-worker-client/)
    assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), manifest)
  } finally {
    assert.equal(path.dirname(await realpath(base)), parent)
    await rm(base, { recursive: true })
  }
})
