import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { IncomingMessage } from 'node:http'
import { setTimeout } from 'node:timers/promises'
import { createCaptchaGate } from '../captcha.ts'

// 保护真实协议边界；答案只在注入的测试渲染器闭包内，不写入服务、快照或日志。
function fixture(ttl = 300_000) {
  let answer = ''
  const gate = createCaptchaGate(value => { answer = value; return '<svg></svg>' }, ttl)
  const request = (method: string, cookie = '', extra = {}) => ({ method, headers: {
    host: 'case.localhost:4187', origin: 'http://case.localhost:4187', 'user-agent': 'test', cookie, ...extra,
  } }) as IncomingMessage
  async function start() {
    const reply = await gate(request('GET'), 'case', async () => '')
    assert.equal(reply.status, 401)
    assert.ok(!reply.content.includes(answer), 'plaintext_answer_disclosed')
    const cookie = reply.headers!['set-cookie']!.split(';')[0]!
    const challenge = /name="challenge" value="([^"]+)"/.exec(reply.content)![1]!
    return { cookie, body: new URLSearchParams({ challenge, answer }).toString() }
  }
  return { gate, request, start }
}
test('manual answer creates scoped admission and consumed challenge cannot replay', async () => {
  const f = fixture(), first = await f.start()
  const passed = await f.gate(f.request('POST', first.cookie), 'case', async () => first.body)
  assert.equal(passed.status, 303)
  assert.equal((await f.gate(f.request('POST', first.cookie), 'case', async () => first.body)).status, 403)
  const cookie = passed.headers!['set-cookie']!.split(';')[0]!
  assert.equal((await f.gate(f.request('GET', cookie), 'case', async () => '')).status, 200)
  assert.equal((await f.gate(f.request('GET', cookie), 'other', async () => '')).status, 401)
  assert.equal((await f.gate(f.request('GET', cookie, { 'user-agent': 'different' }), 'case', async () => '')).status, 401)
})
test('missing, cross-session, cross-origin and wrong answers never grant admission', async () => {
  const f = fixture(), first = await f.start(), other = await f.start()
  assert.equal((await f.gate(f.request('POST'), 'case', async () => first.body)).status, 403)
  assert.equal((await f.gate(f.request('POST', other.cookie), 'case', async () => first.body)).status, 403)
  assert.equal((await f.gate(f.request('POST', first.cookie, { origin: 'https://other.invalid' }), 'case', async () => first.body)).status, 403)
  const wrong = new URLSearchParams(first.body); wrong.set('answer', 'wrong')
  assert.equal((await f.gate(f.request('POST', first.cookie), 'case', async () => wrong.toString())).status, 401)
  assert.equal((await f.gate(f.request('POST', first.cookie), 'case', async () => first.body)).status, 403)
})
test('expired admission and outstanding challenge both fail closed', async () => {
  const f = fixture(10), first = await f.start(), second = await f.start()
  const passed = await f.gate(f.request('POST', first.cookie), 'case', async () => first.body)
  assert.equal(passed.status, 303)
  await setTimeout(30)
  assert.equal((await f.gate(f.request('POST', second.cookie), 'case', async () => second.body)).status, 403)
  const cookie = passed.headers!['set-cookie']!.split(';')[0]!
  assert.equal((await f.gate(f.request('GET', cookie), 'case', async () => '')).status, 401)
})
