import { mkdir, writeFile, readFile, mkdtemp } from "node:fs/promises"
import path from "node:path"
import { directory, hubCommit, binaries, linuxPath, wsl } from "../paths.ts"
import { parser, rules } from "../rules.ts"

// WHY：执行真正固定引擎。时间回放只验证窗口逻辑；不冒充小时/天级真实时间验收。
const out = await mkdtemp(path.join(directory, "reports/scenarios-"))
const hub = path.join(directory, "runtime/hub", `hub-${hubCommit}`)
const testName = `bat-${path.basename(out).slice(-6)}`
const test = path.join(hub, ".tests", testName)
await mkdir(test, { recursive: true })
await mkdir(path.join(hub, "parsers/s01-parse/bat-lab"), { recursive: true })
await mkdir(path.join(hub, "scenarios/bat-lab"), { recursive: true })
await writeFile(path.join(hub, "parsers/s01-parse/bat-lab/observation.yaml"), JSON.stringify(parser))
for (const rule of rules) await writeFile(path.join(hub, "scenarios", `${rule.name}.yaml`), JSON.stringify(rule))
const events: object[] = []
let sequence = 0
function emit(group: number, count: number, seconds: number, patch: (i: number) => object = () => ({})) {
  for (let i = 0; i < count; i++) events.push({ at: new Date(Date.UTC(2026, 0, 1) + sequence++ * 1 + i * seconds * 1000).toISOString(),
    source_ip: `192.0.2.${group}`, site: "owned.test", session: `s${group}`, account: "", device: "", category: "business",
    outcome: "ok", status: "200", trusted: "true", valid: "true", ua: "", tls_family: "", transport: 't', ...patch(i) })
}
emit(1, 42, 0) // burst abnormal
emit(2, 42, 2) // normal request cadence
emit(3, 7, 1, () => ({ status: '429' }))
emit(4, 7, 15, () => ({ status: '429' }))
emit(5, 65, 2) // hour budget abnormal, outside short burst threshold
emit(6, 65, 65) // normal hour counterexample
emit(7, 300, 61) // day budget abnormal, below hourly sustained rate
emit(8, 245, 370) // normal day counterexample
emit(9, 7, 1, i => ({ category: 'auth', outcome: 'failed', account: 'synthetic-one', device: `d${i}` }))
emit(10, 7, 1, i => ({ category: 'auth', outcome: 'ok', account: 'synthetic-normal', device: `d${i}` }))
emit(11, 7, 1, i => ({ category: 'auth', outcome: 'failed', account: `synthetic-${i}`, device: 'device-11' }))
emit(12, 7, 1, i => ({ category: 'auth', outcome: 'failed', account: `normal-${i}`, device: `device-12-${i}` }))
emit(13, 2, 1, i => ({ category: 'protocol', ua: 'same', tls_family: i ? 'openssl' : 'chrome' }))
emit(14, 3, 1, () => ({ category: 'protocol', ua: 'same', tls_family: 'chrome' }))
emit(15, 1, 0, () => ({ category: 'input', event_type: 'input', trusted: 'false' }))
emit(16, 3, 1, () => ({ category: 'input', event_type: 'input', trusted: 'true' }))
emit(17, 1, 0, () => ({ category: 'input', valid: 'false', trusted: 'false' }))
emit(18, 3, 1, () => ({ category: 'protocol', ua: 'same', tls_family: '' }))
emit(19, 1, 0, () => ({ category: 'input', event_type: 'compositionend', trusted: 'false' }))
emit(20, 1, 0, () => ({ category: 'honeypot', outcome: 'entered' }))
emit(21, 1, 0, () => ({ category: 'honeypot', outcome: 'prefetch' }))
emit(22, 1, 0, () => ({ category: 'browser-marker', detector: 'detectWebDriver', outcome: 'detected' }))
emit(23, 1, 0, () => ({ category: 'browser-marker', detector: 'detectWebDriver', outcome: 'clear' }))
emit(24, 1, 0, () => ({ category: 'browser-marker', detector: 'detectWebDriver', outcome: 'detected', valid: 'false' }))
emit(25, 2, 1, i => ({ category: 'protocol', ua: 'same', tls_family: i ? 'chrome-quic' : 'chrome-tcp', transport: i ? 'q' : 't' }))
emit(26, 2, 1, () => ({ category: 'protocol', ua: 'same', tls_family: 'psk-normalized-chrome' }))
events.sort((a, b) => String((a as { at: string }).at).localeCompare(String((b as { at: string }).at)))
await writeFile(path.join(test, "events.log"), events.map(e => JSON.stringify(e)).join('\n') + '\n')
await writeFile(path.join(test, "config.yaml"), JSON.stringify({ parsers: ["./parsers/s01-parse/bat-lab/observation.yaml", "crowdsecurity/dateparse-enrich"],
  scenarios: rules.map(rule => `./scenarios/${rule.name}.yaml`), postoverflows: [], log_file: "events.log", log_type: "bat-lab", ignore_parsers: true }))
