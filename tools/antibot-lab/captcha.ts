import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { LRUCache } from 'lru-cache'
import svgCaptcha from 'svg-captcha'
import { page } from './pages.ts'

type Session = { scope: string; challenge: string; answer: Buffer | null; svg: string }
type Reply = { status: number; content: string; headers?: Record<string, string>; outcome: string }
const digest = (value: string) => createHash('sha256').update(value).digest()
// 原1.4.0 README公开svgCaptcha(text, options)，lib/index.js导出可调用函数，但.d.ts漏了该签名。
const renderCaptcha = svgCaptcha as unknown as (text: string, options: typeof svgCaptcha.options) => string

// WHY：仅适配公开图片生成器与原生 TTL 缓存；验证码/答案/通行 cookie 均不持久化。
export function createCaptchaGate(render = (text: string) => renderCaptcha(text, {
  width: 240, height: 90, fontSize: 62, noise: 3, color: true, background: '#f4f6f8',
}), ttl = 300_000) {
  const sessions = new LRUCache<string, Session>({ max: 1000, ttl })
  const scopeFor = (req: IncomingMessage, id: string) => digest(`${id}\n${req.headers['user-agent'] ?? ''}`).toString('hex')
  const cookieFor = (token: string, id: string, secure: boolean) =>
    `bat_lab_captcha=${token}; Path=/case/${id}/captcha; HttpOnly; SameSite=Strict; Max-Age=300${secure ? '; Secure' : ''}`
  function challenge(id: string, scope: string, secure: boolean, message: string): Reply {
    const token = randomUUID(), challenge = randomUUID()
    const answer = Array.from({ length: 6 }, () => randomInt(10)).join('')
    const state = { scope, challenge, answer: digest(answer), svg: render(answer) }
    sessions.set(token, state)
    return { status: 401, headers: { 'set-cookie': cookieFor(token, id, secure) }, outcome: message,
      content: page('请完成本地人工验证', `<p>请在这一个窗口输入图片中的六位数字，然后点击验证。无需登录或提供个人信息。</p>
        ${message === 'incorrect' ? '<p role="alert">答案错误或已过期，请输入这张新图片。</p>' : ''}
        <form method="POST" action="/case/${id}/captcha">${state.svg}
        <input type="hidden" name="challenge" value="${challenge}">
        <label>图片中的六位数字<input name="answer" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" maxlength="6" required autofocus></label>
        <button type="submit">验证并继续</button></form><p>完成后会显示“人工验证已通过”，任务会在原窗口继续。</p>`) }
  }
  return async (req: IncomingMessage, id: string, readBody: () => Promise<string>): Promise<Reply> => {
    const secure = req.headers['x-forwarded-proto'] === 'https'
    const origin = `${secure ? 'https' : 'http'}://${req.headers.host}`
    const token = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith('bat_lab_captcha='))?.slice(16) ?? ''
    const state = sessions.get(token), scope = scopeFor(req, id)
    if (req.method === 'POST') {
      if (req.headers.origin !== origin) return { status: 403, content: page('验证未接受', '<p>请求来源不匹配。</p>'), outcome: 'origin_rejected' }
      const form = new URLSearchParams(await readBody())
      if (!state?.answer || state.scope !== scope || form.get('challenge') !== state.challenge)
        return { status: 403, content: page('验证未接受', '<p>验证已过期或不属于此会话，请刷新页面。</p>'), outcome: 'binding_rejected' }
      // WHY：绑定检查后一次消费，错误答案不能在同一图片上暴力重试；已通过票据不能再提交。
      sessions.delete(token)
      const answer = form.get('answer') ?? ''
      if (!/^\d{6}$/.test(answer) || !timingSafeEqual(digest(answer), state.answer))
        return challenge(id, scope, secure, 'incorrect')
      const passed = randomUUID()
      sessions.set(passed, { scope, challenge: '', answer: null, svg: '' })
      return { status: 303, content: '', headers: { location: `/case/${id}/captcha`, 'set-cookie': cookieFor(passed, id, secure) }, outcome: 'passed' }
    }
    if (req.method !== 'GET') return { status: 405, content: '', outcome: 'method_rejected' }
    if (state?.answer === null && state.scope === scope) return { status: 200,
      content: page('人工验证已通过', '<p id="captcha-completed">此会话已通过人工验证，任务可以继续。</p>'), outcome: 'admitted' }
    return challenge(id, scope, secure, 'required')
  }
}

export const captchaGate = createCaptchaGate()
