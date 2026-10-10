import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { cadenceSchema, cadenceObservations } from '../../../tools/antibot-lab/cadence.ts'

const base = fileURLToPath(new URL('../../../work/antibot-service', import.meta.url))
const sample = { keyCount: 11, intervals: Array(10).fill(10), dwellTimes: Array(11).fill(5),
  pending: 0, excluded: false, invalid: false }

test('original cadence requires complete evidence and preserves paste, repeat and IME exclusions', async () => {
  for (const [data, outcome] of [
    [sample, 'detected'], [{ ...sample, intervals: Array(10).fill(150) }, 'clear'],
    [{ ...sample, dwellTimes: [] }, 'incomplete'], [{ ...sample, pending: 1 }, 'incomplete'],
    [{ ...sample, excluded: true }, 'excluded'], [{ ...sample, invalid: true }, 'invalid'],
    [{ ...sample, keyCount: 1, intervals: [], dwellTimes: [5] }, 'unavailable'],
  ] as const) {
    const rows = await cadenceObservations(base, cadenceSchema.parse(data))
    assert.equal(rows[0]!.outcome, outcome)
    assert.equal(rows[0]!.valid, String(['clear', 'detected'].includes(outcome)))
  }
  assert.deepEqual(await cadenceObservations(base), [])
})

test('cadence never accepts input content or reports a missing classifier as clear', async () => {
  for (const extra of [{ key: 'private' }, { fieldName: 'private' }, { text: 'private' }]) {
    assert.equal(cadenceSchema.safeParse({ ...sample, ...extra }).success, false)
  }
  assert.equal(cadenceSchema.safeParse({ ...sample, intervals: [-1] }).success, false)
  assert.equal((await cadenceObservations(base+'/nonexistent-cadence-source', sample))[0]!.outcome, 'error')
})
