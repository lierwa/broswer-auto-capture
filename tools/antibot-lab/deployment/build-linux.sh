#!/bin/sh
# Build recipe only. Existing prepare scripts own source patches; this never starts services.
set -eu
shield_source=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$shield_source"
test "$(uname -s)" = Linux
test -n "${BAT_ANTIBOT_DATA:-}"
case "$BAT_ANTIBOT_DATA" in /*) ;; *) echo 'absolute_build_data_required' >&2; exit 2;; esac
case "$(uname -m)" in x86_64) shield_arch=x64;; aarch64) shield_arch=arm64;; *) exit 2;; esac
for shield_tool in python3 curl go gcc make patch dpkg-deb; do command -v "$shield_tool" >/dev/null; done
for shield_unit in engine origin gateway edge h2 window-test; do
  shield_state=$(systemctl --user show "bat-antibot-$shield_unit.service" --property=ActiveState --value)
  case "$shield_state" in ''|inactive|failed) ;; *) echo 'stop_services_before_native_build' >&2; exit 2;; esac
done
# An empty build directory is required; no adoption of service instances or prior personal data.
test ! -e "$BAT_ANTIBOT_DATA"
mkdir -m 700 "$BAT_ANTIBOT_DATA"
python3 - "$shield_source" "$BAT_ANTIBOT_DATA" <<'PY'
import json,pathlib,sys
pathlib.Path(sys.argv[2], 'build-owner.json').write_text(json.dumps({'purpose':'shield-native-package-build','source':sys.argv[1],'directory':sys.argv[2]}))
PY
# Bootstrap the same pinned official Node archive that prepare will distribute.
python3 - "$shield_source" "$BAT_ANTIBOT_DATA" "$shield_arch" <<'PY'
import hashlib,json,pathlib,subprocess,sys,tarfile
root,base=map(pathlib.Path,sys.argv[1:3]); arch=sys.argv[3]
rows=json.loads((root/('artifacts-arm64.json' if arch=='arm64' else 'artifacts.json')).read_text())
row=next(r for r in rows if r['name']=='node.tar.xz')
archive=base/'upstream/node.tar.xz'; archive.parent.mkdir()
subprocess.run(['curl','--fail','--location','--max-time','180','--output',str(archive),row['url']],check=True)
assert hashlib.sha256(archive.read_bytes()).hexdigest()==row['sha256'], 'node_archive_changed'
target=base/'runtime/node'; target.mkdir(parents=True)
with tarfile.open(archive) as stream: stream.extractall(target,filter='data')
PY
export PATH="$BAT_ANTIBOT_DATA/runtime/node/node-v24.9.0-linux-$shield_arch/bin:$PATH"
npm ci --workspaces=false --ignore-scripts --no-audit --no-fund
node lab.ts prepare
python3 prepare-persistent-engine.py
python3 prepare-edge-h2.py
# Select these exact build receipts for packaging; initialize regenerates per-install configuration.
cp "$BAT_ANTIBOT_DATA/runtime/crowdsec-persistent/manifest.json" "$BAT_ANTIBOT_DATA/persistent-engine.json"
cp "$BAT_ANTIBOT_DATA/runtime/haproxy-h2/candidate.json" "$BAT_ANTIBOT_DATA/edge-h2.json"
mkdir -p "$BAT_ANTIBOT_DATA/runtime/creep-build"
cp tests/dependencies/creep-build/package.json tests/dependencies/creep-build/package-lock.json "$BAT_ANTIBOT_DATA/runtime/creep-build/"
npm --prefix "$BAT_ANTIBOT_DATA/runtime/creep-build" ci --ignore-scripts --no-audit --no-fund
node tests/build-creep.mjs
node tests/build-creep.mjs --workers
node tests/build-creep.mjs --devices
node tests/build-input.mjs
python3 prepare-geodata.py
node lab.ts refresh-source-data
node runtime-release.ts "$BAT_ANTIBOT_DATA/releases"
printf 'Build data retained with build-owner.json: %s\n' "$BAT_ANTIBOT_DATA"
