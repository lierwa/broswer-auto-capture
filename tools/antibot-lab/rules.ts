// WHY：规则由CrowdSec执行；这里仅配置实验事件与窗口，不复制检测/调度/风控引擎。
const field = (name: string) => `evt.Meta.${name}`
const labels = { service: "bat-lab", confidence: 1, spoofable: 0, remediation: false }
function leaky(name: string, filter: string, groupby: string, capacity: number, leakspeed: string, distinct?: string) {
  return { name: `bat-lab/${name}`, description: `Owned lab ${name}`, type: "leaky", filter, groupby,
    capacity, leakspeed, blackhole: "1m", labels: { ...labels, remediation: ['request-burst', 'repeated-failure'].includes(name) }, ...(distinct ? { distinct } : {}) }
}
const valid = "evt.Meta.log_type == 'bat_observation' && evt.Meta.valid == 'true'"
// 本地业务前缀是夹具数据边界。挑战、探针、静态资源不计入这组业务窗口，仍保留网关全量计数。
const business = `((${valid} && evt.Meta.category == 'business') || (evt.Meta.log_type == 'http_access-log' && evt.Meta.http_path startsWith '/case/'))`
const siteKey = "evt.Meta.source_ip + '/' + (evt.Meta.site != '' ? evt.Meta.site : evt.Meta.target_fqdn)"
const session = "evt.Meta.session != '' && evt.Meta.session != nil"
const account = "evt.Meta.account != '' && evt.Meta.account != nil"
const failedAuth = `${valid} && evt.Meta.category == 'auth' && evt.Meta.outcome == 'failed' && ${account}`

export const rules = [
  { name: 'bat-lab/request-identity', description: 'HTTP and client-reported identity differ; not proof of human identity', type: 'trigger',
    filter: `${valid} && evt.Meta.category == 'request-identity' && evt.Meta.outcome == 'mismatch'`,
    groupby: "evt.Meta.session + '/' + evt.Meta.detector", labels: { ...labels, spoofable: 1 } },
  { name: 'bat-lab/h2-coherence', description: 'Original Kitsune settings versus pseudo-header engine mismatch', type: 'trigger',
    filter: `${valid} && evt.Meta.category == 'h2-coherence' && evt.Meta.outcome == 'mismatch'`,
    groupby: field('session'), labels },
  { name: 'bat-lab/workflow-prerequisite', description: 'Missing server session prerequisite or rejected origin, not human identity', type: 'trigger',
    filter: `${valid} && evt.Meta.category == 'workflow' && evt.Meta.outcome in ['prerequisite_missing','origin_rejected']`,
    groupby: field('session'), labels },
  leaky("request-burst", business, siteKey, 40, "500ms"),
  leaky("repeated-failure", `${business} && (evt.Meta.status in ['429', '503'] || evt.Meta.http_status in ['429', '503'])`,
    siteKey, 5, "10s"),
  leaky("hour-budget", business, siteKey, 60, "60s"),
  leaky("day-budget", business, siteKey, 240, "360s"),
  leaky("account-device-failures", `${failedAuth} && evt.Meta.device != ''`, field('account'), 5, "10m", field('device')),
  leaky("device-account-failures", `${failedAuth} && evt.Meta.device != ''`, field('device'), 5, "10m", field('account')),
  leaky("protocol-continuity", `${valid} && ${session} && evt.Meta.tls_family != '' && evt.Meta.ua != ''`,
    "evt.Meta.session + '/' + evt.Meta.ua + '/' + evt.Meta.transport", 1, "10m", field('tls_family')),
  leaky('h3-continuity', `${valid} && ${session} && evt.Meta.category == 'h3-continuity' && evt.Meta.protocol_family != '' && evt.Meta.ua != ''`,
    "evt.Meta.session + '/' + evt.Meta.ua", 1, '10m', field('protocol_family')),
  leaky('quic-continuity', `${valid} && ${session} && evt.Meta.category == 'quic-continuity' && evt.Meta.protocol_family != '' && evt.Meta.ua != ''`,
    "evt.Meta.session + '/' + evt.Meta.ua", 1, '10m', field('protocol_family')),
  leaky('quic-shape', `${valid} && ${session} && evt.Meta.category == 'quic-shape' && evt.Meta.protocol_family != '' && evt.Meta.ua != ''`,
    "evt.Meta.session + '/' + evt.Meta.ua", 1, '10m', field('protocol_family')),
  // 已由原SQLite滚动窗口组件拒绝准入；原CrowdSec继续关联，不复制窗口或清掉旧漏桶。
  { name: 'bat-lab/persistent-budget', description: 'Persistent rolling business admission quota exceeded', type: 'trigger',
    filter: `${valid} && evt.Meta.category == 'persistent-budget' && evt.Meta.outcome == 'denied'`,
    groupby: field('session'), labels },
  // WHY：信任位只按下方五类原规则消费；Chrome原IME结束也可为false，粘贴/组合不作为异常。
  { name: 'bat-lab/input-behavior', description: 'Pinned Kitsune experimental timing/scroll clue; never blocks alone', type: 'trigger',
    filter: `${valid} && evt.Meta.category == 'input-behavior' && evt.Meta.outcome == 'detected'`,
    groupby: "evt.Meta.session + '/' + evt.Meta.detector", labels: { ...labels, spoofable: 1, remediation: false } },
  { name: "bat-lab/scripted-input", description: "Explicit untrusted DOM input", type: "trigger",
    filter: `${valid} && evt.Meta.category == 'input' && evt.Meta.event_type in ['input','change','click','keydown','keyup'] && evt.Meta.trusted == 'false'`, groupby: field('session'), labels: { ...labels, spoofable: 1 } },
  { name: 'bat-lab/browser-marker', description: 'Pinned BotD browser marker; client-reported, not proof of identity', type: 'trigger',
    filter: `${valid} && evt.Meta.category == 'browser-marker' && evt.Meta.outcome == 'detected'`,
    groupby: "evt.Meta.session + '/' + evt.Meta.detector", labels: { ...labels, spoofable: 1 } },
  // Anubis固定模板的script[type=ignore]链接入口；只记录异常入口行为，不自动归罪整个IP/账号。
  { name: 'bat-lab/honeypot-entry', description: 'Parser-inert trap entry, excluding declared prefetch', type: 'trigger',
    filter: `${valid} && evt.Meta.category == 'honeypot' && evt.Meta.outcome == 'entered'`, groupby: field('source_ip'), labels },
  { name: "bat-lab/telemetry-invalid", description: "Measurement invalid, not a bot verdict", type: "trigger",
    filter: "evt.Meta.log_type == 'bat_observation' && evt.Meta.valid != 'true'", groupby: field('source_ip'),
    labels: { ...labels, service: "measurement-health" } },
]

export const observationFields = ['source_ip', 'site', 'session', 'account', 'device', 'category', 'outcome',
  'status', 'trusted', 'valid', 'ua', 'tls_family', 'protocol_family', 'event_type', 'detector', 'transport']
export const parser = {
  name: "bat-lab/observation", description: "Versioned synthetic/local observations; no account content",
  filter: "evt.Line.Labels.type == 'bat-lab'", onsuccess: "next_stage",
  statics: [
    { meta: 'log_type', value: 'bat_observation' }, { meta: 'service', value: 'bat-lab' },
    { target: 'evt.StrTime', expression: "JsonExtract(evt.Line.Raw, 'at')" },
    ...observationFields.map(name => ({ meta: name, expression: `JsonExtract(evt.Line.Raw, '${name}')` })),
  ],
}
