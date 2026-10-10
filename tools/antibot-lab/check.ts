import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { requestedHighEntropyHints } from './identity.ts'

const assets = new Map([
  ['/measurement/check', ['check.html', 'text/html']],
  ['/measurement/check/', ['check.html', 'text/html']],
  ['/measurement/check/style.css', ['check.css', 'text/css']],
  ['/measurement/check/app.js', ['check.js', 'text/javascript']],
])

// WHY：仅投影原判据输出，不向访客回传IP、UA、指纹、输入内容或其它会话；不另建检测引擎。
export function checkReceipt(rows: object[], events: { trusted: boolean; hidden: boolean }[], dropped: number) {
  const signals = rows.flatMap(row => {
    const item = row as Record<string, unknown>
    if (typeof item.detector !== 'string' || typeof item.category !== 'string') return []
    return [{ category: item.category, detector: item.detector, valid: item.valid === 'true',
      outcome: String(item.outcome) }]
  })
  return { signals, input: { events: events.length, untrusted: events.filter(item => !item.trusted).length,
    hidden: events.filter(item => item.hidden).length, dropped } }
}

export async function checkRoute(base: string, req: IncomingMessage, res: ServerResponse,
  pathname: string, create: () => { id: string; page: string }) {
  if (!assets.has(pathname) && pathname !== '/measurement/check/session') return false
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'accept-ch': requestedHighEntropyHints }
  if (pathname === '/measurement/check/session') {
    const scheme = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    const valid = req.method === 'POST' && req.headers.origin === `${scheme}://${req.headers.host}`
    res.writeHead(valid ? 201 : 403, { ...headers, 'content-type': 'application/json' })
    res.end(JSON.stringify(valid ? create() : { error: 'same_origin_post_required' }))
    return true
  }
  if (req.method !== 'GET') { res.writeHead(405, headers); res.end(); return true }
  const [file, type] = assets.get(pathname)!
  const { checkout } = JSON.parse(await readFile(`${base}/prepared.json`, 'utf8')) as { checkout: string }
  const content = await readFile(`${checkout}/tools/antibot-lab/${file}`)
  res.writeHead(200, { ...headers, 'content-type': `${type}; charset=utf-8` })
  res.end(content)
  return true
}
