// Protect owned worker cleanup on success, CSP failure, decode failure and timeout.
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { workerOptions } from '../../../tools/antibot-lab/tests/creep-worker-options.mjs'

const require = createRequire(path.resolve('work/antibot-service/runtime/creep-build/package.json'))
const plugin = workerOptions(require('typescript'))
const source = plugin.load(path.resolve('work/antibot-service/runtime/creepjs-10aa6724cd33a1015db1574211890518cd04f0cc/src/worker/index.ts')).code
const body = source.slice(source.indexOf('const getDedicatedWorker ='), source.indexOf('const getSharedWorker ='))

test('upstream dedicated worker adapter releases every created worker', async () => {
  for (const mode of ['message', 'error', 'messageerror', 'timeout', 'constructor-refused']) {
    let instance, timeout, cleared = 0, terminated = 0
    class Worker {
      constructor(url) {
        if (mode === 'constructor-refused') throw Error('SecurityError')
        assert.equal(url, '/measurement/worker/creep.js'); instance = this
      }
      terminate() { terminated++ }
    }
    const run = new Function('Worker', 'ask', 'hasConstructor', 'setTimeout', 'clearTimeout',
      body + "return getDedicatedWorker({scriptSource:'/measurement/worker/creep.js'});")
    const result = run(Worker, fn => { try { return fn() } catch { return null } },
      (value, name) => value?.constructor.name === name,
      (fn, ms) => { assert.equal(ms, 3000); timeout = fn; return 7 },
      token => { assert.equal(token, 7); cleared++ })
    if (mode === 'message') instance.onmessage({ data: { userAgent: 'test' } })
    if (mode === 'error') instance.onerror()
    if (mode === 'messageerror') instance.onmessageerror()
    if (mode === 'timeout') timeout()
    assert.deepEqual(await result, mode === 'message' ? { userAgent: 'test' } : null)
    assert.equal(terminated, mode === 'constructor-refused' ? 0 : 1)
    assert.equal(cleared, terminated)
  }
})
