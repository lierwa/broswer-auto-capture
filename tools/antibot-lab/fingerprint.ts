import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export async function fingerprintBundle(base: string) {
  const file = `${base}/runtime/crowdsec-909b5157986a2b2c2163300fdaef5ed01289f7d2/pkg/appsec/challenge/js/fpscanner/fpscanner.js`
  const bytes = await readFile(file)
  if (createHash('sha256').update(bytes).digest('hex') !== '1f6125c9d254f06663ab804a64b69055b57686c2c3cd9686268b3b9a836aaff4') throw Error('fingerprint_artifact_changed')
  return bytes
}

// 与BotD分页面运行。仅留有效性/判据，不留原始Canvas/GPU/设备/键盘指纹或外发。
export const fingerprintPage = `<!doctype html><meta charset="utf-8"><title>CrowdSec source probe</title>
<p>固定上游探针；缺失和错误不会归为正常。</p><script src="/measurement/fingerprint.js"></script><script>
(async () => {
  try {
    const scanner = new CrowdsecFingerprintScanner();
    const fp = await Promise.race([scanner.collectFingerprint({encrypt:false}),
      new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),15000))]);
    const states = {};
    function visit(value,path) {
      if (value && typeof value==='object' && !Array.isArray(value)) {
        for (const [key,item] of Object.entries(value)) visit(item,path+'.'+key);
      } else states[path] = ['ERROR','INIT','SKIPPED','NA'].includes(value) ? value : 'measured';
    }
    visit(fp.signals,'signals');
    const unavailable=Object.keys(states).filter(key=>states[key]!=='measured');
    globalThis.__probeResult={version:'CrowdSec-1.8.1',states,unavailable,
      validity:unavailable.length?'partial':'measured',detections:fp.fastBotDetectionDetails};
  } catch { globalThis.__probeResult={validity:'error'}; }
})();</script>`
