import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"

export const botdDigest = "f438ed251dc7414ece9d4a2b6941441ad9ffae1a1905817f5f0c7366e701dd86"
export function measurementHealth(components: Record<string, { state: number; error?: string }>) {
  // WHY：原BotD用Undefined表示普通网页没有Electron process；读取抛错仍是不可用。
  const absent = Object.entries(components).filter(([key, value]) => key === 'process'
    && value.state === -1 && value.error === 'BotdError: window.process is undefined').map(([key]) => key)
  const unavailable = Object.entries(components).filter(([key, value]) => value.state !== 0
    && !absent.includes(key)).map(([key]) => key)
  return { absent, unavailable }
}
export async function botdBundle(base: string) {
  const content = await readFile(`${base}/runtime/botd/package/dist/botd.esm.js`)
  if (createHash('sha256').update(content).digest('hex') !== botdDigest) throw Error('botd_artifact_changed')
  return Buffer.concat([content, Buffer.from('\nexport ' + measurementHealth.toString())])
}

// WHY：detected=false不能抹掉采集异常。仅输出状态和规则名，不保存原始指纹。
// 固定BotD 2.0.0，getComponents/getDetections为公开实例方法；内部依赖用于实验诊断。
export const botdPage = `<!doctype html><meta charset="utf-8"><title>Independent BotD probe</title>
<p>独立探针。观测结果不等于真人证明。</p><script type="module">
try {
  const {load, measurementHealth} = await import('/measurement/probe/botd.js');
  const detector = await load({monitoring:false});
  const verdict = detector.detect();
  const components = detector.getComponents();
  const states = Object.fromEntries(Object.entries(components).map(([key,value]) => [key,value.state]));
  const {unavailable, absent} = measurementHealth(components);
  globalThis.__probeResult = {version:'2.0.0', verdict, states, unavailable, absent,
    validity:unavailable.length ? 'partial' : 'measured', detections:detector.getDetections()};
} catch { globalThis.__probeResult = {validity:'error'}; }
</script>`
