import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
export const directory = path.join(root, "work/antibot-service")
export const hubCommit = "f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0"
export const pluginCommit = "710e88808baccb320d7b2b3560397e1474e3e98b"
export const pluginModule = "github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin"
export const units = ["bat-antibot-engine", "bat-antibot-origin", "bat-antibot-gateway"]
export function linuxPath(value: string) {
  return execFileSync("wsl", ["-d", "Ubuntu", "--exec", "wslpath", "-a", value.replaceAll("\\", "/")], { cwd: root, encoding: "utf8" }).trim()
}
export function wsl(args: string[], quiet = false) {
  return execFileSync("wsl", ["-d", "Ubuntu", "--exec", ...args], {
    cwd: root, encoding: "utf8", stdio: quiet ? "pipe" : "inherit", timeout: 120_000,
  })
}
export function binaries(base: string) {
  const runtime = `${base}/runtime`
  return {
    crowdsec: `${runtime}/crowdsec/crowdsec-v1.8.1/cmd/crowdsec/crowdsec`,
    cscli: `${runtime}/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli`,
    traefik: `${runtime}/traefik/traefik`,
    node: `${runtime}/node/node-v24.9.0-linux-x64/bin/node`,
  }
}
