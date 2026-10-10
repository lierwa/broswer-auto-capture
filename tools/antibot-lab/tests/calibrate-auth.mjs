import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const base = path.resolve('work/antibot-service')
const require = createRequire(path.join(base, 'runtime/auth/package.json'))
const { sign, verify, generateNonce } = require('web-bot-auth')
const { signerFromJWK, verifierFromJWK } = require('web-bot-auth/crypto')
const lock = JSON.parse(await readFile(path.join(base, 'runtime/auth/package-lock.json'), 'utf8'))
const packages = []
for (const [location, item] of Object.entries(lock.packages)) {
  if (!location) continue
  const name = location.slice('node_modules/'.length)
  const response = await fetch(`https://registry.npmjs.org/${name}/${item.version}`)
  assert.ok(response.ok)
  const official = await response.json()
  assert.equal(official.dist.integrity, item.integrity, `official-integrity:${name}`)
  packages.push({ name, version: item.version, integrity: item.integrity, commit: official.gitHead ?? null, license: official.license })
}
const key = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
// Node24导出alg=Ed25519；固定库0.2.0依RFC8037使用EdDSA这个JWK算法标识。
const signer = await signerFromJWK({ ...await crypto.subtle.exportKey('jwk', key.privateKey), alg: 'EdDSA' })
const verifier = await verifierFromJWK({ ...await crypto.subtle.exportKey('jwk', key.publicKey), alg: 'EdDSA' })
const agent = 'sig1="https://owned-signature.invalid";type=directory'
const request = new Request('https://owned-target.invalid/', { headers: { 'Signature-Agent': agent } })
const fields = await sign(request, { signer, created: new Date(), expires: new Date(Date.now() + 300000), nonce: generateNonce() })
const signed = new Request(request, { headers: { ...Object.fromEntries(request.headers),
  Signature: fields.signature, 'Signature-Input': fields.signatureInput } })
const resolver = candidate => { if (candidate.keyid !== verifier.keyid) throw Error('unknown-key'); return verifier }
const normal = await verify(signed, { resolver })
assert.equal(normal.keyid, verifier.keyid)
const rejected = []
async function rejects(name, action) {
  await assert.rejects(action)
  rejected.push(name)
}
await rejects('missing-signature', () => verify(request, { resolver }))
await rejects('expired', () => verify(signed, { resolver, now: new Date(Date.now() + 600000) }))
await rejects('future-created', () => verify(signed, { resolver, now: new Date(Date.now() - 600000) }))
await rejects('wrong-authority', () => verify(new Request('https://changed.invalid/', { headers: signed.headers }), { resolver }))
const tampered = new Headers(signed.headers)
tampered.set('Signature', fields.signature.replace(/:[A-Za-z0-9+/]/, ':!'))
await rejects('malformed-signature', () => verify(new Request(request, { headers: tampered }), { resolver }))
await rejects('unknown-key', () => verify(signed, { resolver: () => { throw Error('unknown-key') } }))
const used = new Set()
const validate = signature => {
  if (!signature.nonce || used.has(signature.nonce)) return false
  used.add(signature.nonce); return true
}
await verify(signed, { resolver, validate })
await rejects('replayed-nonce', () => verify(signed, { resolver, validate }))
await writeFile(path.join(base, 'reports/web-bot-auth-calibration.json'), JSON.stringify({ packages, normal: true, rejected,
  realTrustedIssuer: false, provesHuman: false, hardwareAttestation: false,
  replayStorage: 'test callback only; no production cache implemented', network: 'registry metadata only; signed requests never sent',
  privateKeyPersisted: false }, null, 2))
console.log(JSON.stringify({ normal: true, rejected, realTrustedIssuer: false }))
