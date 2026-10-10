import type { IncomingMessage } from 'node:http'
import { appendFile, readFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { z } from 'zod'
import { identityObservations, identitySchema } from './identity.ts'
import { behaviorObservations, behaviorSchema } from './behavior.ts'
import { checkReceipt } from './check.ts'

const event = z.object({ type: z.enum(['input', 'change', 'click', 'keydown', 'keyup', 'compositionend',
  'paste', 'focus', 'blur', 'visibilitychange']), trusted: z.boolean(), hidden: z.boolean() }).strict()
const name = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/)
const detectors = new Set(['detectAppVersion', 'detectDocumentAttributes', 'detectErrorTrace',
  'detectEvalLengthInconsistency', 'detectFunctionBind', 'detectLanguagesLengthInconsistency',
  'detectNotificationPermissions', 'detectPluginsArray', 'detectPluginsLengthInconsistency', 'detectProcess',
  'detectUserAgent', 'detectWebDriver', 'detectWebGL', 'detectWindowExternal', 'detectWindowSize',
  'detectMimeTypesConsistent', 'detectProductSub', 'detectDistinctiveProperties'])
const environment = z.object({ version: z.literal('2.0.0'), status: z.enum(['measured', 'partial', 'error', 'timeout']),
    signals: z.array(z.object({ name, detected: z.boolean() }).strict()).max(18),
    unavailable: z.array(name).max(64), absent: z.array(z.literal('process')).max(1).optional() }).strict().refine(value => {
  const names = new Set(value.signals.map(signal => signal.name))
  if (names.size !== value.signals.length || [...names].some(item => !detectors.has(item))) return false
  if (value.absent?.some(item => value.unavailable.includes(item))) return false
  if (value.status === 'error' || value.status === 'timeout') return value.signals.length === 0
  return names.size === detectors.size && (value.status === 'partial' ? value.unavailable.length > 0 : !value.unavailable.length)
}, 'telemetry_environment_incomplete')
const integrityVersion = z.literal('10aa6724cd33a1015db1574211890518cd04f0cc')
const integrity = z.discriminatedUnion('validity', [
  z.object({ version: integrityVersion, validity: z.literal('measured'), mismatch: z.boolean() }).strict(),
  z.object({ version: integrityVersion, validity: z.literal('unavailable'), mismatch: z.null() }).strict(),
  z.object({ version: integrityVersion, validity: z.literal('error'), mismatch: z.null() }).strict(),
  z.object({ version: integrityVersion, validity: z.literal('timeout'), mismatch: z.null() }).strict(),
])
const workerName = z.enum(['platform', 'userAgent', 'hardwareConcurrency', 'deviceMemory'])
const workerSignal = z.discriminatedUnion('validity', [
  z.object({ name: workerName, validity: z.literal('measured'), mismatch: z.boolean() }).strict(),
  z.object({ name: workerName, validity: z.literal('unavailable'), mismatch: z.null() }).strict(),
  z.object({ name: workerName, validity: z.literal('error'), mismatch: z.null() }).strict(),
  z.object({ name: workerName, validity: z.literal('timeout'), mismatch: z.null() }).strict(),
])
const workerIntegrity = z.object({ version: integrityVersion, signals: z.array(workerSignal).length(4)
  .refine(signals => new Set(signals.map(signal => signal.name)).size === 4) }).strict()
const input = z.object({ version: z.literal(1), page: z.uuid(), batch: z.uuid(), events: z.array(event).max(64),
  environment: environment.optional(), identity: identitySchema.optional(), behavior: behaviorSchema.optional(),
  integrity: integrity.optional(), workerIntegrity: workerIntegrity.optional(),
  dropped: z.number().int().min(0).max(1_000_000) }).strict()

export async function collector(base: string) {
  const { checkout } = JSON.parse(await readFile(`${base}/prepared.json`, 'utf8')) as { checkout: string }
  return readFile(`${checkout}/tools/antibot-lab/collector.js`, 'utf8')
}

export function instrument(html: string, id: string, page: string) {
  return html.replace('</html>', `<script defer src="/shield/collector.js" data-case="${id}" data-page="${page}"></script></html>`)
}

export async function ingest(base: string, req: IncomingMessage, id: string, raw: string,
  claim: (page: string, batch: string) => boolean) {
  const scheme = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
  if (req.headers.origin !== `${scheme}://${req.headers.host}`) throw Error('telemetry_origin_required')
  const ip = req.headers['x-real-ip']
  if (typeof ip !== 'string' || !isIP(ip)) throw Error('telemetry_gateway_ip_missing')
  const data = input.parse(JSON.parse(raw))
  if (!claim(data.page, data.batch)) throw Error('telemetry_unknown_page_or_replayed_batch')
  const common = { at: new Date().toISOString(), source_ip: ip, site: id, session: `${id}/${data.page}`,
    batch: data.batch, valid: 'true' }
  const rows: object[] = data.events.map(item => ({ ...common, category: 'input', event_type: item.type,
    trusted: String(item.trusted), hidden: String(item.hidden) }))
  if (data.environment) {
    const env = data.environment
    for (const signal of env.signals) rows.push({ ...common, category: 'browser-marker',
      detector: signal.name, outcome: signal.detected ? 'detected' : 'clear', detector_version: env.version })
    if (env.status !== 'measured') rows.push({ ...common, category: 'environment-health', valid: 'false',
      outcome: env.status, unavailable: env.unavailable })
    if (env.absent?.length) rows.push({ ...common, category: 'environment-health',
      outcome: 'expected-absence', absent: env.absent })
    rows.push(...identityObservations(req.headers, data.identity).map(item => ({ ...common, ...item })))
  }
  if (data.dropped) rows.push({ ...common, category: 'input-health', valid: 'false', outcome: 'overflow', dropped: data.dropped })
  if (data.integrity) {
    const { version, validity, mismatch } = data.integrity
    rows.push({ ...common, detector: 'creepWebglMirror', detector_version: version,
      category: validity === 'measured' ? 'browser-marker' : 'environment-health',
      valid: validity === 'measured' ? 'true' : 'false',
      outcome: validity === 'measured' ? mismatch ? 'detected' : 'clear' : validity })
  }
  for (const signal of data.workerIntegrity?.signals ?? []) rows.push({ ...common,
    detector: 'creepWorker.' + signal.name, detector_version: data.workerIntegrity!.version,
    category: signal.validity === 'measured' ? 'browser-marker' : 'environment-health',
    valid: signal.validity === 'measured' ? 'true' : 'false',
    outcome: signal.validity === 'measured' ? signal.mismatch ? 'detected' : 'clear' : signal.validity })
  rows.push(...(await behaviorObservations(base, data.behavior)).map(item => ({ ...common, ...item })))
  // WHY：客户端遥测可伪造，只作为可解释告警；原生CrowdSec判定，不授予通行Cookie或真人身份。
  if (rows.length) await appendFile(`${base}/logs/observations.jsonl`, rows.map(row => JSON.stringify(row)).join('\n') + '\n')
  return { accepted: rows.length, environment: data.environment?.status ?? null,
    integrity: data.integrity?.validity ?? null, workerIntegrity: data.workerIntegrity
      ? data.workerIntegrity.signals.every(signal => signal.validity === 'measured') ? 'measured'
        : data.workerIntegrity.signals.some(signal => signal.validity === 'error') ? 'error'
          : data.workerIntegrity.signals.some(signal => signal.validity === 'timeout') ? 'timeout' : 'unavailable' : null,
    page: data.page, batch: data.batch, report: checkReceipt(rows, data.events, data.dropped) }
}
