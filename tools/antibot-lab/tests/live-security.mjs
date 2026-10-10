import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'

const base = path.join(process.cwd(), 'work/antibot-service'), out = path.join(base, 'reports', `security-${Date.now()}`)
await mkdir(out)
const { base: linuxBase } = JSON.parse(await readFile(path.join(base, 'prepared.json'), 'utf8'))
const cli = `${linuxBase}/runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli`
const associationOnly = process.argv.includes('--association-only')
const subnet = associationOnly ? '127.88.73' : '127.88.32'
const ips = { normal: `${subnet}.2`, account: `${subnet}.3`, device: `${subnet}.4`, trap: `${subnet}.5`, prefetch: `${subnet}.6`, samePair: `${subnet}.7` }
function alerts(ip) {
  // CLI --ip通过decision筛选，会遗漏没有ban的告警；直接按真实Alert.source过滤。
  const rows = JSON.parse(execFileSync(cli, ['-c', `${linuxBase}/config/config.yaml`, 'alerts', 'list', '-l', '0', '-o', 'json'], { encoding: 'utf8' }) || '[]') ?? []
  return rows.filter(a => a.source?.value === ip)
}
function request(port, method, url, localAddress, headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, localAddress, method,
      headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.setTimeout(5000, () => req.destroy(Error('timeout'))); req.on('error', reject); req.end(body)
  })
}
for (const ip of Object.values(ips)) assert.equal(alerts(ip).length, 0, 'source-state-contaminated')
const created = await request(4188, 'POST', '/api/cases', ips.normal,
  { Host: '127.0.0.1:4188', Origin: 'http://127.0.0.1:4188', 'Content-Type': 'application/json' }, '{"kind":"catalog"}')
assert.equal(created.status, 201)
const { id } = JSON.parse(created.body), host = `${id}.localhost:4184`, prefix = `/case/${id}`
const headers = { Host: host, Origin: `http://${host}`, 'Content-Type': 'application/json', 'User-Agent': 'Owned security calibration' }
const attempts = []
async function auth(ip, account, device, proof) {
  const result = await request(4184, 'POST', prefix + '/auth-probe', ip, headers,
    JSON.stringify({ account: `synthetic-${id}-${account}`, device: `synthetic-${id}-${device}`, proof }))
  attempts.push({ ip, kind: 'auth', status: result.status })
  assert.equal(result.status, proof === 'pass' ? 200 : 401)
}
async function association() {
  const sources = Array.from({ length: 7 }, (_, i) => `${subnet}.${10 + i}`)
  for (const ip of sources) assert.equal(alerts(ip).length, 0, 'association_source_state_contaminated')
  for (const [i, source] of sources.entries()) {
    await auth(ips.normal, `shared-${i}`, `shared-device-${i}`, 'pass')
    await auth(source, 'normal-migration', `normal-device-${i}`, 'pass')
    await auth(source, 'distributed-target', `attack-device-${i}`, 'fail')
    await auth(source, `attack-account-${i}`, 'distributed-device', 'fail')
  }
  await delay(3500)
  const observed = (await readFile(path.join(base, 'logs/observations.jsonl'), 'utf8')).trim().split('\n')
    .map(JSON.parse).filter(e => e.site === id && e.category === 'auth')
  const unique = new Map(sources.flatMap(alerts).map(row => [row.id, row]))
  const actual = [...unique.values()], scenarios = actual.map(row => row.scenario).sort()
  await writeFile(path.join(out, 'association.json'), JSON.stringify({ id, attempts, observations: observed,
    actual, scenarios, actualLoopbackSourceCount: new Set(observed.map(row => row.source_ip)).size,
    sharedExitNormal: alerts(ips.normal), rulesUnchanged: true, scope: 'real loopback sources and synthetic identities; not public reputation or real account migration' }, null, 2))
  assert.equal(observed.length, 28)
  assert.equal(new Set(observed.map(row => row.source_ip)).size, 8)
  assert.deepEqual(alerts(ips.normal), [], 'normal_shared_exit_flagged')
  // 原CrowdSec同一关联桶可为每个实际来源生成Alert，不能把“一类判定”误写成“一个Alert”。
  assert.deepEqual([...new Set(scenarios)], ['bat-lab/account-device-failures', 'bat-lab/device-account-failures'])
  assert.ok(actual.every(row => sources.includes(row.source.value) && row.events.length === 6))
  assert.ok(actual.every(row => row.events.every(event => event.meta.some(meta => meta.key === 'outcome' && meta.value === 'failed'))))
  assert.ok(actual.every(row => !JSON.stringify(row.events).includes('normal-migration')), 'normal_migration_in_abnormal_bucket')
  console.log(JSON.stringify({ evidence: out, association: 'passed', actualSources: 8, scenarios }))
}
if (associationOnly) { await association(); process.exit(0) }
for (let i = 0; i < 7; i++) {
  await auth(ips.normal, 'normal', `normal-${i}`, 'pass')
  await auth(ips.samePair, 'typo', 'same-device', 'fail')
  await auth(ips.account, 'target', `device-${i}`, 'fail')
  await auth(ips.device, `account-${i}`, 'one-device', 'fail')
}
for (const [name, extra] of [['normal', {}], ['prefetch', { Purpose: 'prefetch', 'Sec-Purpose': 'prefetch' }], ['trap', {}]]) {
  const result = await request(4184, 'GET', prefix + '/honeypot' + (name === 'normal' ? '' : '/trap'), ips[name], { ...headers, ...extra })
  attempts.push({ ip: ips[name], kind: name, status: result.status }); assert.equal(result.status, 200)
}
await delay(3500)
const actual = Object.fromEntries(Object.entries(ips).map(([name, ip]) => [name, alerts(ip)]))
const observations = (await readFile(path.join(base, 'logs/observations.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).filter(e => e.site === id)
const summary = Object.fromEntries(Object.entries(actual).map(([name, rows]) => [name, rows.map(a => a.scenario)]))
const proof = { id, purpose: 'actual-origin-to-CrowdSec-not-full-stack', attempts, summary, observations,
  modelCalls: 0, decisionRulesUnchanged: true, normalSharedIp: true, actual }
await writeFile(path.join(out, 'proof.json'), JSON.stringify(proof, null, 2))
assert.equal(observations.length, 30)
assert.deepEqual(summary.normal, [])
assert.deepEqual(summary.prefetch, [])
const specific = name => summary[name].filter(s => s.startsWith('bat-lab/'))
assert.deepEqual(specific('account'), ['bat-lab/account-device-failures'])
assert.deepEqual(specific('device'), ['bat-lab/device-account-failures'])
assert.deepEqual(summary.trap, ['bat-lab/honeypot-entry'])
assert.deepEqual(specific('samePair'), [])
assert.ok(summary.samePair.includes('LePresidente/http-generic-401-bf'), 'existing-repeated-failure-detection-missing')
console.log(JSON.stringify({ evidence: out, summary, observedSourceIps: [...new Set(observations.map(e => e.source_ip))] }))
