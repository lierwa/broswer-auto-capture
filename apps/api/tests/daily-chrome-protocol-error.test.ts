import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { ws } from '../../../vendor/daily-chrome-extension/wsServer.js'
import { CDPRelayServer } from '../../../vendor/daily-chrome-extension/cdpRelay.js'

// WHY：必须穿过实际 ExtensionConnection/BrowserModel/WS，不能只给 Python 人造已归一化异常。
test('extension JSON protocol errors retain code, message and data over the actual relay', async () => {
  const relay = new CDPRelayServer('chrome', undefined, undefined, undefined, { extensionId: 'fixture' })
  await relay.start()
  const extension = new ws(relay.extensionEndpoint(), { origin: 'chrome-extension://fixture' })
  let client: InstanceType<typeof ws> | undefined, failure = ''
  await once(extension, 'open')
  extension.on('message', (raw: Buffer) => {
    const { id, method, params } = JSON.parse(raw.toString())
    if (method === 'chrome.debugger.sendCommand' && params[1] === 'Fetch.continueRequest') {
      extension.send(JSON.stringify({ id, error: failure })); return
    }
    const result = method === 'chrome.tabs.create' ? { id: 1, windowId: 1, url: 'about:blank' }
      : method === 'chrome.debugger.sendCommand' && params[1] === 'Target.getTargetInfo'
        ? { targetInfo: { targetId: 'owned-target', type: 'page', title: 'fixture', url: 'about:blank' } } : {}
    extension.send(JSON.stringify({ id, result }))
  })
  extension.send(JSON.stringify({ method: 'extension.initialized', params: [] }))
  await relay.extensionReady()
  let sequence = 0
  const request = (method: string, params: unknown = {}, sessionId?: string) => new Promise<any>(resolve => {
    const id = ++sequence
    const listener = (raw: Buffer) => {
      const response = JSON.parse(raw.toString())
      if (response.id === id) { client!.off('message', listener); resolve(response) }
    }
    client!.on('message', listener); client!.send(JSON.stringify({ id, method, params, sessionId }))
  })
  try {
    client = new ws(relay.cdpEndpoint(randomUUID())); await once(client, 'open')
    const created = await request('Target.createTarget', { url: 'about:blank' })
    const attached = await request('Target.attachToTarget', { targetId: created.result.targetId, flatten: true })
    for (const expected of [
      { code: -32602, message: 'Invalid InterceptionId.' },
      { code: -32000, message: 'Invalid InterceptionId.', data: { detail: 'synthetic' } },
      { code: -32602, message: 'Invalid parameters' },
    ]) {
      failure = JSON.stringify(expected)
      assert.deepEqual((await request('Fetch.continueRequest', { requestId: 'gone' }, attached.result.sessionId)).error, expected)
    }
    for (const message of ['Extension disconnected', '{"code":"-32602","message":"Invalid InterceptionId."}', 'null']) {
      failure = message
      assert.deepEqual((await request('Fetch.continueRequest', { requestId: 'gone' }, attached.result.sessionId)).error, { message })
    }
    assert.match((await request('Target.closeTarget', { targetId: 'foreign-target' })).error.message, /not_authorized/)
  } finally { client?.close(); extension.close(); await relay.close() }
})
