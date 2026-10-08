import { cp, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { directory, hubCommit, pluginModule } from "./paths.ts"

export async function configure(base: string, checkout: string, secrets: { bouncer: string; master: string }) {
  const config = `${base}/config`
  for (const folder of ["config", "config/acquis.d", "config/appsec-configs", "data", "logs", "reports"]) {
    await mkdir(path.join(directory, folder), { recursive: true })
  }
  await cp(path.join(directory, "runtime/crowdsec/crowdsec-v1.8.1/config"), path.join(directory, "config"), { recursive: true, force: false })
  const save = async (file: string, value: unknown) => writeFile(path.join(directory, file), JSON.stringify(value, null, 2))
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
  await writeFile(path.join(directory, "config/acquis.yaml"), [
    `source: appsec\nlisten_addr: 127.0.0.1:7422\nappsec_configs:\n  - crowdsecurity/appsec-default\n  - crowdsecurity/appsec-bot-*\n  - bat-lab/signing\nlabels:\n  type: appsec`,
    `source: file\nfilenames:\n  - ${base}/logs/access.jsonl\nlabels:\n  type: traefik`,
  ].join("\n---\n") + "\n")
  await save("config/appsec-configs/bat-lab-signing.yaml", { name: "bat-lab/signing", challenge: { master_secret: secrets.master } })
  await writeFile(path.join(directory, "bouncer.key"), secrets.bouncer, { mode: 0o600 })
  await save("traefik.yaml", {
    global: { checkNewVersion: false, sendAnonymousUsage: false },
    entryPoints: { web: { address: "127.0.0.1:4187" } },
    providers: { file: { filename: `${base}/routes.yaml`, watch: false } },
    experimental: { localPlugins: { bouncer: { moduleName: pluginModule } } },
    log: { level: "INFO", filePath: `${base}/logs/gateway.log` },
    accessLog: { filePath: `${base}/logs/access.jsonl`, format: "json", bufferingSize: 0,
      fields: { defaultMode: "drop", names: { ClientHost: "keep", ClientAddr: "keep", RequestAddr: "keep", RequestHost: "keep", RequestPort: "keep", RequestMethod: "keep", RequestPath: "keep", RequestProtocol: "keep", DownstreamStatus: "keep", DownstreamContentSize: "keep", OriginStatus: "keep", StartUTC: "keep", Duration: "keep", ServiceName: "keep", ServiceAddr: "keep", RouterName: "keep" }, headers: { defaultMode: "drop", names: { "User-Agent": "keep" } } } },
  })
  await save("routes.yaml", { http: {
    routers: { site: { rule: "PathPrefix(`/`)", entryPoints: ["web"], middlewares: ["crowdsec", "origin-auth"], service: "site" } },
    services: { site: { loadBalancer: { servers: [{ url: "http://127.0.0.1:4189" }] } } },
    middlewares: { crowdsec: { plugin: { bouncer: { enabled: true, crowdsecMode: "live", logLevel: "INFO",
      crowdsecLapiHost: "127.0.0.1:7423", crowdsecLapiKeyFile: `${base}/bouncer.key`, crowdsecAppsecEnabled: true,
      crowdsecAppsecHost: "127.0.0.1:7422", crowdsecAppsecFailureBlock: true, crowdsecAppsecUnreachableBlock: true,
      crowdsecAppsecUnreadableBodyBlock: true, crowdsecAppsecBodyLimit: 10485760, clientTrustedIps: [], forwardedHeadersTrustedIps: [],
    } } }, "origin-auth": { headers: { customRequestHeaders: { "X-Bat-Lab-Origin": secrets.bouncer } } } },
  } })
  await save("environment.json", { base, checkout, publicOrigin: "http://127.0.0.1:4187", managementOrigin: "http://127.0.0.1:4188" })
}
