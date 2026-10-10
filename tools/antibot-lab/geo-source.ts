import { readFile, writeFile, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { directory, hubCommit, linuxPath, wsl } from './paths.ts'

const file = z.enum(['GeoLite2-City.mmdb', 'GeoLite2-ASN.mmdb'])
const schema = z.object({ source: z.literal('https://db-ip.com/db/lite.php'), license: z.literal('CC-BY-4.0'),
  attribution: z.literal('IP Geolocation by DB-IP https://db-ip.com CC BY 4.0'), expires: z.iso.datetime(), cityCoordinatesAvailable: z.literal(false),
  metadata: z.object({
    'GeoLite2-City.mmdb': z.object({ buildEpoch: z.number().int().positive(), databaseType: z.literal('DBIP-Country-Lite') }),
    'GeoLite2-ASN.mmdb': z.object({ buildEpoch: z.number().int().positive(), databaseType: z.literal('DBIP-ASN-Lite (compat=GeoLite2-ASN)') }),
  }),
  files: z.array(z.object({ file, sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive() })).length(2),
})

export async function geoSourceStatus(base: string, now = Date.now()) {
  try {
    const data = schema.parse(JSON.parse(await readFile(`${base}/geo-source.json`, 'utf8')))
    if (new Set(data.files.map(item => item.file)).size !== 2) throw Error('geo_files_duplicate')
    for (const entry of data.files) {
      const bytes = await readFile(`${base}/data/${entry.file}`)
      if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
        throw Error('geo_source_changed')
    }
    // WHY：只用MMDB真实构建时刻，不让重下载/复制文件延长有效期。
    const builds = Object.values(data.metadata).map(item => item.buildEpoch * 1000)
    const expiry = Math.min(...builds) + 35 * 86400_000
    if (builds.some(built => built > now + 300_000) || Date.parse(data.expires) !== expiry) throw Error('geo_clock_invalid')
    return { ...data, status: now >= expiry ? 'stale' : 'available',
      meaning: 'Country/ASN data and soft timezone clue; not physical location or global reputation' }
  } catch { return { status: 'unavailable', meaning: 'Missing or invalid GeoIP data; no healthy negative' } }
}

const marker = '# B-A-T GeoIP freshness; original scoring and weights retained\n'
export function geoScoringConfig(source: string, expires: string) {
  z.iso.datetime().parse(expires)
  const hook = 'filter: EvaluateMismatches().Has("timezone_country")'
  if (source.split(hook).length !== 2 || !source.startsWith('name: crowdsecurity/appsec-bot-challenge-scoring\n'))
    throw Error('geo_scoring_upstream_changed')
  // WHY：过期的是地理测量，不是其它检测；保留原5分、全部其余hooks与挑战，不替过测放宽规则。
  return marker + source.replace(hook, `filter: TimeNow() < '${new Date(expires).toISOString().replace('.000Z', 'Z')}' && (EvaluateMismatches().Has("timezone_country"))`)
}

export async function configureGeoScoring(expires: string, engineActive: boolean) {
  const source = path.join(directory, `runtime/hub/hub-${hubCommit}/appsec-configs/crowdsecurity/appsec-bot-challenge-scoring.yaml`)
  const target = path.join(directory, 'config/appsec-configs/appsec-bot-challenge-scoring.yaml')
  const original = (await readFile(source, 'utf8')).replace(/\r\n/g, '\n')
  const generated = geoScoringConfig(original, expires), dest = linuxPath(target)
  if (wsl(['cat', dest], true) === generated) return
  if (engineActive) throw Error('restart_owned_engine_to_apply_geo_freshness')
  const pending = path.join(directory, 'config/appsec-configs', `.geo-${randomUUID()}.tmp`)
  await writeFile(pending, generated, { flag: 'wx' })
  try {
    // 只替换本实验配置别名：核原Hub链接/原内容或已有owned覆盖，os.replace不跟随链接修改上游。
    wsl(['python3', '-c', `import os,sys
from pathlib import Path
target,pending,source=map(Path,sys.argv[1:4])
assert target.parent.resolve()==pending.parent.resolve() and target.parent.name=='appsec-configs'
if target.is_symlink(): assert target.resolve()==source.resolve()
else: assert target.read_text()==source.read_text() or target.read_text().startswith(sys.argv[4])
os.replace(pending,target)`, dest, linuxPath(pending), linuxPath(source), marker], true)
  } finally {
    await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}
