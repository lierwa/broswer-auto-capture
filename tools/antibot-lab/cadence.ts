import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { z } from 'zod'

const duration = z.number().finite().min(0).max(1e9)
// 诊断只保留有界、匿名的首错配链；它不参与任何原检测器的评分或样本有效性判断。
const traceSchema=z.tuple([z.enum(['keydown','keyup','compositionstart','compositionend','blur','focus']),duration,
  z.number().int().min(-1).max(7),z.number().int().min(0).max(256),z.number().int().min(0).max(127),
  z.enum(['Shift','Control','Alt','Meta','CapsLock','NumLock','ScrollLock']).nullable()])
const sampleSchema = z.object({ keyCount: z.number().int().min(0).max(100),
  intervals: z.array(duration).max(99), dwellTimes: z.array(duration).max(100),
  pending: z.number().int().min(0).max(100), invalid: z.boolean(), excluded: z.boolean(),
  field:z.number().int().min(0).max(7).optional(),starts:z.array(duration).max(100).optional(),
  context:z.object({imePairs:z.number().int().min(0).max(100),physicalPairs:z.number().int().min(0).max(100),
    auxiliaryReleases:z.number().int().min(0).max(1_000_000),unpaired:z.number().int().min(0).max(1_000_000),
    skipped:z.number().int().min(0).max(1_000_000),composition:z.number().int().min(0).max(1_000_000),downClockInvalid:z.boolean(),
    fault:z.object({reason:z.enum(['modifier-release-mismatch','duplicate-down','release-before-down','unmatched-release']),
      at:duration,down:z.boolean(),process:z.boolean(),composing:z.boolean(),codePresent:z.boolean(),
      pending:z.number().int().min(0).max(100),imePending:z.number().int().min(0).max(100),releases:z.number().int().min(0).max(100),
      trace:z.array(traceSchema).max(32).optional()}).strict().optional()}).strict().optional() }).strict()
export const cadenceSchema=sampleSchema.extend({samples:z.array(sampleSchema).min(1).max(8)
  .refine(samples=>samples.every(s=>s.field!==undefined && s.starts && s.context) &&
    new Set(samples.map(s=>s.field)).size===samples.length,'timing_fields_must_be_distinct_and_measured').optional()}).strict()
type Cadence = z.infer<typeof cadenceSchema>
type Original = { checkTypingCadence(fields: object, typing: object): object[] }
const require = createRequire(import.meta.url)

export function downTimingInvalid(data:z.infer<typeof sampleSchema>) {
  if(!data.starts)return false // 旧协议不虚构缺少的原始时刻。
  return data.context?.downClockInvalid || data.starts.length!==data.keyCount ||
    data.intervals.length!==Math.max(0,data.keyCount-1) ||
    data.starts.some((at,i)=>i>0 && (at<data.starts![i-1]! || at-data.starts![i-1]!==data.intervals[i-1]))
}
async function observeSample(base:string,data:z.infer<typeof sampleSchema>) {
  const row = (outcome: string, valid = false) => ({ category: 'input-behavior', detector: 'typing-cadence',
    detector_version: 'FCaptcha-1.43.0/56aa2b38', valid: String(valid), outcome })
  if (data.invalid || downTimingInvalid(data) || (data.context &&
      data.context.imePairs+data.context.physicalPairs!==data.dwellTimes.length)) return row('invalid')
  if (data.excluded) return row('excluded')
  if (data.keyCount < 10) return row('unavailable')
  if (data.pending || data.dwellTimes.length !== data.keyCount || data.intervals.length !== data.keyCount - 1) return row('incomplete')
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
export function combineTiming<T extends {outcome:string;valid:string}>(rows:T[]) {
  // WHY：各字段独立计算，阳性/真实错误不能被另一字段的阴性覆盖。
  return rows.find(r=>['invalid','error'].includes(r.outcome)) ?? rows.find(r=>r.outcome==='detected')
    ?? rows.find(r=>r.valid==='true') ?? rows.find(r=>r.outcome==='incomplete') ?? rows[0]
}
export async function cadenceObservations(base: string, data?: Cadence) {
  if (!data) return [] // 旧报告与未观察textarea的页面不新增已测声明。
  const rows=await Promise.all((data.samples?.length?data.samples:[data]).map(s=>observeSample(base,s)))
  return [combineTiming(rows)!]
}
