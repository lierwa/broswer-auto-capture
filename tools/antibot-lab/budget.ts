import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { appendFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { IncomingMessage } from 'node:http'
import { z } from 'zod'

const execute = promisify(execFile)
const decision = z.discriminatedUnion('status', [
  z.object({ version: z.literal(1), status: z.enum(['allowed', 'denied']), retryAfter: z.number().int().min(0),
    intervalMs: z.number().int().positive().nullable(), limit: z.number().int().positive().nullable() }).strict(),
  z.object({ version: z.literal(1), status: z.literal('error'), reason: z.string().min(1).max(80) }).strict(),
])

export async function admitBusiness(base: string, req: IncomingMessage, scope: string) {
  const source = req.headers['x-real-ip']
  if (typeof source !== 'string' || !isIP(source)) throw Error('budget_gateway_ip_missing')
  const key = createHash('sha256').update(JSON.stringify([scope, source])).digest('hex')
  const { checkout } = z.object({ checkout: z.string() }).parse(JSON.parse(await readFile(`${base}/prepared.json`, 'utf8')))
  let result: z.infer<typeof decision>
  try {
    const output = await execute('/usr/bin/python3', ['-I', `${checkout}/tools/antibot-lab/budget.py`, base, key],
      { timeout: 5_000, maxBuffer: 4096, windowsHide: true })
    result = decision.parse(JSON.parse(output.stdout))
    if (result.status === 'denied' && result.retryAfter < 1) throw Error('budget_retry_after_missing')
  } catch { result = { version: 1, status: 'error', reason: 'budget_execution_failed' } }
  // WHY：源站准入配额与网关收到总量分别记录，拒绝没有减少客户端尝试数。
  await appendFile(`${base}/logs/observations.jsonl`, JSON.stringify({ at: new Date().toISOString(), source_ip: source,
    site: scope, session: key, category: 'persistent-budget', valid: String(result.status !== 'error'),
    outcome: result.status, ...result }) + '\n')
  return result
}
