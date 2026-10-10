import { readFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { z } from 'zod'

const probeNames = ['creep-probe', 'creep-worker-client', 'creep-worker-source', 'creep-device-client'] as const
type ProbeName = typeof probeNames[number]
const manifestSchema = z.object({ source: z.literal('10aa6724cd33a1015db1574211890518cd04f0cc'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), upstreamExceptionProbePreserved: z.literal(true) })

export async function readProbe(base: string, name: ProbeName) {
  const [bundle, receipt] = await Promise.all([readFile(`${base}/runtime/${name}.js`), readFile(`${base}/runtime/${name}.json`, 'utf8')])
  const manifest = manifestSchema.parse(JSON.parse(receipt))
  if (createHash('sha256').update(bundle).digest('hex') !== manifest.sha256) throw Error('probe_bundle_changed')
  return bundle
}

export async function probeStatus(base: string) {
  // WHY：启动健康必须包含已配置探针；摘要一致只证明制品可加载，不证明检测有效。
  const probes = await Promise.all(probeNames.map(async name => ({ name,
    status: await readProbe(base, name).then(() => 'available' as const, () => 'unavailable' as const) })))
  return { status: probes.every(probe => probe.status === 'available') ? 'available' as const : 'unavailable' as const, probes }
}

export async function requireProbes(base: string) {
  const result = await probeStatus(base)
  if (result.status !== 'available') throw Error(`probe_assets_unavailable:${result.probes.filter(p => p.status !== 'available').map(p => p.name).join(',')}`)
  return result
}

export async function creepProbe(base: string, url: URL, res: ServerResponse) {
  if (url.pathname === '/measurement/creep.js') {
    const bundle = await readProbe(base, 'creep-probe')
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(bundle); return
  }
  const mode = url.searchParams.get('mode') ?? 'baseline'
  if (url.pathname !== '/measurement/creep' || !['baseline','tampered','no-media','blocked'].includes(mode)) throw Error('invalid_creep_mode')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': `default-src 'self' data: blob:; connect-src 'none'; script-src ${mode === 'blocked' ? "'none'" : "'self' 'unsafe-inline'"}; style-src 'unsafe-inline'`,
    'permissions-policy': 'camera=(), microphone=(), geolocation=()' })
  res.end(`<!doctype html><meta charset="utf-8"><title>Independent CreepJS probe</title><p>独立环境测量；不是通过证明。</p>
    <script type="module">
    try {
      const mode=${JSON.stringify(mode)};
      if(mode==='tampered'){
        const original=HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL=function(...args){return original.apply(this,args);};
      }
      if(mode==='no-media') Object.defineProperty(window,'MediaSource',{value:undefined});
      const {probe}=await import('/measurement/creep.js');
      globalThis.__creepResult=await probe();
    }catch{globalThis.__creepResult={validity:'error'};}
    </script>`)
}
