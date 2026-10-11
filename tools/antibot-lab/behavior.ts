import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { cadenceSchema, cadenceObservations, combineTiming, downTimingInvalid } from './cadence.ts'

const count = z.number().int().min(0).max(1_000_000)
export const behaviorSchema = z.object({ keys: z.array(z.number().finite().nonnegative()).max(128),
  scroll: z.object({ count, maxDelta: z.number().finite().min(0).max(1e9), wheelCount: count,
    scrollKey: z.boolean(), maxTouchPoints: z.number().int().min(0).max(100).nullable() }).strict(),
  cadence: cadenceSchema.optional() }).strict()
type Classifier = { keystrokeEntropy(times: number[]): number; keystrokeIntervalMedian(times: number[]): number;
  isScrollTeleport(delta: number, wheels: number, key: boolean, touch: number): boolean }
let loaded: Promise<Classifier> | undefined
async function classifier(base: string): Promise<Classifier> {
  const source = `${base}/upstream/kitsune-behavior-f0a22b3.ts`
  if (createHash('sha256').update(await readFile(source)).digest('hex') !==
      '238f681da2ce6b6a37a926a9214a269ce7215c84bdae59902165a37ec4c9ac87') throw Error('behavior_source_changed')
  return import(pathToFileURL(source).href)
}
export async function behaviorObservations(base: string, data?: z.infer<typeof behaviorSchema>) {
  const row = (detector: string, detected: boolean | null, outcome = 'unavailable') => ({ category: 'input-behavior',
    detector, valid: detected === null ? 'false' : 'true', outcome: detected === null ? outcome : detected ? 'detected' : 'clear' })
  if (!data) return [row('measurement', null)]
  if (data.keys.some((time, i) => i > 0 && time < data.keys[i - 1]!)) return [row('measurement', null, 'invalid')]
  const cadence = await cadenceObservations(base, data.cadence)
  try {
    const original = await (loaded ??= classifier(base))
    const scroll = data.scroll
    // WHY：只适配固定原函数/阈值；实验性线索可被正常锚点、长按等触发，不授予或撤销身份。
    // WHY：真实keydown用于间隔/熵，真实完整down/up键对用于hold；两类缺失不能互相冒充。
    const samples=data.cadence?.samples?.length?data.cadence.samples:[data.cadence]
    const timing=samples.map(sample=>{
      const times=sample?.starts ?? data.keys,median=original.keystrokeIntervalMedian(times)
      const invalid=(sample && downTimingInvalid(sample)) || times.some((t,i)=>i>0 && t<times[i-1]!)
      const legacyExcluded=sample?.excluded && !sample.starts && !sample.invalid
      return [invalid?row('keystroke-interval',null,'invalid'):legacyExcluded?row('keystroke-interval',null,'excluded'):row('keystroke-interval',median<0?null:median<30),
        invalid?row('keystroke-entropy',null,'invalid'):legacyExcluded?row('keystroke-entropy',null,'excluded'):row('keystroke-entropy',times.length<4?null:original.keystrokeEntropy(times)<.15)]
    })
    return [combineTiming(timing.map(r=>r[0]!))!,combineTiming(timing.map(r=>r[1]!))!,
      row('scroll-teleport', !scroll.count || scroll.maxTouchPoints === null ? null : original.isScrollTeleport(scroll.maxDelta,
        scroll.wheelCount, scroll.scrollKey, scroll.maxTouchPoints)), ...cadence]
  } catch { return [row('measurement', null, 'error'), ...cadence] }
}
