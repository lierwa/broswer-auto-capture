import path from "node:path"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

import { root, directory } from './locations.mjs'
export { root, directory } from './locations.mjs'
export const hubCommit = "f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0"
export const pluginCommit = "710e88808baccb320d7b2b3560397e1474e3e98b"
export const pluginModule = "github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin"
export const units = ["bat-antibot-engine", "bat-antibot-origin", "bat-antibot-gateway", "bat-antibot-edge", "bat-antibot-h2"]
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
  // WHY：只有显式验过并激活的固定构建可替换原release；不因临时构建文件出现自动切换。
  const receipt = path.join(directory, 'persistent-engine.json')
  const persistent = existsSync(receipt) ? JSON.parse(readFileSync(receipt, 'utf8')) : null
  if (persistent && (persistent.upstream !== '909b5157986a2b2c2163300fdaef5ed01289f7d2'
    || !/^[a-f0-9]{64}$/.test(persistent.binarySha256))) throw Error('persistent_engine_receipt_invalid')
  const edgeReceipt = path.join(directory, 'edge-h2.json')
  const edge = existsSync(edgeReceipt) ? JSON.parse(readFileSync(edgeReceipt, 'utf8')) : null
  if (edge && (edge.upstream !== '3.2.9-1ubuntu2.2' || createHash('sha256')
    .update(readFileSync(path.join(directory, 'runtime/haproxy-h2/haproxy'))).digest('hex') !== edge.binarySha256))
    throw Error('edge_h2_binary_changed')
  return {
    crowdsec: persistent ? `${runtime}/crowdsec-persistent/crowdsec` : `${runtime}/crowdsec/crowdsec-v1.8.1/cmd/crowdsec/crowdsec`,
    cscli: `${runtime}/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli`,
    traefik: `${runtime}/traefik/traefik`,
    node: `${runtime}/node/node-v24.9.0-linux-x64/bin/node`,
    haproxy: edge ? `${runtime}/haproxy-h2/haproxy` : `${runtime}/haproxy/usr/sbin/haproxy`,
  }
}
