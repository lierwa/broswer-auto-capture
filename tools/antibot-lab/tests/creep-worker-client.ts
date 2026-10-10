import worker, { WORKER_TYPE } from '../../../work/antibot-service/runtime/creepjs-10aa6724cd33a1015db1574211890518cd04f0cc/src/worker/index'
import { getLies } from '../../../work/antibot-service/runtime/creepjs-10aa6724cd33a1015db1574211890518cd04f0cc/src/lies/index'

export async function workerIntegrity() {
  const version = '10aa6724cd33a1015db1574211890518cd04f0cc'
  const names = ['platform', 'userAgent', 'hardwareConcurrency', 'deviceMemory'] as const
  try {
    // 构建期薄适配只添加加载选项，保留原比较判据；不触碰页面现有Service Worker。
    const collect = worker as unknown as (options: { scriptSource: string; dedicatedOnly: boolean }) =>
      Promise<(NonNullable<Awaited<ReturnType<typeof worker>>> & { comparisonLies: string[] }) | undefined>
    const scope = await collect({ scriptSource: '/measurement/worker/creep.js', dedicatedOnly: true })
    const records = scope?.comparisonLies
    if (scope && !Array.isArray(records)) throw Error('worker_comparison_receipt_missing')
    const signals = names.map(name => {
      // 原硬件比较在worker值为falsy时跳过；缺告警不能把未执行的判据记为正常。
      const skipped = (name === 'hardwareConcurrency' || name === 'deviceMemory') && !scope?.[name]
      const available = !skipped && scope?.[name] != null && globalThis.navigator[name] != null
      return { name, validity: available ? 'measured' : 'unavailable',
        mismatch: available ? records!.includes('Navigator.' + name) : null }
    })
    return { version, signals }
  } catch { return { version, signals: names.map(name => ({ name, validity: 'error', mismatch: null })) } }
}

export async function probe() {
  const result = await worker()
  const records = getLies().data
  return { validity: result ? 'measured' : 'unavailable', type: WORKER_TYPE,
    fields: result ? Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value == null ? 'unavailable' : 'measured'])) : {},
    ruleNames: Object.keys(records), workerMismatchRules: Object.entries(records)
      .filter(([, reasons]) => (reasons as string[]).includes('does not match worker scope')).map(([key]) => key),
    rawFingerprintPersisted: false }
}
