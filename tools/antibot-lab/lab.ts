import { readFile, writeFile } from "node:fs/promises"
import { ensureWslPresence } from './wsl-presence.ts'
import { existsSync } from 'node:fs'
import { verifyPrebuilt } from './prebuilt.ts'
import path from "node:path"
import net from "node:net"
import https from "node:https"
import { z } from "zod"
import { createHash } from 'node:crypto'
import { prepare, prepareEdgeArtifacts, prepareH2Artifacts } from "./prepare.ts"
import { configure } from "./settings.ts"
import { configureEdge } from './edge.ts'
import { refreshSource, configureSource, sourceStatus } from './source-data.ts'
import { configureGeoScoring, geoSourceStatus } from './geo-source.ts'
import { requireProbes } from './creep.ts'
import { relocate } from './relocate.ts'
import { sharedBudget } from './shared-budget.ts'
import { trustLocalhost } from './trusted-tls.ts'
import { configureTls } from './tls.ts'
import { configureVerification } from './verification-config.ts'
import { directory, root, linuxPath, binaries, units, wsl, hubCommit } from "./paths.ts"

const command = process.argv[2] ?? "status"
const metadata = z.object({ base: z.string(), checkout: z.string() })
async function prepared() { return metadata.parse(JSON.parse(await readFile(path.join(directory, "prepared.json"), "utf8"))) }
function active(unit: string) {
  try { return wsl(["systemctl", "--user", "is-active", `${unit}.service`], true).trim() === "active" } catch { return false }
}
async function readiness() {
  const { base } = await prepared()
  await requireProbes(directory)
  const response = await fetch("http://127.0.0.1:4188/api/health", { signal: AbortSignal.timeout(2000) })
  const health = z.object({ owner: z.literal("bat-antibot-lab"), base: z.string() }).parse(await response.json())
  if (health.base !== base) throw Error("lab_owner_changed")
  // WHY：网关/管理页或LAPI先ready不代表AppSec采集已启动，不能过早开始验收。
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: 7422 })
    socket.once('connect', () => { socket.destroy(); resolve() })
    socket.once('error', reject)
    socket.setTimeout(1500, () => { socket.destroy(); reject(Error('appsec_not_ready')) })
  })
  const site = await fetch("http://127.0.0.1:4187", { signal: AbortSignal.timeout(3000) })
  if (!site.ok) throw Error("gateway_not_ready")
  await site.body?.cancel()
  const ca = await readFile(path.join(directory, 'tls/rootCA.pem')).catch(() => readFile(path.join(directory, 'tls/cert.pem')))
  for (const url of ['https://localhost:4183/', 'https://localhost:4193/health']) await new Promise<void>((resolve, reject) => {
    const request = https.get(url, { ca, timeout: 3000 }, response => {
      response.resume()
      if (response.statusCode !== 200) reject(Error('tls_gateway_not_ready'))
      else response.once('end', resolve)
    })
    request.once('error', reject)
    request.once('timeout', () => request.destroy(Error('tls_gateway_timeout')))
  })
  return { ready: true, management: "http://127.0.0.1:4188", site: "http://127.0.0.1:4187", tls: 'https://localhost:4183', h2: 'https://localhost:4193', check:'https://localhost:4185/measurement/check' }
}
async function start() {
  const { base, checkout } = await prepared()
  if (base !== linuxPath(directory) || checkout !== linuxPath(root)) throw Error('lab_owner_changed')
  if (existsSync(path.join(directory, 'runtime-release.json'))) await verifyPrebuilt(directory, undefined, true)
  await configureTls(base)
  const dependency = await sharedBudget()
  const loaded = z.object({ status: z.literal('ready'), sourceDigest: z.string(), wheelSha256: z.string() })
    .parse(JSON.parse(wsl(['/usr/bin/python3', '-I', `${checkout}/budget.py`, base, '--check-dependencies'], true)))
  if (loaded.sourceDigest !== dependency.sourceDigest || loaded.wheelSha256 !== dependency.wheelSha256) throw Error('request_budget_module_changed')
  await requireProbes(directory)
  // WHY：已选择的地理数据过期/损坏时不能以正常启动掩盖；维护刷新不要求台式机常开。
  const geography = await geoSourceStatus(directory)
  if (geography.status !== 'available' || !('expires' in geography)) throw Error('refresh_geo_source_before_start')
  await configureGeoScoring(geography.expires, active('bat-antibot-engine'))
  await configureVerification(active('bat-antibot-engine'))
  if ((await sourceStatus(directory)).status !== 'available') throw Error('refresh_network_source_before_start')
  const bin = binaries(base)
  if (!active('bat-antibot-edge')) await configureEdge(base, bin.haproxy)
  const h2 = JSON.parse(await readFile(path.join(directory, 'h2-online.json'), 'utf8'))
  if (createHash('sha256').update(await readFile(path.join(directory, 'runtime/h2-hints/h2-hints'))).digest('hex') !== h2.classifierSha256)
    throw Error('h2_classifier_changed')
  if (bin.crowdsec.endsWith('/crowdsec-persistent/crowdsec')) {
    const receipt = JSON.parse(await readFile(path.join(directory, 'persistent-engine.json'), 'utf8'))
    const digest = createHash('sha256').update(await readFile(path.join(directory, 'runtime/crowdsec-persistent/crowdsec'))).digest('hex')
    if (digest !== receipt.binarySha256) throw Error('persistent_engine_binary_changed')
  }
  await writeFile(path.join(directory, "logs/access.jsonl"), "", { flag: "a" })
  await writeFile(path.join(directory, "service-owner.json"), JSON.stringify({ root, base, units, createdAt: new Date().toISOString() }, null, 2))
  const commands = [
    [bin.crowdsec, "-c", `${base}/config/config.yaml`],
    [bin.node, `${checkout}/origin.ts`],
    [bin.traefik, "--configFile", `${base}/traefik.yaml`],
    [bin.haproxy, '-db', '-f', `${base}/haproxy.cfg`],
    ['/usr/bin/python3', `${checkout}/h2-online.py`, base],
  ]
  for (const [i, unit] of units.entries()) {
    if (active(unit)) {
      const cwd = wsl(["systemctl", "--user", "show", `${unit}.service`, "--property=WorkingDirectory", "--value"], true).trim()
      if (cwd !== base) throw Error("unit_owner_changed")
      continue
    }
    // WHY：进程归属/重启/关闭交给 systemd 用户服务，不另造守护进程管理器。
    wsl(["systemd-run", "--user", "--unit", unit, "--collect", "--property", `WorkingDirectory=${base}`,
      // WHY：控制台配置是Windows路径；原systemd负责给WSL进程传入同一数据目录的Linux路径。
      `--setenv=BAT_ANTIBOT_DATA=${base}`,
      "--property", "Restart=on-failure", "--property", "RestartSec=3", "--property", "KillMode=control-group",
      "--property", "TimeoutStopSec=20", "--property", "MemoryMax=1G",
      ...(unit === 'bat-antibot-edge' ? ['--property', `StandardOutput=append:${base}/logs/tls.jsonl`] : []), ...commands[i]!])
  }
  ensureWslPresence(base)
  const deadline = Date.now() + 60_000
  while (true) {
    try { console.log(JSON.stringify(await readiness())); break }
    catch (error) { if (Date.now() >= deadline) throw error }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
async function main() {
  if (command === 'relocate') {
    if (!process.argv[3]) throw Error('usage: lab.ts relocate <previous-absolute-source-directory>')
    console.log(JSON.stringify(await relocate(process.argv[3])))
    return
  }
  // WHY：长窗口验收依赖真实连续时间；不能让常规维护静默重置仍在运行的活动桶。
  if (["prepare", "prepare-edge", "activate-edge-h2", "configure", "trust-localhost", "refresh-source-data", "refresh-geodata", "stop"].includes(command) && active("bat-antibot-window-test")) {
    throw Error("live_window_validation_running")
  }
  if (command === 'trust-localhost') {
    if (units.some(active)) throw Error('stop_lab_before_trusting_localhost')
    const { base, checkout } = await prepared()
    if (base !== linuxPath(directory) || checkout !== linuxPath(root)) throw Error('lab_owner_changed')
    const receipt = await trustLocalhost(base)
    await configureEdge(base)
    console.log(JSON.stringify(receipt))
    return
  }
  if (command === 'activate-edge-h2') {
    if (units.some(active)) throw Error('stop_lab_before_activating_edge')
    const { base, checkout } = await prepared()
    if (base !== linuxPath(directory) || checkout !== linuxPath(root)) throw Error('lab_owner_changed')
    const receipt = z.object({ upstream: z.literal('3.2.9-1ubuntu2.2'), binarySha256: z.string(),
      adapterSha256: z.string(), h3AdapterSha256: z.string(), recipeSha256: z.string(),
      rttAdapterSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() })
      .parse(JSON.parse(await readFile(path.join(directory, 'runtime/haproxy-h2/candidate.json'), 'utf8')))
    for (const [file, digest] of [[path.join(directory, 'runtime/haproxy-h2/haproxy'), receipt.binarySha256],
      [path.join(root, 'edge-h2-samples.c'), receipt.adapterSha256],
      [path.join(root, 'edge-h3-samples.c'), receipt.h3AdapterSha256],
      [path.join(root, 'prepare-edge-h2.py'), receipt.recipeSha256],
      ...(receipt.rttAdapterSha256 ? [[path.join(root, 'edge-ssl-rtt.c'), receipt.rttAdapterSha256]] : [])]) {
      if (createHash('sha256').update(await readFile(file!)).digest('hex') !== digest) throw Error('edge_h2_candidate_changed')
    }
    await configureEdge(base, `${base}/runtime/haproxy-h2/haproxy`, receipt)
    await writeFile(path.join(directory, 'edge-h2.json'), JSON.stringify(receipt, null, 2))
    console.log(JSON.stringify({ selectedForCalibration: true, detectionAccepted: false }))
    return
  }
  if (command === 'refresh-geodata') return wsl(['/usr/bin/python3', linuxPath(path.join(root, 'prepare-geodata.py'))])
  if (command === 'refresh-source-data') {
    if (active('bat-antibot-engine')) throw Error('stop_engine_before_refreshing_source_data')
    await refreshSource(directory)
    console.log(JSON.stringify(await configureSource(directory)))
    return
  }
  if (command === "configure") {
    if (units.some(active)) throw Error("stop_lab_before_configuring")
    const { base, checkout } = await prepared()
    if (base !== linuxPath(directory) || checkout !== linuxPath(root)) throw Error("lab_owner_changed")
    const secrets = z.object({ bouncer: z.string().length(64), master: z.string().length(64) })
      .parse(JSON.parse(await readFile(path.join(directory, "secrets.json"), "utf8")))
    await configure(base, checkout, secrets)
    wsl([binaries(base).cscli, '-c', `${base}/config/config.yaml`, '--branch', hubCommit,
      'parsers', 'install', 'crowdsecurity/dateparse-enrich'])
    wsl([binaries(base).crowdsec, "-c", `${base}/config/config.yaml`, "-t"])
    return
  }
  if (command === "prepare" || command === 'initialize') {
    if (units.some(active)) throw Error("stop_lab_before_preparing")
    return prepare(command === 'initialize')
  }
  if (command === 'prepare-edge') {
    if (units.some(active)) throw Error('stop_lab_before_preparing')
    return prepareEdgeArtifacts()
  }
  if (command === 'prepare-h2') {
    if (active('bat-antibot-h2')) throw Error('stop_h2_before_rebuilding')
    return prepareH2Artifacts()
  }
  if (command === "start") return start()
  if (command === "status") {
    console.log(JSON.stringify({ services: Object.fromEntries(units.map(unit => [unit, active(unit)])),
      health: await readiness().catch(error => ({ ready: false, reason: error instanceof Error ? error.message : 'health_unavailable' })), networkSource: await sourceStatus(directory),
      geographySource: await geoSourceStatus(directory) }))
    return
  }
  if (command === "stop") {
    const { base } = await prepared()
    const owner = z.object({ base: z.string(), units: z.array(z.string()) }).parse(JSON.parse(await readFile(path.join(directory, "service-owner.json"), "utf8")))
    if (base !== linuxPath(directory) || owner.base !== base || JSON.stringify(owner.units) !== JSON.stringify(units)) throw Error("lab_owner_changed")
    for (const unit of [...units].reverse()) {
      if (!active(unit)) continue
      const cwd = wsl(["systemctl", "--user", "show", `${unit}.service`, "--property=WorkingDirectory", "--value"], true).trim()
      if (cwd !== base) throw Error("unit_owner_changed")
      wsl(["systemctl", "--user", "stop", `${unit}.service`])
    }
    if (active("bat-antibot-presence")) {
      const cwd = wsl(["systemctl", "--user", "show", "bat-antibot-presence.service", "--property=WorkingDirectory", "--value"], true).trim()
      if (cwd !== base) throw Error("presence_owner_changed")
      wsl(["systemctl", "--user", "stop", "bat-antibot-presence.service"])
    }
    return
  }
  if (command === "metrics" || command === "alerts") {
    const { base } = await prepared()
    return wsl([binaries(base).cscli, "-c", `${base}/config/config.yaml`, ...(command === "metrics" ? ["metrics", "show", "appsec"] : ["alerts", "list", "-o", "json"])])
  }
  throw Error("usage: lab.ts prepare|prepare-edge|activate-edge-h2|prepare-h2|configure|trust-localhost|refresh-source-data|refresh-geodata|start|status|stop|metrics|alerts")
}
await main().catch(error => { console.error(error instanceof Error ? error.message : "lab_failed"); process.exitCode = 1 })
