#!/bin/sh
# Thin Linux entry: lifecycle remains in the existing lab.ts/systemd implementation.
set -eu
shield_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$(uname -m)" in x86_64) shield_arch=x64;; aarch64) shield_arch=arm64;; *) exit 2;; esac
export BAT_ANTIBOT_DATA="$shield_root/data"
export PATH="$shield_root/data/runtime/node/node-v24.9.0-linux-$shield_arch/bin:$PATH"
if ip link show shieldvz >/dev/null 2>&1; then export BAT_SHIELD_PRIVATE_INTERFACE=shieldvz; fi
exec "$shield_root/data/runtime/node/node-v24.9.0-linux-$shield_arch/bin/node" "$shield_root/program/lab.ts" "$@"
