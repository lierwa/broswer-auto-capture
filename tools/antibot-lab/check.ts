import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { requestedHighEntropyHints } from './identity.ts'

const assets = new Map([
  ['/measurement/check', ['check.html', 'text/html']],
  ['/measurement/check/', ['check.html', 'text/html']],
  ['/measurement/check/style.css', ['check.css', 'text/css']],
  ['/measurement/check/app.js', ['check.js', 'text/javascript']],
  ['/measurement/check/model.js', ['check-model.js', 'text/javascript']],
  ['/measurement/check/view.js', ['check-view.js', 'text/javascript']],
  ['/measurement/check/art.js', ['check-art.js', 'text/javascript']],
])

export const observedEventTypes = ['input', 'change', 'click', 'keydown', 'keyup', 'compositionstart',
  'compositionend', 'paste', 'focus', 'blur', 'visibilitychange'] as const

// WHY：仅投影原判据输出，不向访客回传IP、UA、指纹、输入内容或其它会话；不另建检测引擎。
export function checkReceipt(rows: object[], events: { type?: string; trusted: boolean; hidden: boolean }[], dropped: number) {
  const signals = rows.flatMap(row => {
    const item = row as Record<string, unknown>
    if (typeof item.detector !== 'string' || typeof item.category !== 'string') return []
    return [{ category: item.category, detector: item.detector, valid: item.valid === 'true',
      outcome: String(item.outcome) }]
  })
  const byType: Record<string, { events: number; untrusted: number }> = {}
  for (const item of events) {
    const type = observedEventTypes.some(type => type === item.type) ? item.type! : 'unknown'
    const counts = byType[type] ??= { events: 0, untrusted: 0 }
    counts.events++; if (!item.trusted) counts.untrusted++
  }
  return { signals, input: { events: events.length, untrusted: events.filter(item => !item.trusted).length,
    hidden: events.filter(item => item.hidden).length, dropped, byType } }
}

export async function checkRoute(base: string, req: IncomingMessage, res: ServerResponse,
  pathname: string, create: (req: IncomingMessage) => { id: string; page: string; url?:string; verification?:string }) {
  if (!assets.has(pathname) && pathname !== '/measurement/check/session') return false
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'accept-ch': requestedHighEntropyHints }
  if (pathname === '/measurement/check/session') {
    const scheme = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    const valid = req.method === 'POST' && req.headers.origin === `${scheme}://${req.headers.host}`
    const result=valid ? create(req) : {error:'same_origin_post_required'}
    res.writeHead(valid ? 201 : 403, { ...headers, 'content-type': 'application/json' })
    res.end(JSON.stringify(result))
    return true
  }
  if (req.method !== 'GET') { res.writeHead(405, headers); res.end(); return true }
  const [file, type] = assets.get(pathname)!
  const { checkout } = JSON.parse(await readFile(`${base}/prepared.json`, 'utf8')) as { checkout: string }
  const content = await readFile(`${checkout}/${file}`)
  res.writeHead(200, { ...headers, 'content-type': `${type}; charset=utf-8` })
  res.end(content)
  return true
}
