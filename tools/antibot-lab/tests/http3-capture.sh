#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.."
base="$PWD/work/antibot-service"
out="$base/reports/http3-$(date +%s)"
mkdir "$out"
capture_pid=''
finish() {
  if [[ -n "$capture_pid" ]] && kill -0 "$capture_pid" 2>/dev/null; then
    # Capture owns a 15-second/4-MB bound; wait for its native exit even on client failure.
    wait "$capture_pid" || true
  fi
}
trap finish EXIT
printf '{"purpose":"owned-loopback-http3-measurement","browserCreated":false,"modelCalls":0}\n' > "$out/owner.json"
tshark -i lo -f 'udp port 4185' -a duration:15 -a filesize:4096 -w "$out/client.pcapng" > "$out/capture.log" 2>&1 &
capture_pid=$!
sleep 1
"$base/runtime/quic-tools/client" -q -insecure -keylog "$out/keys.log" \
  "https://localhost:4185/measurement/read?quic=1" \
  "https://localhost:4185/measurement/read?quic=2" \
  "https://localhost:4185/measurement/read?quic=3" > "$out/client.log" 2>&1
wait "$capture_pid"
capture_pid=''
tshark -r "$out/client.pcapng" -o "tls.keylog_file:$out/keys.log" -Y 'quic || http3' -T json > "$out/decoded.json" 2> "$out/decode.log"
tshark -r "$out/client.pcapng" -o "tls.keylog_file:$out/keys.log" -T fields \
  -e frame.number -e quic.version -e tls.handshake.extensions_alpn_str -e tls.handshake.ja4 \
  -e http3.settings.id -e http3.headers.path -e http3.headers.status > "$out/measurement.tsv" 2>> "$out/decode.log"
printf '%s\n' "$out"
