import type { IncomingHttpHeaders } from 'node:http'
import { parseItem, parseList } from 'structured-headers'
import { z } from 'zod'

const short = z.string().min(1).max(256)
const brand = z.object({ brand: short, version: short }).strict()
const brands = z.array(brand).min(1).max(16)
const hints = z.object({ brands: z.array(brand).max(16), mobile: z.boolean(), platform: z.string().max(256) }).strict()
const textHint = z.string().max(256)
const formFactors = z.array(short).min(1).max(16)
const highEntropy = z.object({ architecture: textHint.nullable(), bitness: textHint.nullable(), model: textHint.nullable(),
  platformVersion: textHint.nullable(), wow64: z.boolean().nullable(), fullVersionList: brands.nullable(),
  formFactors: z.array(short).max(16).nullable().optional() }).strict()
const highHeaders = { architecture: 'sec-ch-ua-arch', bitness: 'sec-ch-ua-bitness', model: 'sec-ch-ua-model',
  platformVersion: 'sec-ch-ua-platform-version', wow64: 'sec-ch-ua-wow64', fullVersionList: 'sec-ch-ua-full-version-list',
  formFactors: 'sec-ch-ua-form-factors' } as const
// WHY：Accept-CH 的 opt-in token 使用浏览器公开名称；请求端解析仍按 Node 的小写 header 键。
export const requestedHighEntropyHints = ['Sec-CH-UA-Arch','Sec-CH-UA-Bitness','Sec-CH-UA-Model',
  'Sec-CH-UA-Platform-Version','Sec-CH-UA-WoW64','Sec-CH-UA-Full-Version-List','Sec-CH-UA-Form-Factors'].join(', ')
export const identitySchema = z.object({ userAgent: z.string().max(2048).nullable(),
  hints: hints.nullable(), highEntropy: highEntropy.nullable().optional(),
  highEntropyValidity: z.enum(['measured', 'unavailable', 'error', 'timeout']).optional() }).strict()
  .refine(value => value.highEntropyValidity === undefined || (value.highEntropyValidity === 'measured'
    ? value.highEntropy != null : value.highEntropy === null), 'identity_measurement_state_inconsistent')
type Identity = z.infer<typeof identitySchema>

function headerBrands(raw: string) {
  return parseList(raw).map(([name, parameters]) => ({ brand: name, version: parameters.get('v') }))
}

function canonical(value: unknown) {
  // WHY：品牌顺序含GREASE随机化；保留任意品牌，不硬编码Chrome名单或把未知浏览器判为异常。
  return JSON.stringify(Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? item : [item.brand, item.version])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : value)
}

function compare(detector: string, raw: string | string[] | undefined, observed: unknown,
  schema: z.ZodType, parse: (raw: string) => unknown, allowEmpty = false) {
  const common = { category: 'request-identity', detector, detector_version: 'ua-ch/structured-headers-2.0.3' }
  if (raw === undefined || observed === null || observed === undefined || (!allowEmpty && observed === '')
    || (Array.isArray(observed) && !observed.length))
    return { ...common, valid: 'false', outcome: 'unavailable' }
  try {
    if (typeof raw !== 'string' || raw.length > 4096) throw Error('header_invalid')
    const actual = schema.parse(parse(raw)), expected = schema.parse(observed)
    return { ...common, valid: 'true', outcome: canonical(actual) === canonical(expected) ? 'clear' : 'mismatch' }
  } catch { return { ...common, valid: 'false', outcome: 'invalid' } }
}

export function identityObservations(headers: IncomingHttpHeaders, data?: Identity) {
  const item = (raw: string) => parseItem(raw)[0]
  const rows = [
    compare('user-agent', headers['user-agent'], data?.userAgent, z.string().min(1).max(2048), raw => raw),
    compare('brands', headers['sec-ch-ua'], data?.hints?.brands, brands, headerBrands),
    compare('mobile', headers['sec-ch-ua-mobile'], data?.hints?.mobile, z.boolean(), item),
    compare('platform', headers['sec-ch-ua-platform'], data?.hints?.platform, short, item),
  ]
  // WHY：旧报告保持原四字段；新版缺权限显式报unavailable，合法空model不是采集失败。
  if (data?.highEntropy !== undefined) for (const key of Object.keys(highHeaders) as (keyof typeof highHeaders)[]) {
    if (key === 'formFactors' && data.highEntropy && !('formFactors' in data.highEntropy)) continue
    rows.push(compare(key, headers[highHeaders[key]], data.highEntropy?.[key],
      key === 'formFactors' ? formFactors : key === 'fullVersionList' ? brands : key === 'wow64' ? z.boolean() : textHint,
      key === 'formFactors' ? raw => parseList(raw).map(([value]) => value) : key === 'fullVersionList' ? headerBrands : item, true))
  }
  if (data?.highEntropyValidity && data.highEntropyValidity !== 'measured') rows.push({
    category: 'environment-health', detector: 'ua-high-entropy', detector_version: 'ua-ch/structured-headers-2.0.3',
    valid: 'false', outcome: data.highEntropyValidity })
  return rows
}
