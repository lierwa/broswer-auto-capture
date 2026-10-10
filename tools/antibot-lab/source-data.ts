import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

export const sourceUrl = 'https://onionoo.torproject.org/details?type=relay&running=true&flag=Exit&fields=exit_addresses'
const maxAge = 24 * 3600_000
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const ip = z.union([z.ipv4(), z.ipv6()])
const document = z.object({ version: z.string().regex(/^8\./), relays_published: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  relays: z.array(z.object({ exit_addresses: z.array(ip).optional() })).min(1).max(100_000) })
const metadata = z.object({ source: z.literal(sourceUrl), version: z.string().regex(/^8\./), published: z.iso.datetime(),
  expires: z.iso.datetime(), fetched: z.iso.datetime(), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  listDigest: z.string().regex(/^[a-f0-9]{64}$/), count: z.number().int().positive(), lastModified: z.string().nullable() })
export type SourceMetadata = z.infer<typeof metadata>

export function parseSource(text: string, now = Date.now()) {
  if (Buffer.byteLength(text) > 2_000_000) throw Error('source_data_too_large')
  const value = document.parse(JSON.parse(text)), published = Date.parse(value.relays_published.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(published) || published > now + 300_000 || now - published > maxAge) throw Error('source_data_clock_invalid')
  const addresses = [...new Set(value.relays.flatMap(row => row.exit_addresses ?? []))].sort()
  if (!addresses.length) throw Error('source_data_empty')
  return { addresses, version: value.version, published: new Date(published).toISOString(),
    expires: new Date(published + maxAge).toISOString() }
}

async function stored(base: string) {
  const value = metadata.parse(JSON.parse(await readFile(path.join(base, 'data/tor-source.json'), 'utf8')))
  // WHY：有效期由源发布时间确定，不能让缓存元数据损坏或重下载替旧名单续期。
  const published = Date.parse(value.published)
  if (published > Date.now() + 300_000 || Date.parse(value.expires) !== published + maxAge)
    throw Error('source_data_clock_invalid')
  const text = await readFile(path.join(base, `data/tor-${value.listDigest}.txt`), 'utf8')
  if (digest(text) !== value.listDigest || text.trim().split('\n').length !== value.count) throw Error('source_data_digest_changed')
  return value
}

export async function sourceStatus(base: string) {
  try {
    const value = await stored(base)
    return { status: Date.parse(value.expires) <= Date.now() ? 'stale' : 'available', ...value,
      meaning: 'Tor exit attribute only; not a bot verdict or global reputation' }
  } catch { return { status: 'unavailable', meaning: 'Missing or invalid source data; not a negative result' } }
}

export async function refreshSource(base: string) {
  let previous: SourceMetadata | undefined
  try { previous = await stored(base) } catch { /* Invalid cache cannot be used for conditional 304. */ }
  const fresh = previous && Date.parse(previous.expires) > Date.now()
  const response = await fetch(sourceUrl, { headers: { 'Accept-Encoding': 'gzip',
    ...(fresh && previous?.lastModified ? { 'If-Modified-Since': previous.lastModified } : {}) },
    redirect: 'error', signal: AbortSignal.timeout(25_000) })
  if (response.status === 304 && previous && Date.parse(previous.expires) > Date.now()) return previous
  if (response.status === 304) throw Error('source_data_expired_not_modified')
  if (!response.ok || !response.body) throw Error(`source_data_http_${response.status}`)
  const chunks: Uint8Array[] = []; let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > 2_000_000) throw Error('source_data_too_large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8'), parsed = parseSource(raw), list = parsed.addresses.join('\n') + '\n'
  const value: SourceMetadata = { source: sourceUrl, version: parsed.version, published: parsed.published,
    expires: parsed.expires, fetched: new Date().toISOString(), sourceDigest: digest(raw), listDigest: digest(list),
    count: parsed.addresses.length, lastModified: response.headers.get('last-modified') }
  await mkdir(path.join(base, 'data'), { recursive: true })
  await writeFile(path.join(base, `data/tor-${value.listDigest}.txt`), list)
  await writeFile(path.join(base, 'data/tor-source.json'), JSON.stringify(value, null, 2))
  return value
}

export function sourceRules(value: SourceMetadata) {
  const current = `TimeNow() <= '${value.expires.replace('.000Z', 'Z')}'`
  const valid = "evt.Meta.log_type == 'http_access-log' && evt.Meta.source_ip != ''"
  const data = [{ dest_file: `tor-${value.listDigest}.txt`, type: 'string' }]
  const listed = `${valid} && ${current} && evt.Meta.source_ip in File('${data[0]!.dest_file}')`
  const labels = { service: 'network-source', confidence: 1, spoofable: 0, remediation: false }
  return [
    { name: 'bat-lab/tor-exit-observed', description: 'Public exit attribute; normal Tor is not a bot verdict',
      type: 'trigger', filter: listed, groupby: 'evt.Meta.source_ip', blackhole: '1m', data, labels },
    { name: 'bat-lab/tor-repeated-failure', description: 'Listed exit with repeated explicit failures', type: 'leaky',
      filter: `${listed} && evt.Meta.http_status in ['429','503']`, groupby: 'evt.Meta.source_ip',
      capacity: 5, leakspeed: '10s', blackhole: '1m', data, labels },
    { name: 'bat-lab/source-data-stale', description: 'Expired network-source measurement; no bot verdict',
      type: 'trigger', filter: `${valid} && !(${current})`, groupby: 'evt.Meta.source_ip', blackhole: '1m',
      labels: { ...labels, service: 'measurement-health' } },
  ]
}

export async function configureSource(base: string) {
  const value = await stored(base)
  if (Date.parse(value.expires) <= Date.now()) throw Error('source_data_expired')
  for (const rule of sourceRules(value)) await writeFile(path.join(base, 'config/scenarios', rule.name.replace('/', '-') + '.yaml'), JSON.stringify(rule, null, 2))
  return value
}
