import { isIPv4 } from 'node:net'
import { wsl } from './paths.ts'

export function privateLinuxAddress() {
  const network = process.env.BAT_SHIELD_PRIVATE_INTERFACE
  if (network && !/^[a-zA-Z0-9_-]{1,15}$/.test(network)) throw Error('private_interface_invalid')
  // WHY：Lima 明确选择 vzNAT 的接口，不能把默认 user-network 地址当宿主可达地址。
  const values: string[] = network
    ? JSON.parse(wsl(['ip', '-4', '-j', 'addr', 'show', 'dev', network], true))
      .flatMap((row: { addr_info: Array<{ local: string }> }) => row.addr_info.map(item => item.local))
    : wsl(['hostname', '-I'], true).trim().split(/\s+/)
  const value = values.find(value => isIPv4(value) && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(value))
  if (!value) throw Error('owned_linux_private_ipv4_unavailable')
  return value
}
