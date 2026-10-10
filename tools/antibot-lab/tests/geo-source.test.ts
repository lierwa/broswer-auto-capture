import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, rm, realpath, readFile } from 'node:fs/promises'
import path from 'node:path'
import { geoScoringConfig, geoSourceStatus } from '../geo-source.ts'
import { directory, hubCommit } from '../paths.ts'

test('GeoIP expiration changes only the original dependent filter, retaining every weight and challenge', async () => {
  const source = (await readFile(path.join(directory, `runtime/hub/hub-${hubCommit}/appsec-configs/crowdsecurity/appsec-bot-challenge-scoring.yaml`), 'utf8')).replace(/\r\n/g, '\n')
  const result = geoScoringConfig(source, '2026-11-01T00:00:00.000Z')
  assert.equal(result.split('\n').slice(1).join('\n').replace(
    `TimeNow() < '2026-11-01T00:00:00Z' && (EvaluateMismatches().Has("timezone_country"))`,
    'EvaluateMismatches().Has("timezone_country")'), source)
  assert.throws(() => geoScoringConfig(source, 'corrupt'))
  assert.throws(() => geoScoringConfig(source + '\nfilter: EvaluateMismatches().Has("timezone_country")', '2026-11-01T00:00:00Z'))
})

// 保护测量有效性：时效取源构建时刻；损坏/缺失不能成为正常负例。MMDB解码另由原Go读库实测。
test('GeoIP status preserves expiration and rejects corrupt or relabeled data', async () => {
  const parent = await realpath('work/antibot-service/reports')
  const base = await mkdtemp(path.join(parent, 'geo-validity-'))
  const built = Date.parse('2026-10-01T01:36:12Z'), expiry = built + 35 * 86400_000
  const files = ['GeoLite2-City.mmdb', 'GeoLite2-ASN.mmdb'] as const
  const bytes = Buffer.from('status-only fixture; not an MMDB')
  const data = { source: 'https://db-ip.com/db/lite.php', license: 'CC-BY-4.0',
    attribution: 'IP Geolocation by DB-IP https://db-ip.com CC BY 4.0', expires: new Date(expiry).toISOString(),
    cityCoordinatesAvailable: false, metadata: {
      'GeoLite2-City.mmdb': { buildEpoch: built / 1000, databaseType: 'DBIP-Country-Lite' },
      'GeoLite2-ASN.mmdb': { buildEpoch: built / 1000, databaseType: 'DBIP-ASN-Lite (compat=GeoLite2-ASN)' },
    }, files: files.map(file => ({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })) }
  const receipt = path.join(base, 'geo-source.json')
  try {
    assert.equal((await geoSourceStatus(base, built)).status, 'unavailable')
    await mkdir(path.join(base, 'data'))
    for (const file of files) await writeFile(path.join(base, 'data', file), bytes)
    await writeFile(receipt, JSON.stringify(data))
    assert.equal((await geoSourceStatus(base, expiry - 1)).status, 'available')
    assert.equal((await geoSourceStatus(base, expiry)).status, 'stale')
    assert.equal((await geoSourceStatus(base, built - 300_001)).status, 'unavailable')
    await writeFile(receipt, JSON.stringify({ ...data, expires: new Date(expiry + 1000).toISOString() }))
    assert.equal((await geoSourceStatus(base, built)).status, 'unavailable')
    await writeFile(receipt, JSON.stringify({ ...data, files: [data.files[0], data.files[0]] }))
    assert.equal((await geoSourceStatus(base, built)).status, 'unavailable')
    await writeFile(receipt, JSON.stringify(data))
    await writeFile(path.join(base, 'data', files[0]), 'corrupt')
    assert.equal((await geoSourceStatus(base, built)).status, 'unavailable')
  } finally {
    assert.equal(path.dirname(await realpath(base)), parent)
    await rm(base, { recursive: true })
  }
})
