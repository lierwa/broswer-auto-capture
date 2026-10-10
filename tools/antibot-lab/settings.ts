import { cp, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { binaries, directory, hubCommit, pluginModule } from "./paths.ts"
import { configureTls } from "./tls.ts"
import { configureEdge } from './edge.ts'
import { parser, rules } from "./rules.ts"

export async function configure(base: string, checkout: string, secrets: { bouncer: string; master: string }) {
  const config = `${base}/config`
  const certificate = await configureTls(base)
  for (const folder of ["config", "config/acquis.d", "config/appsec-configs", "config/parsers/s01-parse", "config/scenarios", "data", "logs", "reports"]) {
    await mkdir(path.join(directory, folder), { recursive: true })
  }
  await cp(path.join(directory, "runtime/crowdsec/crowdsec-v1.8.1/config"), path.join(directory, "config"), { recursive: true, force: false })
  const save = async (file: string, value: unknown) => writeFile(path.join(directory, file), JSON.stringify(value, null, 2))
  await save("config/parsers/s01-parse/bat-observation.yaml", parser)
  for (const rule of rules) await save(`config/scenarios/${rule.name.replace('/', '-')}.yaml`, rule)
  await writeFile(path.join(directory, "logs/observations.jsonl"), "", { flag: "a" })
  await save("config/config.yaml", {
    common: { daemonize: false, log_media: "file", log_level: "info", log_dir: `${base}/logs`, log_max_size: 10, log_max_files: 3, compress_logs: true },
    config_paths: { config_dir: config, data_dir: `${base}/data`, simulation_path: `${config}/simulation.yaml`,
      hub_dir: `${base}/runtime/hub/hub-${hubCommit}`, index_path: `${base}/runtime/hub/hub-${hubCommit}/.index.json`,
      notification_dir: `${config}/notifications`, plugin_dir: `${config}/plugins` },
    crowdsec_service: { acquisition_path: `${config}/acquis.yaml`, acquisition_dir: `${config}/acquis.d`, parser_routines: 1 },
    cscli: { output: "human", color: "no", hub_branch: hubCommit },
    db_config: { type: "sqlite", db_path: `${base}/data/crowdsec.db`, log_level: "info", flush: { max_items: 5000, max_age: "7d" } },
    api: { client: { credentials_path: `${config}/lab-local-api.yaml` }, server: {
      listen_uri: "127.0.0.1:7423", profiles_path: `${config}/profiles.yaml`, console_path: `${config}/console.yaml`,
      trusted_ips: ["127.0.0.1", "::1"], // WHY：仅 LAPI 管理认证；不是 AppSec 客户端放行表。
    } },
    prometheus: { enabled: true, level: "full", listen_addr: "127.0.0.1", listen_port: 7424 },
  })
  await save("config/console.yaml", { share_manual_decisions: false, share_tainted: false, share_custom: false, share_context: false, console_management: false })
  // 复用官方历史决策表达式，限定自有实验规则；不重造历史数据库/图风控。
  await writeFile(path.join(directory, "config/profiles.yaml"), [
    { name: 'bat_lab_recidivism', filters: ["Alert.Remediation == true && Alert.GetScope() == 'Ip' && Alert.GetScenario() startsWith 'bat-lab/'"],
      decisions: [{ type: 'ban', duration: '4h' }], duration_expr: "Sprintf('%dh', (GetDecisionsSinceCount(Alert.GetValue(), '168h') + 1) * 4)", on_success: 'break' },
    { name: 'default_ip_remediation', filters: ["Alert.Remediation == true && Alert.GetScope() == 'Ip'"], decisions: [{ type: 'ban', duration: '4h' }], on_success: 'break' },
    { name: 'default_range_remediation', filters: ["Alert.Remediation == true && Alert.GetScope() == 'Range'"], decisions: [{ type: 'ban', duration: '4h' }], on_success: 'break' },
  ].map(value => JSON.stringify(value)).join('\n---\n'))
  await writeFile(path.join(directory, "config/acquis.yaml"), [
    `source: appsec\nlisten_addr: 127.0.0.1:7422\nappsec_configs:\n  - crowdsecurity/appsec-default\n  - crowdsecurity/appsec-bot-*\n  - bat-lab/signing\nlabels:\n  type: appsec`,
    `source: file\nfilenames:\n  - ${base}/logs/access.jsonl\nlabels:\n  type: traefik`,
    `source: file\nfilenames:\n  - ${base}/logs/observations.jsonl\nlabels:\n  type: bat-lab`,
    `source: file\nfilenames:\n  - ${base}/logs/tls.jsonl\nlabels:\n  type: bat-lab`,
  ].join("\n---\n") + "\n")
  await save("config/appsec-configs/bat-lab-signing.yaml", { name: "bat-lab/signing", challenge: { master_secret: secrets.master,
    ...(binaries(base).crowdsec.endsWith('/crowdsec-persistent/crowdsec') ? { spent_set_db: `${base}/data/challenge-spent.sqlite` } : {}) } })
  await writeFile(path.join(directory, "bouncer.key"), secrets.bouncer, { mode: 0o600 })
  await save("traefik.yaml", {
    global: { checkNewVersion: false, sendAnonymousUsage: false },
    entryPoints: { web: { address: "127.0.0.1:4187" }, secure: { address: "127.0.0.1:4186", http3: {} },
      observation: { address: "127.0.0.1:4185", http3: {} }, rate: { address: "127.0.0.1:4184" },
      // WHY：仅传输层PROXY来源，不是机器人豁免；其他入口仍不信任转发头。
      edge: { address: '127.0.0.1:4182', proxyProtocol: { trustedIPs: ['127.0.0.2/32'] } } },
    providers: { file: { filename: `${base}/routes.yaml`, watch: false } },
    experimental: { localPlugins: { bouncer: { moduleName: pluginModule } } },
    log: { level: "INFO", filePath: `${base}/logs/gateway.log` },
    accessLog: { filePath: `${base}/logs/access.jsonl`, format: "json", bufferingSize: 0,
      fields: { defaultMode: "drop", names: { ClientHost: "keep", ClientAddr: "keep", RequestAddr: "keep", RequestHost: "keep", RequestPort: "keep", RequestMethod: "keep", RequestPath: "keep", RequestProtocol: "keep", DownstreamStatus: "keep", DownstreamContentSize: "keep", OriginStatus: "keep", StartUTC: "keep", Duration: "keep", ServiceName: "keep", ServiceAddr: "keep", RouterName: "keep" }, headers: { defaultMode: "drop", names: { "User-Agent": "keep" } } } },
  })
  await save("routes.yaml", { tls: { certificates: [certificate] }, http: {
    routers: { site: { rule: "PathPrefix(`/`)", entryPoints: ["web"], middlewares: ["crowdsec", "origin-auth"], service: "site" },
      secure: { rule: "PathPrefix(`/`)", entryPoints: ["secure"], tls: {}, middlewares: ["crowdsec", "origin-auth"], service: "site" },
      edge: { rule: "PathPrefix(`/`)", entryPoints: ["edge"], tls: {}, middlewares: ["crowdsec", "origin-auth"], service: "site" },
      // WHY：单独端口只定位原始协议，不能把绕过前置挑战的观测结果算组合放行。
      observation: { rule: "PathPrefix(`/measurement`)", entryPoints: ["observation"], tls: {}, middlewares: ["origin-auth"], service: "site" },
      rate: { rule: "PathPrefix(`/case/`)", entryPoints: ["rate"], middlewares: ["rate-only", "origin-auth"], service: "site" } },
    services: { site: { loadBalancer: { servers: [{ url: "http://127.0.0.1:4189" }] } } },
    // WHY：上游 live 默认缓存“未封禁”60秒；本地明确使用1秒，使新决策及时进入处置。
    middlewares: { crowdsec: { plugin: { bouncer: { enabled: true, crowdsecMode: "live", logLevel: "INFO", defaultDecisionSeconds: 1,
      crowdsecLapiHost: "127.0.0.1:7423", crowdsecLapiKeyFile: `${base}/bouncer.key`, crowdsecAppsecEnabled: true,
      crowdsecAppsecHost: "127.0.0.1:7422", crowdsecAppsecFailureBlock: true, crowdsecAppsecUnreachableBlock: true,
      crowdsecAppsecUnreadableBodyBlock: true, crowdsecAppsecBodyLimit: 10485760, clientTrustedIps: [], forwardedHeadersTrustedIps: [],
    } } }, "rate-only": { plugin: { bouncer: { enabled: true, crowdsecMode: "live", logLevel: "INFO", defaultDecisionSeconds: 1,
      crowdsecLapiHost: "127.0.0.1:7423", crowdsecLapiKeyFile: `${base}/bouncer.key`, crowdsecAppsecEnabled: false,
      clientTrustedIps: [], forwardedHeadersTrustedIps: [],
    } } }, "origin-auth": { headers: { customRequestHeaders: { "X-Bat-Lab-Origin": secrets.bouncer } } } },
  } })
  await save("environment.json", { base, checkout, publicOrigin: "http://127.0.0.1:4187", secureOrigin: "https://localhost:4186", managementOrigin: "http://127.0.0.1:4188" })
  await configureEdge(base)
}
