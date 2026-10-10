import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { cadenceSchema, cadenceObservations } from './cadence.ts'

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
    const median = original.keystrokeIntervalMedian(data.keys), scroll = data.scroll
    // WHY：只适配固定原函数/阈值；实验性线索可被正常锚点、长按等触发，不授予或撤销身份。
    return [row('keystroke-interval', median < 0 ? null : median < 30),
      row('keystroke-entropy', data.keys.length < 4 ? null : original.keystrokeEntropy(data.keys) < .15),
      row('scroll-teleport', !scroll.count || scroll.maxTouchPoints === null ? null : original.isScrollTeleport(scroll.maxDelta,
        scroll.wheelCount, scroll.scrollKey, scroll.maxTouchPoints)), ...cadence]
  } catch { return [row('measurement', null, 'error'), ...cadence] }
}
