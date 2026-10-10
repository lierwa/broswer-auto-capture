import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import type { IncomingMessage } from 'node:http'
import { createFlowFixture } from '../flow.ts'

// 保护会话/Origin/TTL边界；不将伪造请求对象当真实浏览器证据。
const request = (method: string, cookie = '', extra = {}) => ({ method, headers: {
  cookie, host: 'fixture.localhost', origin: 'http://fixture.localhost', ...extra,
} }) as IncomingMessage
const empty = async () => ''
async function open(fixture: ReturnType<typeof createFlowFixture>) {
  const reply = await fixture(request('GET'), 'fixture', undefined, empty)
  return { cookie: reply.headers!['set-cookie']!.split(';')[0]!,
    token: /name="csrf" value="([^"]+)"/.exec(String(reply.content))![1]! }
}
test('missing, cross-session, cross-case and cross-origin cannot skip the prerequisite', async () => {
  const f = createFlowFixture(), first = await open(f), second = await open(f)
  assert.equal((await f(request('POST'), 'fixture', 'submit', empty)).status, 403)
  assert.equal((await f(request('POST', second.cookie, { 'x-csrf-token': first.token }), 'fixture', 'submit', empty)).status, 403)
  assert.equal((await f(request('POST', first.cookie, { 'x-csrf-token': first.token }), 'other', 'submit', empty)).status, 403)
  assert.equal((await f(request('POST', first.cookie, { 'x-csrf-token': first.token, origin: 'https://outside.invalid' }), 'fixture', 'submit', empty)).status, 403)
})
test('form, header API, cached navigation and redirect preserve the valid original session', async () => {
  const f = createFlowFixture(), first = await open(f)
  for (let i = 0; i < 2; i++) assert.equal((await f(request('POST', first.cookie), 'fixture', 'submit',
    async () => new URLSearchParams({ csrf: first.token }).toString())).status, 200)
  assert.equal((await f(request('POST', first.cookie, { 'x-csrf-token': first.token }), 'fixture', 'submit', empty)).status, 200)
  const again = await f(request('GET', first.cookie), 'fixture', undefined, empty)
  assert.ok(String(again.content).includes(first.token))
  assert.equal((await f(request('GET'), 'fixture', 'redirect', empty)).headers?.location, '/case/fixture/flow')
  const asset = await f(request('GET'), 'fixture', 'asset.js', empty)
  assert.equal(asset.headers?.['cache-control'], 'public, max-age=300, immutable')
  assert.ok(!String(asset.content).includes(first.token))
})
test('expired and restarted session requires a new prerequisite, never silently accepted', async () => {
  const f = createFlowFixture(10), first = await open(f)
  await setTimeout(30)
  const req = request('POST', first.cookie, { 'x-csrf-token': first.token })
  assert.equal((await f(req, 'fixture', 'submit', empty)).status, 403)
  assert.equal((await createFlowFixture()(req, 'fixture', 'submit', empty)).status, 403)
})
