import { createHash, timingSafeEqual } from 'node:crypto'

const digest = bytes => createHash('sha256').update(bytes).digest()
const equal = (left, right) => left.length === right.length && timingSafeEqual(left, right)

// WHY：RFC9577 2.2.3的应用绑定不属于原Origin.verify。密码操作/编码仍只由官方库承担。
// issuer/challenge必须来自调用方固定的受信配置；不得根据客户端token动态选公钥或获取issuer。
export function createPrivateTokenVerifier({ lib, publicKey, issuerName, consume }) {
  const type = lib.TOKEN_TYPES.BLIND_RSA
  const origin = new lib.publicVerif.Origin(lib.publicVerif.BlindRSAMode.PSS)
  const keyId = lib.publicVerif.getPublicKeyBytes(publicKey).then(digest)
  if (!issuerName || typeof consume !== 'function') throw Error('private_token_configuration_required')

  return async function verify(bytes, { challenge, expiresAt }) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 2 + 32 + 32 + type.Nid + type.Nk) {
      return { accepted: false, reason: 'invalid_length' }
    }
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { accepted: false, reason: 'expired' }
    if (challenge.tokenType !== type.value || challenge.issuerName !== issuerName) {
      return { accepted: false, reason: 'challenge_configuration' }
    }
    try {
      // 原解析器不保留byteOffset；复制为独立buffer，不接受它会静默截掉的尾随字节。
      const token = lib.Token.deserialize(type, Uint8Array.from(bytes))
      if (!equal(token.authInput.tokenKeyId, await keyId)) return { accepted: false, reason: 'wrong_issuer_key' }
      if (!equal(token.authInput.challengeDigest, digest(challenge.serialize()))) {
        return { accepted: false, reason: 'wrong_challenge' }
      }
      if (!await origin.verify(token, publicKey)) return { accepted: false, reason: 'invalid_signature' }
      if (expiresAt <= Date.now()) return { accepted: false, reason: 'expired' }
      // 消费必须在验签之后原子落到原持久存储；不能只靠进程内Set，也不能先消耗无效票。
      const key = digest(Buffer.concat([await keyId, token.authInput.nonce])).toString('hex')
      if (!await consume(key)) return { accepted: false, reason: 'replayed' }
      return { accepted: true, reason: 'verified_local_protocol' }
    } catch { return { accepted: false, reason: 'verification_unavailable' } }
  }
}
