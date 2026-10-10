// WHY：当前公开数据属性、关联异常和无效测量由真实CrowdSec判定；不伪造公网连接。
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises'
import path from 'node:path'
import { parseSource, refreshSource, sourceRules, sourceStatus } from '../../../tools/antibot-lab/source-data.js'
import { binaries, directory, hubCommit, linuxPath, wsl } from '../../../tools/antibot-lab/paths.js'

const cached = process.argv[2]
assert.ok(cached, 'provide-previously-fetched-owned-data-directory')
const source = path.resolve(cached)
assert.ok(source.startsWith(path.join(directory, 'reports') + path.sep))
const out = await mkdtemp(path.join(directory, 'reports/source-calibration-'))
await cp(path.join(source, 'data'), path.join(out, 'data'), { recursive: true })
const data = await sourceStatus(out)
assert.equal(data.status, 'available'); assert.ok('source' in data)
const list = (await readFile(path.join(out, `data/tor-${data.listDigest}.txt`), 'utf8')).trim().split('\n')
const normal = list[0]!, abnormal = list[1]!, other = '192.0.2.21'
assert.ok(normal && abnormal && !list.includes(other))
const fixture = { version: '8.0', relays_published: new Date().toISOString().slice(0, 19).replace('T', ' '), relays: [{ exit_addresses: [normal] }] }
for (const value of [{ ...fixture, version: '9.0' }, { ...fixture, relays: [] }, { ...fixture, relays: [{}] },
  { ...fixture, relays_published: '2000-01-01 00:00:00' }, { ...fixture, relays_published: '2099-01-01 00:00:00' },
  { ...fixture, relays: [{ exit_addresses: ['not-ip'] }] }]) assert.throws(() => parseSource(JSON.stringify(value)))
const oldFetch = globalThis.fetch
try {
  globalThis.fetch = async (_input, init) => {
    assert.ok(new Headers(init?.headers).get('if-modified-since'))
    return new Response(null, { status: 304 })
  }
  assert.equal((await refreshSource(out)).expires, data.expires, '304-extended-source-age')
  globalThis.fetch = async () => new Response('unavailable', { status: 503 })
  await assert.rejects(() => refreshSource(out), /source_data_http_503/)
  assert.equal((await sourceStatus(out)).status, 'available', 'failed-refresh-damaged-valid-cache')
} finally { globalThis.fetch = oldFetch }
const selected = sourceRules(data)
selected.push(sourceRules({ ...data, expires: '2000-01-01T00:00:00.000Z' })[2]!)
selected[2]!.name = 'bat-lab/source-data-current'
const hub = path.join(directory, 'runtime/hub', `hub-${hubCommit}`), testName = 'sources-' + path.basename(out).slice(-6)
const target = linuxPath(hub), temporary = wsl(['mktemp', '-d', '/tmp/bat-src-XXXXXX'], true).trim(), alias = `${temporary}/h`
for (const folder of ['.tests', '.cache/data', 'scenarios/bat-lab', 'parsers/s01-parse/bat-lab']) wsl(['mkdir', '-p', `${alias}/${folder}`], true)
for (const file of ['template_config2.yaml', 'template_profiles.yaml', 'template_simulation.yaml']) wsl(['cp', `${target}/.tests/${file}`, `${alias}/.tests/${file}`], true)
for (const folder of ['collections', 'appsec-configs', 'appsec-rules', '.index.json']) wsl(['ln', '-s', `${target}/${folder}`, `${alias}/${folder}`], true)
wsl(['ln', '-s', `${target}/parsers/s02-enrich`, `${alias}/parsers/s02-enrich`], true)
const test = path.join(out, testName); await mkdir(test)
const parser = { name: 'bat-lab/source-fixture', filter: "evt.Line.Labels.type == 'bat-source'", onsuccess: 'next_stage', statics: [
  { meta: 'log_type', value: 'http_access-log' }, { meta: 'service', value: 'owned-source-fixture' },
  { target: 'evt.StrTime', expression: "JsonExtract(evt.Line.Raw, 'at')" },
  ...['source_ip', 'http_status'].map(name => ({ meta: name, expression: `JsonExtract(evt.Line.Raw, '${name}')` })),
] }
await writeFile(path.join(out, 'parser.yaml'), JSON.stringify(parser))
wsl(['cp', linuxPath(path.join(out, 'parser.yaml')), `${alias}/parsers/s01-parse/bat-lab/source-fixture.yaml`], true)
for (const rule of selected) {
  const file = path.join(out, rule.name.split('/')[1] + '.yaml'); await writeFile(file, JSON.stringify(rule))
  wsl(['cp', linuxPath(file), `${alias}/scenarios/${rule.name}.yaml`], true)
}
wsl(['cp', linuxPath(path.join(out, `data/tor-${data.listDigest}.txt`)), `${alias}/.cache/data`], true)
const events = [normal, ...Array(7).fill(abnormal), ...Array(7).fill(other), ''].map((source_ip, index) => ({
  at: new Date(Date.now() + index * 100).toISOString(), source_ip, http_status: index ? '429' : '200' }))
await writeFile(path.join(test, 'events.log'), events.map(value => JSON.stringify(value)).join('\n') + '\n')
await writeFile(path.join(test, 'config.yaml'), JSON.stringify({ parsers: ['./parsers/s01-parse/bat-lab/source-fixture.yaml', 'crowdsecurity/dateparse-enrich'],
  scenarios: selected.map(rule => `./scenarios/${rule.name}.yaml`), postoverflows: [], log_file: 'events.log', log_type: 'bat-source', ignore_parsers: true }))
await writeFile(path.join(test, 'parser.assert'), '\n')
await writeFile(path.join(test, 'scenario.assert'), [
  'len(results) == 6',
  'len(filter(results, {.Overflow.Alert.GetScenario() == "bat-lab/tor-exit-observed"})) == 2',
  `any(results, {.Overflow.Alert.GetScenario() == "bat-lab/tor-repeated-failure" && "${abnormal}" in .Overflow.GetSources()})`,
  'len(filter(results, {.Overflow.Alert.GetScenario() == "bat-lab/source-data-stale"})) == 3',
  'all(results, {.Overflow.Alert.Remediation == false})',
].join('\n') + '\n')
wsl(['cp', '-r', linuxPath(test), `${alias}/.tests/${testName}`], true)
await writeFile(path.join(out, 'preconditions.json'), JSON.stringify({ data, normal, abnormal, other, events: events.length,
  purpose: 'real-native-engine-synthetic-addresses-not-public-proxy-access', alias, temporary }, null, 2))
try {
  const base = linuxPath(directory), bin = binaries(base)
  const result = wsl([bin.cscli, '-c', `${base}/config/config.yaml`, 'hubtest', 'run', testName, '--hub', alias,
    '--crowdsec', bin.crowdsec, '--cscli', bin.cscli, '--no-clean', '-o', 'json'], true)
  await writeFile(path.join(out, 'result.json'), result)
  await writeFile(path.join(out, 'passed.json'), JSON.stringify({ boundaryCases: 8, native: JSON.parse(result), noBrowser: true,
    dataDate: data.published, currentData: true, globalReputationProven: false, noPublicRelayAccess: true }, null, 2))
  console.log(JSON.stringify({ evidence: out, passed: true }))
} catch (error) {
  const failure = error as { stdout?: string; stderr?: string }
  await writeFile(path.join(out, 'first-failure.log'), `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`)
  throw Error(`native-source-calibration-failed:${out}`)
}
