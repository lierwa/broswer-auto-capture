import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ExtensionProtocolV2 } from '../../../vendor/daily-chrome-extension/cdpRelayV2.js'

test('debugger detach retains only owned physical-tab cleanup, without reattachment', async () => {
  // 不变量：断开的控制会话不再可运行，但实际tab必须被清理；个人/未知target不可关闭。
  const removed: number[] = [], calls: string[] = [], messages: any[] = []
  const handler = new ExtensionProtocolV2(async (method, params) => {
    calls.push(method)
    if (method === 'chrome.tabs.remove') { removed.push(params[0]); return }
    if (method === 'chrome.debugger.attach') return
    return { targetInfo: { targetId: 'owned', type: 'page', url: 'https://fixture.test/' } }
  })
  handler.connectOverCDP(message => messages.push(message))
  handler.handleExtensionEvent('chrome.tabs.onCreated', [{ id: 7, windowId: 1 }])
  await handler.handleCDPCommand('Target.setAutoAttach', {}, undefined)
  handler.handleExtensionEvent('chrome.debugger.onDetach', [{ tabId: 7 }, 'target_closed'])
  assert.deepEqual((await handler.handleCDPCommand('Target.getTargets', {}, undefined))?.result.targetInfos, [])
  await handler.handleCDPCommand('Target.setAutoAttach', {}, undefined)
  assert.equal(calls.filter(method => method === 'chrome.debugger.attach').length, 1)
  assert.equal((await handler.handleCDPCommand('Target.closeTarget', { targetId: 'personal' }, undefined))?.result.success, false)
  assert.equal((await handler.handleCDPCommand('Target.closeTarget', { targetId: 'owned' }, undefined))?.result.success, true)
  assert.equal((await handler.handleCDPCommand('Target.closeTarget', { targetId: 'owned' }, undefined))?.result.success, true)
  assert.deepEqual(removed, [7])
  assert.equal(messages.filter(message => message.method === 'Target.detachedFromTarget').length, 1)
})

test('extension permits cleanup after debugger detach until physical onRemoved', async () => {
  const module = new URL('../../../vendor/daily-chrome-extension/extension/src/relayConnection.ts', import.meta.url).href
  const { RelayConnection } = await import(module)
  const listeners = new Map<string, (...args: any[]) => void>()
  const event = (name: string) => ({ addListener: (fn: (...args: any[]) => void) => listeners.set(name, fn), removeListener() {} })
  const previous = (globalThis as any).chrome, removed: number[] = [], messages: any[] = []
  ;(globalThis as any).chrome = {
    debugger: { onEvent: event('event'), onDetach: event('detach'), attach: async () => {}, detach: async () => {} },
    tabs: { onCreated: event('created'), onRemoved: event('removed'), remove: async (id: number) => removed.push(id) },
  }
  const socket: any = { readyState: WebSocket.OPEN, send: (text: string) => messages.push(JSON.parse(text)), close() {} }
  const relay = new RelayConnection(socket)
  const command = async (id: number, method: string, params: unknown[]) => {
    socket.onmessage({ data: JSON.stringify({ id, method, params }) })
    await new Promise(resolve => setImmediate(resolve))
    return messages.find(message => message.id === id)
  }
  try {
    relay.attachTab({ id: 7, windowId: 1 })
    await command(1, 'chrome.debugger.attach', [{ tabId: 7 }, '1.3'])
    listeners.get('detach')!({ tabId: 7 }, 'target_closed')
    assert.equal(relay.attachedTabs.size, 0)
    assert.equal((await command(2, 'chrome.tabs.remove', [7])).error, undefined)
    listeners.get('removed')!(7, { windowId: 1, isWindowClosing: true })
    assert.ok((await command(3, 'chrome.tabs.remove', [7])).error)
    assert.ok((await command(4, 'chrome.tabs.remove', [9])).error)
    assert.deepEqual(removed, [7])
    assert.equal(messages.filter(message => message.method === 'chrome.tabs.onRemoved').length, 1)
  } finally { relay.close('fixture complete'); (globalThis as any).chrome = previous }
})
