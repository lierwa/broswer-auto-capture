import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { createProbeFixture } from "./fixture.js"

export const holdoutProbe = { name: "Brotector", commit: "98b330999e9928a226ca0c8254dddf909d1583bd",
  bundleSha256: "1fa214628e8b36faaee9088e00bfba97679c40f4637f4442b633130f38d24a6d",
  license: "MIT", purpose: "independent Runtime mechanism review; no product tuning" }
const result = z.object({ state: z.enum(["ready", "error", "timeout"]), errors: z.number().int().nonnegative(),
  detections: z.array(z.object({ detection: z.string().max(100), type: z.string().max(100).nullable(),
    score: z.number(), data: z.object({ stackLookupCount: z.number(), nameLookupCount: z.number() }).optional() }).strict()).max(100) }).strict()
const script = `
const base = location.pathname, status = document.querySelector('#status');
let chosen = false, started = false;
const post = (suffix, body) => fetch(base + suffix, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
addEventListener('securitypolicyviolation', e => post('/violation', {directive:e.effectiveDirective}));
for (const button of document.querySelectorAll('button')) button.addEventListener('click', async event => {
  if (chosen || started) return;
  chosen = true;
  await post('/action', {version:Number(button.dataset.version),trusted:event.isTrusted});
  status.textContent = '已选择，正在独立复核…';
});
async function collect() {
  started = true;
  let errors = 0, state = 'error', detections = [], timer;
  addEventListener('error', () => errors++);
  addEventListener('unhandledrejection', () => errors++);
  try {
    await new Promise((resolve, reject) => { const s=document.createElement('script');
      s.src='/probe.js';s.onload=resolve;s.onerror=reject;document.head.append(s); });
    // WHY：不运行与 Runtime 无关且会创建额外 target 的 PDF 样式检查。
    class RuntimeHoldout extends Brotector { async test_pdfStyle() {} }
    const probe = new RuntimeHoldout(() => {}, 100, false);
    state = await Promise.race([probe.init_done.then(() => 'ready', () => 'error'),
      new Promise(resolve => {timer=setTimeout(() => resolve('timeout'), 5000);})]);
    clearTimeout(timer);
    await new Promise(resolve => setTimeout(resolve, 1500));
    detections = probe.detections.map(d => ({detection:d.detection,type:d.type || null,score:d.score,
      ...(d.detection === 'runtime.enabled' ? {data:d.data} : {})}));
  } catch { errors++; }
  const response = await post('/result', {state,errors,detections});
  status.textContent = response.ok ? '本轮已保存。' : '保存失败。';
}
async function poll() {
  if (started) return;
  try {if ((await (await fetch(base+'/gate')).json()).collect) return collect();} catch {}
  setTimeout(poll, 250);
}
poll();
`

export async function createHoldoutFixture(root: string, directory: string) {
  const source = path.join(root, "work/antibot-m0/holdout/brotector-98b3309")
  async function checked(name: string, digest: string) {
    const bytes = await readFile(path.join(source, name))
    if (createHash("sha256").update(bytes).digest("hex") !== digest) throw Error("holdout_artifact_digest_mismatch")
    return bytes
  }
  const bundle = await checked("brotector.js", holdoutProbe.bundleSha256)
  await checked("LICENSE", "3527e1b45c07acbef785668b2e517c30620a1e129994ee765c605965f9e38cf7")
  const pdf = await checked("assets/test.pdf", "7cb171c5e3e89066a2839bbd26722069fb9aecdb63c6f6c6b6fdd13c9519a01f")
  return createProbeFixture(bundle, directory, { script, parse: raw => result.parse(raw), analyze(raw) {
    const value = result.parse(raw)
    return { ...value, status: value.state === "ready" && value.errors === 0 ? "observed" : "invalid",
      detected: value.detections.some(d => d.detection === "runtime.enabled") }
  }, allowObject: true, assets: { "/case/assets/test.pdf": { body: pdf, type: "application/pdf" } } })
}
