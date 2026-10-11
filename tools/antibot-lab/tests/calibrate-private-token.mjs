import { directory as labData } from '../locations.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const base = labData
const runtime = path.join(base, 'runtime/privacy-pass')
const require = createRequire(path.join(runtime, 'package.json'))
const lib = await import(pathToFileURL(require.resolve('@cloudflare/privacypass-ts')).href)
const { TOKEN_TYPES, Token, TokenChallenge, AuthorizationHeader, WWWAuthenticateHeader, publicVerif } = lib
const { Client, Issuer, Origin, BlindRSAMode, getPublicKeyBytes } = publicVerif
const out = await mkdtemp(path.join(base, 'reports/private-token-'))
const report = { source: '4edc0e2bf639a60142a3f809d38ce7bd5c6f8c9e', controls: {},
  network: 'registry metadata only', privateKeyPersisted: false, rawTokensPersisted: false,
  realTrustedIssuer: false, hardwareAttestation: false, productionAccepted: false }
const save = () => writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2))

async function verifyDependencies() {
  const lock = JSON.parse(await readFile(path.join(runtime, 'package-lock.json'), 'utf8'))
  const packages = []
  for (const [location, item] of Object.entries(lock.packages)) {
    if (!location) continue
    const name = location.slice('node_modules/'.length)
    const response = await fetch(`https://registry.npmjs.org/${name}/${item.version}`)
    assert.ok(response.ok)
    const official = await response.json()
    assert.equal(official.dist.integrity, item.integrity, 'official-package-integrity:' + name)
    if (name === '@cloudflare/privacypass-ts') assert.equal(official.gitHead, report.source)
    packages.push({ name, version: item.version, integrity: item.integrity, license: official.license })
  }
  report.packages = packages
}

async function rejected(name, action) {
  let result
  try { result = await action() } catch { result = false }
  report.controls[name] = result === false ? 'rejected' : 'accepted'
  await save()
  assert.equal(result, false, name)
}

async function calibrate() {
  const type = TOKEN_TYPES.BLIND_RSA, mode = BlindRSAMode.PSS
  const generate = () => Issuer.generateKey(mode, { modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) })
  const keys = await generate(), wrong = await generate()
  const issuer = new Issuer(mode, 'owned-issuer.invalid', keys.privateKey, keys.publicKey)
  const origin = new Origin(mode, ['owned-origin.invalid'])
  const publicBytes = await getPublicKeyBytes(keys.publicKey)
  const challenge = origin.createTokenChallenge(issuer.name, crypto.getRandomValues(new Uint8Array(32)))
  const parsed = WWWAuthenticateHeader.parse(new WWWAuthenticateHeader(challenge, publicBytes).toString())[0]
  assert.deepEqual(parsed.challenge.serialize(), challenge.serialize())
  const client = new Client(mode)
  const request = await client.createTokenRequest(parsed.challenge, parsed.tokenKey)
  const response = await issuer.issue(request)
  const token = await client.finalize(response)
  const encoded = token.serialize()
  assert.equal(encoded.length, 354)
  const fromHeader = AuthorizationHeader.parse(type, new AuthorizationHeader(token).toString())[0].token
  assert.equal(await origin.verify(fromHeader, keys.publicKey), true)
  report.controls['normal-blind-issuance-and-header'] = 'accepted'
  await rejected('finalize-twice', () => client.finalize(response))
  await rejected('wrong-key', () => origin.verify(token, wrong.publicKey))
  for (const [name, offset] of [['nonce', 2], ['challenge-digest', 34], ['key-id', 66], ['signature', 353]]) {
    const bytes = encoded.slice(); bytes[offset] ^= 1
    await rejected('changed-' + name, () => origin.verify(Token.deserialize(type, bytes), keys.publicKey))
  }
  for (const [name, bytes] of [['truncated', encoded.slice(0, -1)], ['empty', new Uint8Array()],
    ['unknown-type', new Uint8Array([0, 3, ...encoded.slice(2)])]]) {
    await rejected(name, () => origin.verify(Token.deserialize(type, bytes), keys.publicKey))
  }
  await rejected('malformed-header', () => AuthorizationHeader.parse(type, 'PrivateToken token="!"'))
  // WHY：原密码原语只核签名；把未提供的上下文/防重放能力如实记录，不能当成完整盾。
  const other = new Origin(mode, ['different-origin.invalid'])
  report.controls['other-origin-signature-only'] = await other.verify(token, keys.publicKey)
  report.controls['same-token-repeated-signature-only'] = await origin.verify(token, keys.publicKey)
  report.controls['trailing-token-byte'] = await origin.verify(Token.deserialize(type,
    new Uint8Array([...encoded, 0])), keys.publicKey)
  const bytes = challenge.serialize()
  report.controls['trailing-challenge-byte-ignored'] = Buffer.from(TokenChallenge.deserialize(
    new Uint8Array([...bytes, 0])).serialize()).equals(Buffer.from(bytes))
  report.controls['empty-issuer-constructible'] = new TokenChallenge(type.value, '', new Uint8Array()).issuerName === ''
  const wrapped = new Uint8Array(encoded.length + 3); wrapped.set(encoded, 3)
  try { report.controls['nonzero-byte-offset'] = await origin.verify(Token.deserialize(type, wrapped.subarray(3)), keys.publicKey) }
  catch { report.controls['nonzero-byte-offset'] = false }
  report.localSignatureCalibrationPassed = true
  await save()
}

try { await verifyDependencies(); await calibrate(); console.log(JSON.stringify({ evidence: out, ...report.controls })) }
catch (error) { report.failure = error.code ?? error.name; await save(); throw error }
