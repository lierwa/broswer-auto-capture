import type { IncomingMessage } from 'node:http'
import { appendFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { z } from 'zod'
import { page } from './pages.ts'

const identity = z.object({ account: z.string().regex(/^synthetic-[a-z0-9-]{1,70}$/),
  device: z.string().regex(/^synthetic-[a-z0-9-]{1,70}$/), proof: z.enum(['pass', 'fail']) }).strict()

export async function observation(base: string, req: IncomingMessage, id: string, data: object) {
  const ip = req.headers['x-real-ip']
  if (typeof ip !== 'string' || !isIP(ip)) throw Error('gateway_ip_missing')
  // WHY：仅合成实验身份，结果由源站产生；规则与长期聚合完全复用CrowdSec。
  await appendFile(`${base}/logs/observations.jsonl`, JSON.stringify({ at: new Date().toISOString(),
    source_ip: ip, site: id, session: id, valid: 'true', ...data }) + '\n')
}

export async function securityFixture(base: string, req: IncomingMessage, id: string, action: string,
  value: string | undefined, raw: () => Promise<string>) {
  if (action === 'auth-probe' && req.method === 'POST') {
    const scheme = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    if (req.headers.origin !== `${scheme}://${req.headers.host}`) throw Error('fixture_origin_required')
    const input = identity.parse(JSON.parse(await raw()))
    await observation(base, req, id, { category: 'auth', account: input.account, device: input.device,
      outcome: input.proof === 'pass' ? 'ok' : 'failed' })
    return { status: input.proof === 'pass' ? 200 : 401, content: { accepted: input.proof === 'pass', synthetic: true } }
  }
  if (action !== 'honeypot' || req.method !== 'GET') return null
  if (value === 'trap') {
    const prefetch = [req.headers.purpose, req.headers['sec-purpose']].some(v => typeof v === 'string' && v.includes('prefetch'))
    await observation(base, req, id, { category: 'honeypot', outcome: prefetch ? 'prefetch' : 'entered' })
    return { status: 200, content: page('实验入口已记录', '<p>仅合成观测；未自动封禁。</p>') }
  }
  // 复用Anubis v1.27.0的HTML data-block模式；不接入其迷宫生成、/24聚合封禁或另一套网关。
  return { status: 200, content: page('链接解析反例', `<p>浏览器和无障碍导航只应看到下面两个业务链接。</p>
    <a href="/case/${id}">资料目录</a><a href="/case/${id}/document/7">示例资料</a>
    <script type="ignore"><a href="/case/${id}/honeypot/trap">Don't click me</a></script>`) }
}
