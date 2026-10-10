// Protect fresh/old candidate activation: previous active features cannot leak into a candidate.
import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { rttAdapterDigest } from '../../../tools/antibot-lab/edge-rtt.ts'

test('candidate capabilities remain explicit, validated and compatible with older builds', async () => {
  const absent = path.join(tmpdir(), 'bat-absent-rtt-' + randomUUID())
  assert.equal(await rttAdapterDigest(absent), undefined)
  assert.equal(await rttAdapterDigest(absent, {}), undefined)
  assert.equal(await rttAdapterDigest(absent, { rttAdapterSha256: 'a'.repeat(64) }), 'a'.repeat(64))
  await assert.rejects(rttAdapterDigest(absent, { rttAdapterSha256: 'partial' }))
  await assert.rejects(rttAdapterDigest(absent, { rttAdapterSha256: false }))
})