const expected: Record<string, string[]> = {
  'request-burst': ['192.0.2.1'], 'repeated-failure': ['192.0.2.3'], 'hour-budget': ['192.0.2.5'],
  'day-budget': ['192.0.2.7'], 'account-device-failures': ['192.0.2.9'], 'device-account-failures': ['192.0.2.11'],
  'protocol-continuity': ['192.0.2.13'], 'scripted-input': ['192.0.2.15'], 'telemetry-invalid': ['192.0.2.17', '192.0.2.24'],
  'honeypot-entry': ['192.0.2.20'],
  'browser-marker': ['192.0.2.22'],
}
const assertions = Object.entries(expected).map(([rule, ips]) =>
  `len(filter(results, { .Overflow.Alert.GetScenario() == "bat-lab/${rule}" })) == ${ips.length}`)
for (const [rule, ips] of Object.entries(expected)) for (const ip of ips) assertions.push(
  `any(results, { .Overflow.Alert.GetScenario() == "bat-lab/${rule}" && "${ip}" in .Overflow.GetSources() })`)
assertions.push(`len(results) == ${Object.values(expected).flat().length}`)
await writeFile(path.join(test, "scenario.assert"), assertions.join('\n') + '\n')
await writeFile(path.join(test, "parser.assert"), "\n")
await writeFile(path.join(out, "preconditions.json"), JSON.stringify({ expected, samples: events.length,
  purpose: 'isolated-rule-calibration', normalGroups: [2,4,6,8,10,12,14,16,18,19,21,23,25,26], realTime: false }, null, 2))
const base = linuxPath(directory), bin = binaries(base)
// WHY：unix socket既有108字节限制，也不支持DrvFS；仅测试runtime放WSL ext4，源码仍复用固定Hub。
const temporary = wsl(['mktemp', '-d', '/tmp/bat-hub-XXXXXX'], true).trim()
const alias = `${temporary}/h`, target = linuxPath(hub)
wsl(['mkdir', '-p', `${alias}/.tests`], true)
for (const file of ['template_config2.yaml', 'template_profiles.yaml', 'template_simulation.yaml']) {
  wsl(['cp', `${target}/.tests/${file}`, `${alias}/.tests/${file}`], true)
}
for (const folder of ['parsers', 'scenarios', 'collections', 'appsec-configs', 'appsec-rules', '.index.json']) {
  wsl(['ln', '-s', `${target}/${folder}`, `${alias}/${folder}`], true)
}
wsl(['cp', '-r', linuxPath(test), `${alias}/.tests/${testName}`], true)
await writeFile(path.join(out, 'alias-owner.json'), JSON.stringify({ alias, target, temporary }))
try {
  const result = wsl([bin.cscli, '-c', `${base}/config/config.yaml`, 'hubtest', 'run', testName,
    '--hub', alias, '--crowdsec', bin.crowdsec, '--cscli', bin.cscli, '--no-clean', '-o', 'json'], true)
  await writeFile(path.join(out, 'result.json'), result)
  console.log(JSON.stringify({ evidence: out, result: JSON.parse(result) }))
} catch (error) {
  const value = error as { stdout?: string; stderr?: string }
  await writeFile(path.join(out, 'first-failure.log'), `${value.stdout ?? ''}\n${value.stderr ?? ''}`)
  console.error(`calibration_failed: ${out}`); process.exitCode = 1
} finally {
  // 保留这次独立引擎的结果以解释首败；不是运行资源，也不称永久清理。
  await writeFile(path.join(out, 'runtime-location.json'), JSON.stringify({ path: `${alias}/.tests/${testName}`, retained: true }))
}
