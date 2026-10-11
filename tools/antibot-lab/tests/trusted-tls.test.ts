import test from 'node:test'
import assert from 'node:assert/strict'
import {X509Certificate} from 'node:crypto'
import {checkServerIdentity} from 'node:tls'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {directory} from '../locations.mjs'

// 保护实际 HTTPS 回归：会话域必须通过严格主机名验证；顶级通配符不能冒充覆盖。
test('the deployed certificate covers factory and real session hosts without certificate exceptions',async()=>{
  const leaf=new X509Certificate(await readFile(path.join(directory,'tls/cert.pem')))
  const ca=new X509Certificate(await readFile(path.join(directory,'tls/rootCA.pem')))
  assert.equal(leaf.verify(ca.publicKey),true)
  for(const host of ['localhost','owned.shield.localhost']) assert.equal(checkServerIdentity(host,leaf.toLegacyObject()),undefined)
  for(const host of ['owned.localhost','outside.invalid']) assert.ok(checkServerIdentity(host,leaf.toLegacyObject()))
  assert.ok(Date.parse(leaf.validTo)>Date.now())
})
