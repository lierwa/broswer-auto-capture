import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import path from 'node:path'
import { sourceStatus, refreshSource, configureSource, sourceUrl } from '../../../tools/antibot-lab/source-data.js'

// WHY：缓存元数据损坏或304不能给旧名单续期；失败不能重写已部署规则或有效缓存。
test('Tor source cache enforces publication expiry and preserves data on failed refresh', async t => {
  const parent = await realpath('work/antibot-service/reports')
  const base = await mkdtemp(path.join(parent, 'source-validity-'))
  const now = Date.now(), published = now - 3600_000, list = '192.0.2.10\n'
  const hash = (text: string) => createHash('sha256').update(text).digest('hex')
  const value = { source: sourceUrl, version: '8.0', published: new Date(published).toISOString(),
    expires: new Date(published + 86400_000).toISOString(), fetched: new Date(now).toISOString(),
    sourceDigest: hash('synthetic-source'), listDigest: hash(list), count: 1,
    lastModified: new Date(published).toUTCString() }
  const receipt = path.join(base, 'data/tor-source.json'), nativeFetch = globalThis.fetch
  try {
    await mkdir(path.join(base, 'data')); await mkdir(path.join(base, 'config/scenarios'), { recursive: true })
    await writeFile(path.join(base, `data/tor-${value.listDigest}.txt`), list)
    await t.test('fresh cache and conditional 304 retain original expiry', async () => {
      await writeFile(receipt, JSON.stringify(value))
      assert.equal((await sourceStatus(base)).status, 'available')
      globalThis.fetch = async (_url, init) => {
        assert.equal(new Headers(init?.headers).get('if-modified-since'), value.lastModified)
        return new Response(null, { status: 304 })
      }
      assert.equal((await refreshSource(base)).expires, value.expires)
      await configureSource(base)
    })
    const rule = path.join(base, 'config/scenarios/bat-lab-tor-exit-observed.yaml')
    const configured = await readFile(rule, 'utf8')
    await t.test('changed expiry is unavailable and cannot be configured', async () => {
      await writeFile(receipt, JSON.stringify({ ...value, expires: new Date(now + 7 * 86400_000).toISOString() }))
      assert.equal((await sourceStatus(base)).status, 'unavailable')
      await assert.rejects(() => configureSource(base))
      assert.equal(await readFile(rule, 'utf8'), configured)
    })
    await t.test('expired 304 fails refresh without deploying old rules', async () => {
      const stale = { ...value, published: new Date(now - 2 * 86400_000).toISOString(),
        expires: new Date(now - 86400_000).toISOString() }
      await writeFile(receipt, JSON.stringify(stale))
      assert.equal((await sourceStatus(base)).status, 'stale')
      globalThis.fetch = async (_url, init) => {
        assert.equal(new Headers(init?.headers).has('if-modified-since'), false)
        return new Response(null, { status: 304 })
      }
      await assert.rejects(() => refreshSource(base), /source_data_/)
      await assert.rejects(() => configureSource(base), /source_data_expired/)
      assert.equal(await readFile(rule, 'utf8'), configured)
      assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), stale)
      const update = { version: '8.0', relays_published: new Date(now).toISOString().slice(0, 19).replace('T', ' '),
        relays: [{ exit_addresses: ['192.0.2.11'] }] }
      globalThis.fetch = async () => new Response(JSON.stringify(update), { headers: { 'Last-Modified': new Date(now).toUTCString() } })
      const refreshed = await refreshSource(base)
      assert.equal(Date.parse(refreshed.expires), Date.parse(refreshed.published) + 86400_000)
      assert.notEqual(refreshed.listDigest, value.listDigest)
      await configureSource(base)
      assert.ok((await readFile(rule, 'utf8')).includes(refreshed.listDigest))
    })
    await t.test('failed HTTP refresh preserves fresh cache', async () => {
      await writeFile(receipt, JSON.stringify(value))
      globalThis.fetch = async () => new Response(null, { status: 503 })
      await assert.rejects(() => refreshSource(base), /source_data_http_503/)
      assert.equal((await sourceStatus(base)).status, 'available')
      assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), value)
    })
  } finally {
    globalThis.fetch = nativeFetch
    assert.equal(path.dirname(await realpath(base)), parent)
    await rm(base, { recursive: true })
  }
})
