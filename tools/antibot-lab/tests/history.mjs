import assert from 'node:assert/strict'
import { appendFile, readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'
import net from 'node:net'

const directory = path.join(process.cwd(), 'work/antibot-service')
const windowState = execFileSync('systemctl', ['--user', 'show', 'bat-antibot-window-test.service',
  '--property=ActiveState', '--value'], { encoding: 'utf8' }).trim()
assert.ok(!['active', 'activating'].includes(windowState), 'live-window-validation-running')
const { base } = JSON.parse(await readFile(path.join(directory, 'prepared.json'), 'utf8'))
const bin = `${base}/runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli`
const out = path.join(directory, 'reports', `history-${Date.now()}`)
await mkdir(out)
function decisions(ip) {
  const alerts = JSON.parse(execFileSync(bin, ['-c', `${base}/config/config.yaml`, 'decisions', 'list', '--ip', ip, '-o', 'json'], { encoding: 'utf8' })) ?? []
  return alerts.flatMap(alert => alert.decisions ?? [])
}
const ip = '127.88.22.3', normalIp = '127.88.22.2'
assert.equal(decisions(ip).length + decisions(normalIp).length, 0, 'source-state-contaminated')
const prior = decisions('127.88.18.3')
assert.ok(prior.some(d => d.scenario === 'bat-lab/request-burst'), 'prior-real-gateway-decision-lost')
async function emit(source_ip, site, count) {
  const lines = Array.from({ length: count }, () => JSON.stringify({ source_ip, site,
    at: new Date().toISOString(), valid: 'true', category: 'business', status: '200' }))
  await appendFile(path.join(directory, 'logs/observations.jsonl'), lines.join('\n') + '\n')
}
async function waitFor(predicate, label) {
  for (let i = 0; i < 20; i++) {
    const result = decisions(ip)
    if (predicate(result)) return result
    await delay(500)
  }
  throw Error(`decisions-timeout:${label}`)
}
async function ready() {
  for (let i = 0; i < 120; i++) {
    const connected = await new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port: 7422 })
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => resolve(false))
      socket.setTimeout(1000, () => { socket.destroy(); resolve(false) })
    })
    if (connected) return
    await delay(500)
  }
  throw Error('engine-acquisition-not-ready')
}
await ready()
await emit(normalIp, 'history-normal', 10)
await emit(ip, 'history-first', 42)
const first = await waitFor(rows => rows.length === 1, 'first')
await writeFile(path.join(out, 'first.json'), JSON.stringify(first))
assert.ok(first[0].duration.startsWith('3h59m') || first[0].duration.startsWith('4h'), 'first-history-duration')
// 验证现有systemd归属后重启该引擎；绝不删决策/桶/数据库制造干净状态。
const cwd = execFileSync('systemctl', ['--user', 'show', 'bat-antibot-engine.service', '--property=WorkingDirectory', '--value'], { encoding: 'utf8' }).trim()
assert.equal(cwd, base, 'engine-owner-changed')
execFileSync('systemctl', ['--user', 'restart', 'bat-antibot-engine.service'])
for (let i = 0; i < 40; i++) {
  try { if (decisions(ip).length === 1) break } catch {}
  await delay(500)
}
await ready() // AppSec listener starts after parser/acquisition; LAPI being up alone is insufficient.
const persisted = decisions(ip)
assert.equal(persisted[0].id, first[0].id)
await writeFile(path.join(out, 'persisted.json'), JSON.stringify(persisted))
await emit(ip, 'history-second', 42)
// cscli默认按scope/value/type去重；检测时长升级，而不是假定CLI展示两个同源决策。
const repeated = await waitFor(rows => rows.some(d => /^([78])h/.test(d.duration)), 'escalated')
assert.ok(repeated.some(d => d.duration.startsWith('7h59m') || d.duration.startsWith('8h')), 'recidivism-not-escalated')
assert.equal(decisions(normalIp).length, 0)
await writeFile(path.join(out, 'result.json'), JSON.stringify({ kind: 'live-engine-synthetic-event-history',
  first, persisted, repeated, normalDecisions: 0, previousRealGatewayDecisionPersisted: prior.length,
  replayedClock: false, actualElapsedDays: 0, activeBucketRestartContinuity: 'not-proven', sourcesReset: false }, null, 2))
console.log(JSON.stringify({ evidence: out, persisted: true, repeatedHours: 8, normalPassed: true }))
