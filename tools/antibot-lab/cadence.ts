import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { z } from 'zod'

const duration = z.number().finite().min(0).max(1e9)
export const cadenceSchema = z.object({ keyCount: z.number().int().min(0).max(100),
  intervals: z.array(duration).max(99), dwellTimes: z.array(duration).max(100),
  pending: z.number().int().min(0).max(100), invalid: z.boolean(), excluded: z.boolean() }).strict()
type Cadence = z.infer<typeof cadenceSchema>
type Original = { checkTypingCadence(fields: object, typing: object): object[] }
const require = createRequire(import.meta.url)

export async function cadenceObservations(base: string, data?: Cadence) {
  if (!data) return [] // 旧报告与未观察textarea的页面不新增已测声明。
  const row = (outcome: string, valid = false) => [{ category: 'input-behavior', detector: 'typing-cadence',
    detector_version: 'FCaptcha-1.43.0/56aa2b38', valid: String(valid), outcome }]
  if (data.invalid) return row('invalid')
  if (data.excluded) return row('excluded')
  if (data.keyCount < 10) return row('unavailable')
  // WHY：原函数缺hold会返回空检测；完整键对才可解释为有效阴性，不伪造缺失字段。
  if (data.pending || data.dwellTimes.length !== data.keyCount || data.intervals.length !== data.keyCount - 1) {
    return row('incomplete')
  }
  try {
    const source = path.resolve(base, 'upstream/fcaptcha-inputforensics-56aa2b38.cjs')
    if (createHash('sha256').update(await readFile(source)).digest('hex') !==
        '28c90a5d442eb3a1db5d7922129c7369fe998ae66b6554a087e0ac68de002d32') throw Error('cadence_source_changed')
    const original = require(source) as Original
    const avgKeyInterval = data.intervals.reduce((sum, value) => sum + value, 0) / data.intervals.length
    const keyIntervalVariance = data.intervals.reduce((sum, value) => sum + (value - avgKeyInterval) ** 2, 0) / data.intervals.length
    const detections = original.checkTypingCadence({ sample: { keyCount: data.keyCount, avgKeyInterval,
      keyIntervalVariance, dwellTimes: data.dwellTimes } }, {})
    return row(detections.length ? 'detected' : 'clear', true)
  } catch { return row('error') }
}
