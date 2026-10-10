import type { IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'
import { csrfSync } from 'csrf-sync'
import { LRUCache } from 'lru-cache'
import { page } from './pages.ts'

type State = { scope: string; csrfToken?: string | null }
type Reply = { status: number; content: string | object; headers?: Record<string, string>; outcome: string }
const csrf = csrfSync()
const asset = `document.querySelector('#spa').onclick=async()=>{
  history.pushState(null,'','#confirmation');
  const form=document.querySelector('form');
  const response=await fetch(form.action,{method:'POST',headers:{'x-csrf-token':form.elements.csrf.value}});
  document.querySelector('#result').textContent=response.ok?'已完成':'未通过';
};`

// WHY：前置状态验证交给原csrf-sync；TTL由已有LRU承担，例行访问不旋转token误伤缓存/返回。
export function createFlowFixture(ttl = 600_000) {
  const states = new LRUCache<string, State>({ max: 1000, ttl })
  return async (req: IncomingMessage, id: string, action: string | undefined,
    readBody: () => Promise<string>): Promise<Reply> => {
    const prefix = `/case/${id}/flow`, secure = req.headers['x-forwarded-proto'] === 'https'
    if (action === 'asset.js' && req.method === 'GET') return { status: 200, content: asset, outcome: 'asset',
      headers: { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=300, immutable' } }
    if (action === 'redirect' && req.method === 'GET') return {
      status: 303, content: '', headers: { location: prefix }, outcome: 'redirect' }
    const cookie = (req.headers.cookie ?? '').split(';').map(v => v.trim())
      .find(v => v.startsWith('bat_lab_flow='))?.slice(13) ?? ''
    const found = states.get(cookie)
    let state = found?.scope === id ? found : undefined
    if (!action && req.method === 'GET') {
      const token = state ? cookie : randomUUID()
      state ??= { scope: id }
      const request = { session: state } as Parameters<typeof csrf.generateToken>[0]
      const proof = csrf.generateToken(request)
      states.set(token, state)
      return { status: 200, outcome: 'opened', headers: {
        'set-cookie': `bat_lab_flow=${token}; Path=${prefix}; HttpOnly; SameSite=Strict; Max-Age=600${secure ? '; Secure' : ''}`,
      }, content: page('合成前置流程', `<p>此页验证会话连续性，正常缓存、SPA和重定向均可使用同一前置状态。</p>
        <form method="POST" action="${prefix}/submit"><input type="hidden" name="csrf" value="${proof}">
        <button id="submit" type="submit">提交表单</button></form>
        <button id="spa" type="button">SPA确认</button><p id="result"></p><script src="${prefix}/asset.js" defer></script>`) }
    }
    if (action !== 'submit' || req.method !== 'POST') return { status: 405, content: '', outcome: 'method_rejected' }
    if (req.headers.origin !== `${secure ? 'https' : 'http'}://${req.headers.host}`) return {
      status: 403, content: { accepted: false }, outcome: 'origin_rejected' }
    const form = new URLSearchParams(await readBody())
    const submitted = req.headers['x-csrf-token'] ?? form.get('csrf')
    const request = { session: state ?? {}, headers: { 'x-csrf-token': submitted } } as Parameters<typeof csrf.isRequestValid>[0]
    const accepted = csrf.isRequestValid(request)
    return { status: accepted ? 200 : 403, content: { accepted }, outcome: accepted ? 'accepted' : 'prerequisite_missing' }
  }
}

export const flowFixture = createFlowFixture()
