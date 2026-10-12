import { createHash, randomBytes } from "node:crypto"
import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { directory, root, hubCommit, pluginCommit, pluginModule, linuxPath, linuxArchitecture, binaries, wsl } from "./paths.ts"
import { artifacts } from './artifacts.ts'
import { verifyPrebuilt } from './prebuilt.ts'
import { configure } from "./settings.ts"
import { sharedBudget } from './shared-budget.ts'
import { configureVerification } from './verification-config.ts'

async function exists(file: string) { return access(file).then(() => true, () => false) }
async function artifact(item: { name: string; url: string; sha256: string }) {
  const file = path.join(directory, "upstream", item.name)
  if (!await exists(file)) {
    const response = await fetch(item.url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw Error(`download_${response.status}: ${item.name}`)
    await writeFile(file, Buffer.from(await response.arrayBuffer()), { flag: "wx" })
  }
  const digest = createHash("sha256").update(await readFile(file)).digest("hex")
  if (digest !== item.sha256) throw Error(`artifact_digest_mismatch: ${item.name}`)
}
async function extract(archive: string, destination: string, prebuilt = false) {
  const marker = path.join(destination, ".artifact-ready")
  if (await exists(marker)) return
  await mkdir(destination, { recursive: true })
  const members = prebuilt && archive === 'crowdsec-release.tgz' ? ['crowdsec-v1.8.1/config']
    : archive === "node.tar.xz" ? [`node-v24.9.0-linux-${linuxArchitecture()}/bin/node`, `node-v24.9.0-linux-${linuxArchitecture()}/LICENSE`] : []
  wsl(["tar", "-xf", linuxPath(path.join(directory, "upstream", archive)), "-C", linuxPath(destination), ...members], true)
  await writeFile(marker, archive)
}
export async function prepare(prebuilt = false) {
  if (prebuilt) await verifyPrebuilt()
  await sharedBudget()
  await mkdir(path.join(directory, "upstream"), { recursive: true })
  const items = await artifacts()
  await Promise.all(items.map(artifact))
  if (!prebuilt) { await prepareEdgeArtifacts(); await prepareH2Artifacts() }
  for (const [archive, folder] of [["crowdsec-release.tgz", "crowdsec"], ["traefik.tar.gz", "traefik"], ["node.tar.xz", "node"], ["hub.tar.gz", "hub"], ["bouncer.tar.gz", "bouncer"], ["botd-2.0.0.tgz", "botd"], ["motion-attestation-1.1.0.tgz", "motion"]]) {
    if (prebuilt && ['node', 'traefik'].includes(folder!)) continue
    await extract(archive!, path.join(directory, "runtime", folder!), prebuilt)
  }
  const fingerprint = path.join(directory, 'runtime/crowdsec-909b5157986a2b2c2163300fdaef5ed01289f7d2/pkg/appsec/challenge/js/fpscanner/fpscanner.js')
  if (!await exists(fingerprint)) wsl(['tar', '-xf', linuxPath(path.join(directory, 'upstream/crowdsec-source-v1.8.1.tar.gz')),
    '-C', linuxPath(path.join(directory, 'runtime'))], true)
  if (!prebuilt) { await nativeCrowdsec(); await prepareGeoValidator() }
  const creep = path.join(directory, 'runtime/creepjs-10aa6724cd33a1015db1574211890518cd04f0cc/src/lies/index.ts')
  if (!await exists(creep)) wsl(['tar', '-xf', linuxPath(path.join(directory, 'upstream/creepjs-10aa6724.tar.gz')),
    '-C', linuxPath(path.join(directory, 'runtime'))], true)
  const pluginDestination = path.join(directory, "plugins-local/src", pluginModule)
  if (!await exists(pluginDestination)) await cp(path.join(directory, "runtime/bouncer", `crowdsec-bouncer-traefik-plugin-${pluginCommit}`), pluginDestination, { recursive: true })
  const secretPath = path.join(directory, "secrets.json")
  if (!await exists(secretPath)) await writeFile(secretPath, JSON.stringify({ bouncer: randomBytes(32).toString("hex"), master: randomBytes(32).toString("hex") }), { mode: 0o600, flag: "wx" })
  const secrets = z.object({ bouncer: z.string().length(64), master: z.string().length(64) }).parse(JSON.parse(await readFile(secretPath, "utf8")))
  const base = linuxPath(directory)
  const checkout = linuxPath(root)
  await configure(base, checkout, secrets)
  const bin = binaries(base)
  wsl(["chmod", "+x", ...Object.values(bin)])
  const cli = [bin.cscli, "-c", `${base}/config/config.yaml`, "--branch", hubCommit]
  // WHY：复用 cscli 解析依赖、校验固定 Hub 内容；不复制 collection 安装器。
  wsl([...cli, "collections", "install", "crowdsecurity/appsec-bot-challenge", "crowdsecurity/appsec-generic-rules", "crowdsecurity/appsec-virtual-patching", "crowdsecurity/traefik"])
  wsl([...cli, "parsers", "install", "crowdsecurity/syslog-logs", "crowdsecurity/dateparse-enrich"])
  wsl([...cli, "parsers", "remove", "crowdsecurity/whitelists"])
  // WHY：已缓存 Hub 项目不会由 install 补齐数据集；官方 upgrade 会刷新已安装项目的数据。
  wsl([...cli, "hub", "upgrade"])
  await configureVerification(false)
  const registered = path.join(directory, ".registered")
  if (!await exists(registered)) {
    wsl([...cli, "machines", "add", "bat-antibot-lab", "--auto", "--url", "http://127.0.0.1:7423", "--file", `${base}/config/lab-local-api.yaml`])
    try { wsl([...cli, "bouncers", "add", "bat-antibot-gateway", "--key", secrets.bouncer], true) }
    catch { throw Error("bouncer_registration_failed") }
    await writeFile(registered, new Date().toISOString())
  }
  wsl([bin.crowdsec, "-c", `${base}/config/config.yaml`, "-t"])
  await writeFile(path.join(directory, "prepared.json"), JSON.stringify({ base, checkout, architecture: linuxArchitecture(), artifacts: items, at: new Date().toISOString() }, null, 2))
  console.log("Prepared pinned CrowdSec/Hub/Traefik. No Docker or system installation.")
}

export async function prepareEdgeArtifacts() {
  const items = await artifacts()
  await Promise.all(items.filter(item => /^(haproxy|ja4-haproxy)-/.test(item.name)).map(artifact))
  // WHY：空实例尚无runtime父目录；dpkg-deb不会替调用者创建缺失的父级。
  await mkdir(path.join(directory, 'runtime/haproxy'), { recursive: true })
  wsl(['dpkg-deb', '-x', linuxPath(path.join(directory, 'upstream/haproxy-3.2.9-ubuntu.deb')),
    linuxPath(path.join(directory, 'runtime/haproxy'))], true)
  wsl([binaries(linuxPath(directory)).haproxy, '-vv'], true)
}

export async function prepareH2Artifacts() {
  wsl(['/usr/bin/python3', '-c', 'import sys; assert sys.version_info >= (3, 11), "h2_requires_python_3_11"'], true)
  const items = await artifacts()
  await Promise.all(items.filter(item => /^(hypercorn|h2|hpack|hyperframe|h11|priority|wsproto|kitsune-h2)-/.test(item.name)).map(artifact))
  const target = path.join(directory, 'runtime/h2-hints')
  await mkdir(target, { recursive: true })
  const source = await readFile(path.join(directory, 'upstream/kitsune-h2-f0a22b3.go'), 'utf8')
  if (source.split('package fingerprint').length !== 2) throw Error('h2_upstream_package_changed')
  await writeFile(path.join(target, 'h2.go'), source.replace('package fingerprint', 'package main'))
  await cp(path.join(root, 'h2-fingerprint.go'), path.join(target, 'main.go'))
  const base = linuxPath(target)
  wsl(['go', 'build', '-o', `${base}/h2-hints`, `${base}/h2.go`, `${base}/main.go`], true)
  await writeFile(path.join(directory, 'h2-online.json'), JSON.stringify({ prepared: true,
    classifierSha256: createHash('sha256').update(await readFile(path.join(target, 'h2-hints'))).digest('hex') }))
}

export async function prepareGeoValidator() {
  // WHY：运行实例不装Go；直接编译既有CrowdSec/MMDB校验源码，不复制数据判据或放宽到期门。
  const target = path.join(directory, 'runtime/geoip-validator'), source = path.join(root, 'tests/geoip-calibration.go')
  await mkdir(target, { recursive: true })
  const executable = path.join(target, 'geoip-validator')
  wsl(['go', '-C', linuxPath(path.join(directory, 'runtime/crowdsec-909b5157986a2b2c2163300fdaef5ed01289f7d2')),
    'build', '-mod=readonly', '-trimpath', '-tags=sqlite_omit_load_extension', '-o', linuxPath(executable), linuxPath(source)], true)
  await writeFile(path.join(directory, 'geoip-validator.json'), JSON.stringify({ architecture: linuxArchitecture(),
    sourceSha256: createHash('sha256').update(await readFile(source)).digest('hex'),
    binarySha256: createHash('sha256').update(await readFile(executable)).digest('hex') }, null, 2))
}

async function nativeCrowdsec() {
  if (linuxArchitecture() !== 'arm64') return
  // WHY：上游 v1.8.1 release 只有 amd64；arm64 用同一固定源码原生构建 engine/cscli，禁止模拟。
  const base = linuxPath(directory), source = `${base}/runtime/crowdsec-909b5157986a2b2c2163300fdaef5ed01289f7d2`
  const release = `${base}/runtime/crowdsec/crowdsec-v1.8.1/cmd`
  for (const [target, entry] of [[`${release}/crowdsec/crowdsec`, './cmd/crowdsec'], [`${release}/crowdsec-cli/cscli`, './cmd/crowdsec-cli']]) {
    wsl(['go', '-C', source, 'build', '-tags=sqlite_omit_load_extension', '-o', target!, entry!], true)
  }
  await writeFile(path.join(directory, 'crowdsec-native.json'), JSON.stringify({ architecture: 'arm64',
    upstream: '909b5157986a2b2c2163300fdaef5ed01289f7d2',
    binaries: Object.fromEntries(await Promise.all(['crowdsec/crowdsec-v1.8.1/cmd/crowdsec/crowdsec',
      'crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli'].map(async file => [file,
      createHash('sha256').update(await readFile(path.join(directory, 'runtime', file))).digest('hex')]))) }, null, 2))
}
