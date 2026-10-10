import type { ServerResponse } from 'node:http'
import { readProbe } from './creep.ts'

// WHY：独立原CreepJS页避免探针互相污染；worker脚本仅同源，临时Profile承载生命周期。
export async function workerProbe(base: string, url: URL, res: ServerResponse) {
  const file = { '/measurement/worker/creep.js': 'creep-worker-source',
    '/measurement/worker/probe.js': 'creep-worker-client', '/measurement/worker/devices.js': 'creep-device-client' }[url.pathname] as
      'creep-worker-source' | 'creep-worker-client' | 'creep-device-client' | undefined
  if (file) {
    const data = await readProbe(base, file)
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(data); return
  }
  if (url.pathname === '/measurement/worker/devices') return devicePage(url, res)
  const mode = url.searchParams.get('mode') ?? 'baseline'
  if (url.pathname !== '/measurement/worker/probe' || !['baseline','tampered','shared','dedicated','blocked'].includes(mode)) throw Error('worker_mode_invalid')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': `default-src 'self'; connect-src 'none'; script-src 'self' 'unsafe-inline'; worker-src ${mode === 'blocked' ? "'none'" : "'self'"}`,
    'permissions-policy': 'camera=(), microphone=(), geolocation=()' })
  res.end(`<!doctype html><meta charset="utf-8"><title>Independent worker integrity</title>
    <p>跨上下文探针；不采集输入或音视频。</p><script type="module">
    try {
      const mode=${JSON.stringify(mode)};
      if(mode==='tampered') Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>123});
      if(['shared','dedicated'].includes(mode)) Object.defineProperty(navigator,'serviceWorker',{value:undefined});
      if(mode==='dedicated') Object.defineProperty(window,'SharedWorker',{value:undefined});
      const {probe}=await import('/measurement/worker/probe.js'); globalThis.__workerResult=await probe();
    }catch{globalThis.__workerResult={validity:'error'};}
    </script>`)
}

function devicePage(url: URL, res: ServerResponse) {
  const mode = url.searchParams.get('mode') ?? 'baseline'
  if (!['baseline', 'scaled', 'screen-tampered', 'gpu-tampered', 'no-gpu', 'no-permissions'].includes(mode)) throw Error('device_mode_invalid')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; connect-src 'none'; script-src 'self' 'unsafe-inline'; worker-src 'self'",
    'permissions-policy': 'camera=(), microphone=(), geolocation=()' })
  res.end(`<!doctype html><meta charset="utf-8"><title>Independent device integrity</title>
    <p>设备与权限只读测量；不请求音视频授权。</p><script type="module">
    try {
      const mode=${JSON.stringify(mode)};
      if(mode==='screen-tampered') Object.defineProperty(screen,'width',{value:screen.width+1});
      if(mode==='gpu-tampered' && globalThis.GPU){const native=GPU.prototype.requestAdapter;
        GPU.prototype.requestAdapter=function(...args){return native.apply(this,args)};}
      if(mode==='no-gpu') Object.defineProperty(navigator,'gpu',{value:undefined});
      if(mode==='no-permissions') Object.defineProperty(navigator,'permissions',{value:undefined});
      const {probe}=await import('/measurement/worker/devices.js'); globalThis.__deviceResult=await probe();
    }catch{globalThis.__deviceResult={validity:'error'};}
    </script>`)
}
