import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const base = path.resolve('work/antibot-service')
const out = path.join(base, 'reports', `challenge-errors-${Date.now()}`)
await mkdir(out)
const host = `challenge-errors-${Date.now()}.localhost`
const source = '127.88.26.3'
function request(method, pathname, body = '', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 4187, localAddress: source, method, path: pathname,
      headers: { Host: host, 'User-Agent': 'Owned protocol-error calibration', ...headers,
        'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let value = ''; res.setEncoding('utf8'); res.on('data', chunk => { value += chunk });
      res.on('end', () => resolve({ status: res.statusCode, body: value, hasCookie: Boolean(res.headers['set-cookie']) }))
    })
    req.on('error', reject); req.setTimeout(10000, () => req.destroy(Error('timeout'))); req.end(body)
  })
}
const results = []
for (const [name, payload] of [['missing-fields', ''], ['bad-ticket', 'r=bad&ts=1&sig=bad&n=1&p=bad&m=bad&d=20&f=bad']]) {
  const result = await request('POST', '/crowdsec-internal/challenge/submit', payload)
  results.push({ name, ...result })
}
const cookie = await request('GET', '/measurement/read', '', { Cookie: '__crowdsec_challenge=invalid' })
results.push({ name: 'invalid-cookie', status: cookie.status, reChallenged: cookie.body.includes('crowdsec'), hasCookie: cookie.hasCookie })
const logs = (await readFile(path.join(base, 'logs/access.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  .filter(row => row.RequestHost === host)
await writeFile(path.join(out, 'result.json'), JSON.stringify({ source, results, counters: {
  client: 3, gateway: logs.length, origin: logs.filter(row => row.OriginStatus > 0).length },
  normalChallengeReference: 'existing comparison.json; no unchanged rerun', resets: false }, null, 2))
for (const result of results.slice(0, 2)) {
  assert.equal(result.status, 200, 'protocol-envelope-status')
  assert.equal(JSON.parse(result.body).status, 'failed', result.name)
  assert.equal(result.hasCookie, false, 'bad-submit-issued-cookie')
}
assert.ok(results[2].reChallenged, 'bad-cookie-not-rechallenged')
assert.equal(logs.length, 3)
assert.equal(logs.filter(row => row.OriginStatus > 0).length, 0)
console.log(JSON.stringify({ evidence: out, invalidSubmissionsDenied: 2, invalidCookieRechallenged: true, originArrivals: 0 }))
