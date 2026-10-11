import { directory as labData } from '../locations.mjs'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createPrivateTokenVerifier } from '../private-token-verifier.mjs'

// 仅本地合成协议验收；原票据只走父子IPC，不进入参数、文件或标准输出。
async function verifyInChild(message) {
  const base = labData
  const directory = path.dirname(message.database)
  assert.equal(path.dirname(directory), path.join(base, 'reports'))
  assert.match(path.basename(directory), /^private-token-binding-[\w-]+$/)
  assert.equal(path.basename(message.database), 'spent.sqlite')
  const require = createRequire(path.join(base, 'runtime/privacy-pass/package.json'))
  const lib = await import(pathToFileURL(require.resolve('@cloudflare/privacypass-ts')).href)
  const key = await crypto.subtle.importKey('jwk', message.publicKey, message.algorithm, true, ['verify'])
  const challenge = lib.TokenChallenge.deserialize(Uint8Array.from(message.challenge))
  const db = new DatabaseSync(message.database)
  try {
    db.exec('PRAGMA busy_timeout=5000')
    const verify = createPrivateTokenVerifier({ lib, publicKey: key, issuerName: message.issuer,
      consume: digest => db.prepare('INSERT OR IGNORE INTO spent VALUES (?)').run(digest).changes === 1 })
    return await verify(Uint8Array.from(message.token), { challenge, expiresAt: message.expiresAt })
  } finally { db.close() }
}

if (process.argv[2] === '--owned-verifier') {
  process.once('message', async message => {
    try {
      const result = await verifyInChild(message)
      process.send(result, () => process.disconnect())
    } catch {
      process.exitCode = 1
      process.disconnect()
    }
  })
}

export function verifyInProcess(message) {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--owned-verifier'], {
      cwd: process.cwd(), windowsHide: true, serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    let result, failure
    const timer = setTimeout(() => { failure = Error('private_token_child_timeout'); child.kill() }, 15_000)
    child.on('message', value => { result = value })
    child.on('error', error => { failure = error; child.kill() })
    child.once('close', code => {
      clearTimeout(timer)
      if (failure || code !== 0 || !result) reject(failure ?? Error('private_token_child_failed'))
      else resolve({ ...result, pid: child.pid, exited: true })
    })
    child.send(message, error => { if (error) { failure = error; child.kill() } })
  })
}
