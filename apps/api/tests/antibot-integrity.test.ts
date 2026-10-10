// Protect upstream verdict validity and reduced persistence at the HTTP ingestion boundary.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import test from 'node:test'
import { ingest } from '../../../tools/antibot-lab/telemetry.ts'
import { identitySchema, identityObservations } from '../../../tools/antibot-lab/identity.ts'

test('UA measurement deadline remains invalid evidence, with no invented high entropy values', () => {
  for (const highEntropyValidity of ['timeout', 'error', 'unavailable'] as const) {
    const packet = { userAgent: 'fixture', hints: null, highEntropy: null, highEntropyValidity }
    const rows = identityObservations({}, identitySchema.parse(packet))
    assert.deepEqual(rows.at(-1), { category: 'environment-health', detector: 'ua-high-entropy',
      detector_version: 'ua-ch/structured-headers-2.0.3', valid: 'false', outcome: highEntropyValidity })
    assert(rows.every(row => row.valid === 'false'))
  }
  assert.throws(() => identitySchema.parse({ userAgent: 'fixture', hints: null,
    highEntropy: null, highEntropyValidity: 'measured' }))
  assert.throws(() => identitySchema.parse({ userAgent: 'fixture', hints: null,
    highEntropyValidity: 'timeout' }))
})

for (const scope of ['webgl', 'worker'] as const) test(`${scope} verdict preserves measured, missing and invalid boundaries`, async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'bat-integrity-'))
  const req = new IncomingMessage(new Socket())
  req.headers = { origin: 'https://localhost', host: 'localhost',
    'x-forwarded-proto': 'https', 'x-real-ip': '127.0.0.1' }
  const version = '10aa6724cd33a1015db1574211890518cd04f0cc'
  const packet = (integrity: object) => JSON.stringify({ version: 1, page: randomUUID(), batch: randomUUID(), events: [], dropped: 0,
    ...(scope === 'webgl' ? { integrity } : { workerIntegrity: { version: 'version' in integrity ? integrity.version : version,
      signals: ['platform', 'userAgent', 'hardwareConcurrency', 'deviceMemory'].map(name => {
        const { version: _, ...value } = integrity as Record<string, unknown>; return { name, ...value }
      }) } }) })
  try {
    await mkdir(path.join(base, 'logs'))
    for (const mismatch of [false, true]) await ingest(base, req, 'owned',
      packet({ version, validity: 'measured', mismatch }), () => true)
    for (const validity of ['unavailable', 'error', 'timeout']) await ingest(base, req, 'owned',
      packet({ version, validity, mismatch: null }), () => true)
    for (const invalid of [{ version, validity: 'measured', mismatch: null },
      { version, validity: 'unavailable', mismatch: false }, { version: 'unknown', validity: 'measured', mismatch: false },
      { version, validity: 'measured', mismatch: false, vendor: 'must-not-be-persisted' }]) {
      let claimed = false
      await assert.rejects(ingest(base, req, 'owned', packet(invalid), () => { claimed = true; return true }))
      assert.equal(claimed, false)
    }
    if (scope === 'worker') for (const mode of ['missing', 'duplicate']) {
      const value = JSON.parse(packet({ version, validity: 'measured', mismatch: false }))
      if (mode === 'missing') value.workerIntegrity.signals.pop()
      else value.workerIntegrity.signals[1] = value.workerIntegrity.signals[0]
      let claimed = false
      await assert.rejects(ingest(base, req, 'owned', JSON.stringify(value), () => { claimed = true; return true }))
      assert.equal(claimed, false)
    }
    const text = await readFile(path.join(base, 'logs/observations.jsonl'), 'utf8')
    const rows = text.trim().split('\n').map(line => JSON.parse(line))
      .filter(row => row.detector === (scope === 'webgl' ? 'creepWebglMirror' : 'creepWorker.platform'))
    assert.deepEqual(rows.map(row => [row.category, row.valid, row.outcome]), [
      ['browser-marker', 'true', 'clear'], ['browser-marker', 'true', 'detected'],
      ['environment-health', 'false', 'unavailable'], ['environment-health', 'false', 'error'],
      ['environment-health', 'false', 'timeout'],
    ])
    assert.ok(!text.includes('must-not-be-persisted'))
  } finally { req.destroy(); await rm(base, { recursive: true }) }
})
