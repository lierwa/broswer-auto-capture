import { directory as labData } from '../locations.mjs'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'

const base = labData
const out = path.join(base, 'reports', `rate-${Date.now()}`)
await mkdir(out, { recursive: true })
const normalIp = '127.88.18.2', abnormalIp = '127.88.18.3'
function request(port, method, url, localAddress, headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, localAddress,
      headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) } }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', chunk => { data += chunk });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(5000, () => req.destroy(Error('timeout'))); req.on('error', reject); req.end(body)
  })
}
const { base: linuxBase } = JSON.parse(await readFile(path.join(base, 'prepared.json'), 'utf8'))
const cli = `${linuxBase}/runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli`
function decisions(ip) {
  const alerts = JSON.parse(execFileSync(cli, ['-c', `${linuxBase}/config/config.yaml`, 'decisions', 'list', '--ip', ip, '-o', 'json'], { encoding: 'utf8' }) || '[]') ?? []
  return alerts.flatMap(alert => alert.decisions ?? [])
}
// 首次状态污染就拒绝运行；不清封禁，不给测试来源加白名单。
assert.equal(decisions(normalIp).length + decisions(abnormalIp).length, 0, 'source-state-contaminated')
const created = await request(4188, 'POST', '/api/cases', normalIp,
  { Host: '127.0.0.1:4188', Origin: 'http://127.0.0.1:4188', 'Content-Type': 'application/json' }, JSON.stringify({ kind: 'catalog' }))
assert.equal(created.status, 201)
const item = JSON.parse(created.body), pathname = `/case/${item.id}`, host = `${item.id}.localhost:4184`
const headers = { Host: host, 'User-Agent': 'Owned rate calibration' }
const normal = []
for (let i = 0; i < 4; i++) { normal.push(await request(4184, 'GET', pathname, normalIp, headers)); await delay(600) }
assert.ok(normal.every(r => r.status === 200), 'normal-denied')
const burst = await Promise.all(Array.from({ length: 55 }, () => request(4184, 'GET', pathname, abnormalIp, headers)))
await delay(3500)
const enforced = await request(4184, 'GET', pathname, abnormalIp, headers)
const normalAgain = await request(4184, 'GET', pathname, normalIp, headers)
await delay(100)
const logs = (await readFile(path.join(base, 'logs/access.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  .filter(row => row.RequestHost === `${item.id}.localhost` || row.RequestHost === host)
const count = ip => {
  const rows = logs.filter(row => row.ClientHost === ip)
  return { gateway: rows.length, origin: rows.filter(row => row.OriginStatus > 0).length,
    blocked: rows.filter(row => row.DownstreamStatus === 403).length }
}
const proof = { purpose: 'single-layer-enforcement-not-full-stack', caseId: item.id,
  sourceIps: { normalIp, abnormalIp }, clientAttempts: { normal: 5, abnormal: 56 },
  normal: { statuses: [...normal.map(r => r.status), normalAgain.status], ...count(normalIp), decisions: decisions(normalIp) },
  abnormal: { burstStatuses: burst.map(r => r.status), enforced: enforced.status, ...count(abnormalIp), decisions: decisions(abnormalIp) },
  sourcesReset: false, whitelist: false, modelCalls: 0 }
await writeFile(path.join(out, 'proof.json'), JSON.stringify(proof, null, 2))
assert.equal(enforced.status, 403, 'rate-rule-not-enforced')
assert.equal(normalAgain.status, 200, 'normal-source-contaminated')
assert.equal(proof.normal.gateway, 5)
assert.equal(proof.abnormal.gateway, 56)
assert.ok(proof.abnormal.decisions.some(d => JSON.stringify(d).includes('bat-lab/request-burst')))
console.log(JSON.stringify({ evidence: out, normalAccepted: true, abnormalBlocked: true,
  actualCounters: { normal: count(normalIp), abnormal: count(abnormalIp) } }))
