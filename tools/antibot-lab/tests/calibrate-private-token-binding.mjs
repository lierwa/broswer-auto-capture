import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPrivateTokenVerifier } from '../private-token-verifier.mjs'
import { verifyInProcess } from './private-token-process.mjs'

const base = path.resolve('work/antibot-service')
const require = createRequire(path.join(base, 'runtime/privacy-pass/package.json'))
const lib = await import(pathToFileURL(require.resolve('@cloudflare/privacypass-ts')).href)
const { Client, Issuer, Origin, BlindRSAMode, getPublicKeyBytes } = lib.publicVerif
assert.ok(process.argv[2], 'pass the preceding native protocol results.json path')
const prior = JSON.parse(await readFile(path.resolve(process.argv[2]), 'utf8'))
const lock = JSON.parse(await readFile(path.join(base, 'runtime/privacy-pass/package-lock.json'), 'utf8'))
assert.ok(prior.localSignatureCalibrationPassed)
assert.equal(prior.source, '4edc0e2bf639a60142a3f809d38ce7bd5c6f8c9e')
for (const item of prior.packages) assert.equal(lock.packages['node_modules/' + item.name].integrity, item.integrity)
const out = await mkdtemp(path.join(base, 'reports/private-token-binding-'))
let db = new DatabaseSync(path.join(out, 'spent.sqlite'))
db.exec('CREATE TABLE spent (key TEXT PRIMARY KEY)')
const consume = key => db.prepare('INSERT OR IGNORE INTO spent VALUES (?)').run(key).changes === 1
const mode = BlindRSAMode.PSS
const keys = await Issuer.generateKey(mode, { modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) })
const issuer = new Issuer(mode, 'owned-issuer.invalid', keys.privateKey, keys.publicKey)
const origin = new Origin(mode, ['owned-origin.invalid'])
const challenge = origin.createTokenChallenge(issuer.name, crypto.getRandomValues(new Uint8Array(32)))
const input = { challenge, expiresAt: Date.now() + 60_000 }
const keyBytes = await getPublicKeyBytes(keys.publicKey)
const verifier = createPrivateTokenVerifier({ lib, publicKey: keys.publicKey, issuerName: issuer.name, consume })
async function mint(chl = challenge) {
  const client = new Client(mode)
  return (await client.finalize(await issuer.issue(await client.createTokenRequest(chl, keyBytes)))).serialize()
}
const rows = []
async function expect(name, bytes, context, expected) {
  const result = await verifier(bytes, context)
  rows.push({ name, ...result })
  await writeFile(path.join(out, 'controls.json'), JSON.stringify(rows, null, 2))
  assert.equal(result.reason, expected, name)
}

try {
  if (process.argv.includes('--processes')) {
    const payload = { database: path.join(out, 'spent.sqlite'), issuer: issuer.name,
      publicKey: await crypto.subtle.exportKey('jwk', keys.publicKey),
      algorithm: { name: keys.publicKey.algorithm.name, hash: keys.publicKey.algorithm.hash },
      challenge: challenge.serialize(), expiresAt: input.expiresAt, token: await mint() }
    const first = await verifyInProcess(payload)
    const restarted = await verifyInProcess(payload)
    assert.equal(first.reason, 'verified_local_protocol')
    assert.equal(restarted.reason, 'replayed')
    assert.notEqual(first.pid, restarted.pid)
    const concurrent = { ...payload, token: await mint() }
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyInProcess(concurrent)))
    const proof = { first, restarted, concurrent: results, concurrentAccepted: results.filter(r => r.accepted).length,
      allChildrenExited: [first, restarted, ...results].every(r => r.exited), rawTokensPersisted: false,
      privateKeyPersisted: false, realTrustedIssuer: false, hardwareAttestation: false, onlineShieldIntegrated: false, modelCalls: 0 }
    await writeFile(path.join(out, 'process-results.json'), JSON.stringify(proof, null, 2))
    assert.equal(proof.concurrentAccepted, 1)
    assert.equal(new Set(results.map(row => row.pid)).size, 8)
    assert.equal(db.prepare('SELECT count(*) n FROM spent').get().n, 2)
    await writeFile(path.join(out, 'passed.json'), JSON.stringify(proof, null, 2))
    console.log(JSON.stringify({ evidence: out, independentProcesses: 10, concurrentAccepted: 1, modelCalls: 0 }))
  } else {
  const token = await mint()
  await expect('trailing-byte', new Uint8Array([...token, 0]), input, 'invalid_length')
  await expect('truncated', token.slice(0, -1), input, 'invalid_length')
  await expect('missing-token', undefined, input, 'invalid_length')
  await expect('expired', token, { ...input, expiresAt: Date.now() - 1 }, 'expired')
  const other = new Origin(mode, ['other-origin.invalid']).createTokenChallenge(issuer.name, crypto.getRandomValues(new Uint8Array(32)))
  await expect('valid-signature-wrong-context', await mint(other), input, 'wrong_challenge')
  await expect('wrong-configured-issuer', token, { ...input,
    challenge: origin.createTokenChallenge('other-issuer.invalid', crypto.getRandomValues(new Uint8Array(32))) }, 'challenge_configuration')
  for (const [name, offset, expected] of [['nonce', 2, 'invalid_signature'], ['key-id', 66, 'wrong_issuer_key'],
    ['digest', 34, 'wrong_challenge'], ['signature', 353, 'invalid_signature']]) {
    const tampered = token.slice(); tampered[offset] ^= 1
    await expect(name, tampered, input, expected)
  }
  assert.equal(db.prepare('SELECT count(*) n FROM spent').get().n, 0, 'invalid-token-consumed')
  const offset = new Uint8Array(token.length + 3); offset.set(token, 3)
  await expect('normal-with-byte-offset', offset.subarray(3), input, 'verified_local_protocol')
  await expect('same-token-replay', token, input, 'replayed')
  db.close(); db = new DatabaseSync(path.join(out, 'spent.sqlite'))
  await expect('same-token-after-db-reopen', token, input, 'replayed')
  const concurrent = await mint()
  const results = await Promise.all(Array.from({ length: 8 }, () => verifier(concurrent, input)))
  assert.equal(results.filter(r => r.accepted).length, 1)
  const unavailable = createPrivateTokenVerifier({ lib, publicKey: keys.publicKey, issuerName: issuer.name,
    consume: () => { throw Error('owned-store-unavailable') } })
  assert.equal((await unavailable(await mint(), input)).reason, 'verification_unavailable')
  const proof = { controls: rows.length, concurrentAttempts: 8, concurrentAccepted: 1,
    unavailableStoreRejected: true, rawTokensPersisted: false, privateKeyPersisted: false,
    realTrustedIssuer: false, hardwareAttestation: false, onlineShieldIntegrated: false, modelCalls: 0 }
  await writeFile(path.join(out, 'passed.json'), JSON.stringify(proof, null, 2))
  console.log(JSON.stringify({ evidence: out, ...proof }))
  }
} finally { db.close() }
