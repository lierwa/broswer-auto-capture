import assert from 'node:assert/strict'
import test from 'node:test'
import { identityObservations, identitySchema } from '../identity.ts'

const client = { userAgent: 'public-browser', hints: { brands: [
  { brand: 'Example Browser', version: '12.1' }, { brand: 'Not;A,Brand', version: '99' }],
  platform: 'ExampleOS', mobile: false } }
const headers = { 'user-agent': client.userAgent,
  'sec-ch-ua': ' "Not;A,Brand";v="99", "Example Browser";v="12.1"',
  'sec-ch-ua-platform': '"ExampleOS"', 'sec-ch-ua-mobile': '?0' }

test('RFC quoting, unknown brands, significant versions and list ordering are valid', () => {
  assert(identityObservations(headers, client).every(row => row.valid === 'true' && row.outcome === 'clear'))
  const reversed = { ...client, hints: { ...client.hints, brands: [...client.hints.brands].reverse() } }
  assert(identityObservations(headers, reversed).every(row => row.outcome === 'clear'))
})

test('missing, malformed and oversized wire values cannot become healthy negatives', () => {
  for (const raw of ['"Example Browser";v=12', '"Example Browser";v="12",', '("nested");v="12"', 'x'.repeat(4097)]) {
    const row = identityObservations({ ...headers, 'sec-ch-ua': raw }, client)[1]!
    assert.equal(row.valid, 'false'); assert.equal(row.outcome, 'invalid')
  }
  assert.equal(identityObservations({ ...headers, 'sec-ch-ua-mobile': '?2' }, client)[2]!.outcome, 'invalid')
  assert.equal(identityObservations({ ...headers, 'sec-ch-ua-platform': 'baretoken' }, client)[3]!.outcome, 'invalid')
  assert(identityObservations({}, client).every(row => row.valid === 'false' && row.outcome === 'unavailable'))
  assert(identityObservations(headers).every(row => row.outcome === 'unavailable'))
  const noHints = identityObservations(headers, { userAgent: client.userAgent, hints: null })
  assert.equal(noHints[0]!.outcome, 'clear')
  assert(noHints.slice(1).every(row => row.outcome === 'unavailable'))
  const restricted = identitySchema.parse({ userAgent: client.userAgent, hints: { brands: [], platform: '', mobile: false } })
  assert.deepEqual(identityObservations(headers, restricted).map(row => row.outcome),
    ['clear', 'unavailable', 'clear', 'unavailable'])
})

test('opted-in high entropy fields preserve empty model, list order and missing evidence', () => {
  const highEntropy = { architecture: 'x86', bitness: '64', model: '', platformVersion: '19.0.0', wow64: false,
    fullVersionList: [{ brand: 'Example Browser', version: '12.1.2.3' }, { brand: 'Not;A,Brand', version: '99.0.0.0' }] }
  const extended = { ...client, highEntropy }
  const wire = { ...headers, 'sec-ch-ua-arch': '"x86"', 'sec-ch-ua-bitness': '"64"', 'sec-ch-ua-model': '""',
    'sec-ch-ua-platform-version': '"19.0.0"', 'sec-ch-ua-wow64': '?0',
    'sec-ch-ua-full-version-list': '"Not;A,Brand";v="99.0.0.0", "Example Browser";v="12.1.2.3"' }
  const expected = ['architecture', 'bitness', 'model', 'platformVersion', 'wow64', 'fullVersionList']
  const rows = identityObservations(wire, extended).slice(4)
  assert.deepEqual(rows.map(row => row.detector).sort(), expected.sort())
  assert(rows.every(row => row.valid === 'true' && row.outcome === 'clear'))
  identitySchema.parse(extended)
  for (const name of expected) {
    const changed = { ...highEntropy, [name]: name === 'wow64' ? true : name === 'fullVersionList'
      ? [{ brand: 'Other', version: '3' }] : 'owned-other' }
    const mismatch = identityObservations(wire, { ...client, highEntropy: changed }).filter(row => row.outcome === 'mismatch')
    assert.deepEqual(mismatch.map(row => row.detector), [name])
  }
  assert(identityObservations(headers, extended).slice(4).every(row => row.outcome === 'unavailable'))
  assert(identityObservations(wire, { ...client, highEntropy: null }).slice(4).every(row => row.outcome === 'unavailable'))
  assert.equal(identityObservations({ ...wire, 'sec-ch-ua-wow64': '?2' }, extended).find(row => row.detector === 'wow64')?.outcome, 'invalid')
})

test('form-factor string lists compare content without erasing values or case', () => {
  const highEntropy = { architecture: null, bitness: null, model: null, platformVersion: null,
    wow64: null, fullVersionList: null, formFactors: ['Tablet', 'Mobile'] as string[] | null }
  const result = (raw: string | undefined, value = highEntropy) => identityObservations(
    { ...headers, 'sec-ch-ua-form-factors': raw }, { ...client, highEntropy: value }).find(row => row.detector === 'formFactors')
  assert.equal(result('"Mobile", "Tablet"')?.outcome, 'clear')
  assert.equal(result('"Desktop", "Tablet"')?.outcome, 'mismatch')
  assert.equal(result('"mobile", "Tablet"')?.outcome, 'mismatch')
  for (const raw of ['Desktop', '("Mobile")', '"Mobile",', '?1', '42']) assert.equal(result(raw)?.outcome, 'invalid')
  assert.equal(result(undefined)?.outcome, 'unavailable')
  assert.equal(result('"Mobile"', { ...highEntropy, formFactors: null })?.outcome, 'unavailable')
  assert.equal(result('"Mobile"', { ...highEntropy, formFactors: [] })?.outcome, 'unavailable')
  identitySchema.parse({ ...client, highEntropy })
})
