import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { directory, binaries, wsl } from './paths.ts'
import { rttAdapterDigest, rttProxyTlvs, rttDirectives, rttLogFields } from './edge-rtt.ts'

// WHY：原HAProxy/Lua采集ClientHello，原CrowdSec关联；只配置进程与字段，不复制指纹引擎。
export async function configureEdge(base: string, executable = binaries(base).haproxy, candidate?: unknown) {
  const h2Samples = executable.endsWith('/haproxy-h2/haproxy')
  const rttDigest = h2Samples ? await rttAdapterDigest(directory, candidate) : null
  if (rttDigest && rttDigest !== createHash('sha256').update(await readFile(new URL('./edge-ssl-rtt.c', import.meta.url))).digest('hex')) throw Error('edge_rtt_adapter_changed')
  // WHY：Windows localhost转发不承载UDP；只额外绑定当前WSL私网地址，原管理入口仍回环。
  const privateV4 = wsl(['hostname', '-I'], true).trim().split(/\s+/)
    .find(value => /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(value)
      && value.split('.').length === 4 && value.split('.').every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255))
  if (!privateV4) throw Error('owned_wsl_private_ipv4_unavailable')
  const certificate = Buffer.concat([await readFile(path.join(directory, 'tls/cert.pem')),
    await readFile(path.join(directory, 'tls/key.pem'))])
  await writeFile(path.join(directory, 'tls/edge.pem'), certificate, { mode: 0o600 })
  wsl(['chmod', '600', `${base}/tls/edge.pem`], true)
  await writeFile(path.join(directory, 'continuity.lua'), await readFile(new URL('./continuity.lua', import.meta.url)))
  const upstream = await readFile(path.join(directory, 'upstream/ja4-haproxy-v1.0.0.lua'), 'utf8')
  if (createHash('sha256').update(upstream).digest('hex') !== '7ecfa5d8c3e7e535ede667a67826f241d30249f9d703131bbfb13c75449a5f19') throw Error('ja4_upstream_changed')
  // WHY：候选复用OpenSSL原ALPN回调，兼容TLS分片/QUIC；原JA4算法不改。
  const needle = 'local alpn_value = txn.f:ssl_fc_alpn()'
  if (upstream.split(needle).length !== 2) throw Error('ja4_alpn_patch_changed')
  const adapted = '-- B-A-T modification: first advertised ALPN; original algorithm retained.\n'
    + upstream.replace(needle, h2Samples ? 'local alpn_value = txn.f:ssl_fc_bat_alpn()'
      : 'local alpn_value = txn:get_var("txn.advertised_alpn"); if not alpn_value or alpn_value == "" then alpn_value = txn.f:ssl_fc_alpn() end')
  await writeFile(path.join(directory, 'ja4-adapted.lua'), adapted)
  await writeFile(path.join(directory, 'ja4-adaptation.json'), JSON.stringify({ upstream: createHash('sha256').update(upstream).digest('hex'),
    adapted: createHash('sha256').update(adapted).digest('hex'), patch: 'ALPN source only; MPL retained' }))
  const config = `global
  nbthread 1
  log stdout len 16384 format raw local0
  tune.ssl.capture-buffer-size 4096
  tune.lua.bool-sample-conversion normal
  lua-load ${base}/ja4-adapted.lua raw
  lua-load ${base}/continuity.lua
defaults
  mode http
  log global
  timeout connect 5s
  timeout client 30s
  timeout server 30s
frontend owned_hello
  mode tcp
  no log
  bind 127.0.0.1:4183
  bind ${privateV4}:4183
  tcp-request inspect-delay 5s
  tcp-request content set-var(sess.advertised_alpn) req.ssl_alpn if { req.ssl_hello_type 1 }
  tcp-request content accept if { req.ssl_hello_type 1 }
  default_backend same_process_tls
backend same_process_tls
  mode tcp
  server terminate 127.0.0.1:4181 send-proxy-v2 set-proxy-v2-tlv-fmt(0xe0) %[var(sess.advertised_alpn)] set-proxy-v2-tlv-fmt(0xe1) 1${rttDigest ? rttProxyTlvs : ''}
frontend owned_tls
  bind 127.0.0.1:4181 accept-proxy ssl crt ${base}/tls/edge.pem alpn h2,http/1.1
  bind quic4@127.0.0.1:4183 ssl crt ${base}/tls/edge.pem alpn h3
  bind quic4@${privateV4}:4183 ssl crt ${base}/tls/edge.pem alpn h3
  http-request set-var(txn.advertised_alpn) fc_pp_tlv(0xe0)
  http-request lua.ja4
  http-request lua.bat_continuity
${rttDigest ? rttDirectives : ''}
${h2Samples ? `  http-request set-var(txn.h2_settings) fc.bat_h2_settings
  http-request set-var(txn.h2_settings) str(empty) if { fc.bat_h2_settings -m len 0 }
  http-request set-var(txn.h2_pseudo) fc.bat_h2_pseudo
  http-request set-var(txn.h2_window) fc.bat_h2_window
  http-request set-var(txn.h3_pseudo) fc.bat_h3_pseudo
  http-request set-var(txn.h2_case) path,field(3,/) if { path_reg ^/case/[a-f0-9-]{36}(/|$) }` : ''}
  http-request set-var(txn.ua) req.hdr(user-agent),sha2(256),hex,lower
  http-request set-var(txn.site) req.hdr(host),lower,field(1,:),sha2(256),hex,lower
  http-request set-var(txn.valid) var(txn.continuity_valid)
  http-request set-var(txn.valid) str(false) if { var(txn.ja4) -m sub _000000000000 }
  http-request set-var(txn.ja4_status) str(partial-alpn-negotiated)
  http-request set-var(txn.ja4_status) str(measured) if { fc_pp_tlv(0xe1) -m str 1 }
  http-request set-var(txn.ja4_status) str(partial-alpn-preread-missing) if { fc_pp_tlv(0xe1) -m str 1 } !{ var(txn.advertised_alpn) -m len gt 0 } { ssl_fc_alpn -m found }
${h2Samples ? `  http-request set-var(txn.ja4_status) str(measured) if { ssl_fc_bat_alpn -m found }
  http-request set-var(txn.ja4_status) str(partial-native-alpn-missing) unless { ssl_fc_bat_alpn -m found }` : ''}
  http-request set-var(txn.ja4_status) str(error) if { var(txn.valid) -m str false }
  http-request set-log-level silent unless { path_beg /case/ }
  http-response set-header Alt-Svc 'h3=":4183"; ma=60'
${h2Samples ? `  http-response set-var(txn.h3_settings) fc.bat_h3_settings
  http-response set-var(txn.quic_params) fc.bat_quic_params
  http-response set-var(txn.quic_shape) fc.bat_quic_shape
  http-response set-var(txn.h3_settings) str(empty) if { fc.bat_h3_settings -m len 0 }` : ''}
  log-format '{${rttDigest ? rttLogFields + ',' : ''}"at":"%[date,utime(%Y-%m-%dT%H:%M:%SZ)]","source_ip":"%ci","site":"%[var(txn.site)]","session":"%[var(txn.site)]","category":"transport","valid":"%[var(txn.valid)]","ua":"%[var(txn.ua)]","transport":"%[var(txn.ja4),bytes(0,1)]","tls_family":"%[var(txn.continuity)]","ja4":"%[var(txn.ja4)]","ja4_status":"%[var(txn.ja4_status)]","resumed":"%[ssl_fc_is_resumed]","status":"%ST","h2_case":"%[var(txn.h2_case)]","h2_settings":"%[var(txn.h2_settings)]","h2_pseudo":"%[var(txn.h2_pseudo)]","h2_window":"%[var(txn.h2_window)]","h3_settings":"%[var(txn.h3_settings)]","h3_pseudo":"%[var(txn.h3_pseudo)]","quic_params":"%[var(txn.quic_params)]","quic_shape":"%[var(txn.quic_shape)]","alpn":"%[ssl_fc_alpn]"}'
  default_backend full_shield
backend full_shield
  server gateway 127.0.0.1:4182 ssl verify required ca-file ${base}/tls/cert.pem sni str(localhost) alpn h2,http/1.1 send-proxy-v2 source 127.0.0.2
`
  await writeFile(path.join(directory, 'haproxy.cfg'), config)
  await writeFile(path.join(directory, 'logs/tls.jsonl'), '', { flag: 'a' })
  wsl([executable, '-c', '-f', `${base}/haproxy.cfg`], true)
  await writeFile(path.join(directory, 'edge-endpoint.json'), JSON.stringify({ address: privateV4, port: 4183,
    scope: 'wsl-private-full-shield', personalDnsChanged: false }))
}
