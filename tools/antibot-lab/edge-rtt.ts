import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

export async function rttAdapterDigest(directory: string, candidate?: unknown) {
  const raw = candidate ?? JSON.parse(await readFile(path.join(directory, 'edge-h2.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '{}'
    throw error
  }))
  return z.object({ rttAdapterSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).parse(raw).rttAdapterSha256
}

// WHY：首跳在原TCP接入层测量并经原PROXY TLV传递，不能拿内层回环RTT替代。
export const rttProxyTlvs = ' set-proxy-v2-tlv-fmt(0xe2) %[fc_rtt(us)] set-proxy-v2-tlv-fmt(0xe3) %[fc_rttvar(us)]'

export const rttDirectives = `  http-request set-var(txn.transport_rtt_us) fc_pp_tlv(0xe2) if { fc_pp_tlv(0xe1) -m str 1 }
  http-request set-var(txn.transport_rttvar_us) fc_pp_tlv(0xe3) if { fc_pp_tlv(0xe1) -m str 1 }
  http-request set-var(txn.rtt_source) str(unavailable)
  http-request set-var(txn.rtt_source) str(first-hop-tcp) if { fc_pp_tlv(0xe1) -m str 1 } { var(txn.transport_rtt_us) -m int gt 0 }
  http-request set-var(txn.transport_rtt_us) fc_rtt(us) if { ssl_fc_alpn -m str h3 }
  http-request set-var(txn.transport_rttvar_us) fc_rttvar(us) if { ssl_fc_alpn -m str h3 }
  http-request set-var(txn.rtt_source) str(direct-quic) if { ssl_fc_alpn -m str h3 } { var(txn.transport_rtt_us) -m int gt 0 }
  http-request set-var(txn.tls_rtt_us) ssl_fc_bat_rtt unless { ssl_fc_alpn -m str h3 }
  http-request set-var(txn.tls_rtt_status) str(unavailable)
  http-request set-var(txn.tls_rtt_status) str(error) if { ssl_fc_bat_rtt_valid -m int eq -1 } !{ ssl_fc_alpn -m str h3 }
  http-request set-var(txn.tls_rtt_status) str(measured) if { var(txn.tls_rtt_us) -m int gt 0 }`

export const rttLogFields = '"transport_rtt_us":"%[var(txn.transport_rtt_us)]","transport_rttvar_us":"%[var(txn.transport_rttvar_us)]","rtt_source":"%[var(txn.rtt_source)]","tls_rtt_us":"%[var(txn.tls_rtt_us)]","tls_rtt_status":"%[var(txn.tls_rtt_status)]"'
